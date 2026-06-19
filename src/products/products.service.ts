import { Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import {
  DateRangeDto,
  getQuarterDateRange,
  resolvePreviousPeriod,
  formatCurrency,
  getStockStatus,
} from 'src/common/dto/date-range.dto';
import { AuthenticatedUser } from 'src/auth/auth.types';
import { PrismaService } from 'src/prisma/prisma.service';

@Injectable()
export class ProductsService {
  private readonly logger = new Logger(PrismaService.name);
  constructor(private prisma: PrismaService) {}

  // Get KPIs Products
  async getKpisProducts(user: AuthenticatedUser, dateRangeDto: DateRangeDto) {
    const range = getQuarterDateRange(dateRangeDto);
    const prevRange = resolvePreviousPeriod(range);

    const queryFilterRegion = user.region_id
      ? Prisma.sql`AND region_id = CAST(${user.region_id} AS UUID)`
      : Prisma.empty;

    const [
      skuActive,
      skuNewThisPeriod,
      currentUnitsSoldRows,
      prevUnitsSoldRows,
      stockRows,
      lowStockCount,
      ratingRows,
    ] = await Promise.all([
      // Total SKU aktif saat ini
      this.prisma.product.count({
        where: { is_active: true },
      }),

      // SKU baru dalam periode ini
      this.prisma.product.count({
        where: {
          is_active: true,
          last_stock_date: range,
        },
      }),

      // Units terjual per produk dalam periode sekarang
      this.prisma.$queryRaw<{ product_id: string; units_sold: number }[]>`
         SELECT
            oi.product_id,
            SUM(oi.quantity)::INT AS units_sold
         FROM order_items oi
         JOIN orders o ON o.id = oi.order_id
         WHERE
            o.ordered_at BETWEEN ${range.gte} AND ${range.lte}
            AND o.status != 'returned'
            ${queryFilterRegion}
         GROUP BY oi.product_id
        `,

      // Units terjual per produk dalam periode sebelumnya
      this.prisma.$queryRaw<{ product_id: string; units_sold: number }[]>`
         SELECT
            oi.product_id,
            SUM(oi.quantity)::INT AS units_sold
         FROM order_items oi
         JOIN orders o ON o.id = oi.order_id
         WHERE
            o.ordered_at BETWEEN ${prevRange.gte} AND ${prevRange.lte}
            AND o.status != 'returned'
            ${queryFilterRegion}
         GROUP BY oi.product_id
        `,

      // Stock saat ini semua produk aktif
      this.prisma.product.findMany({
        where: { is_active: true },
        select: { id: true, stock_quantity: true },
      }),

      // Jumlah produk low stock
      this.prisma.product.count({
        where: {
          is_active: true,
          stock_quantity: { gt: 0, lt: 20 },
        },
      }),

      // Rating semua produk aktif (untuk weighted average)
      this.prisma.product.findMany({
        where: { is_active: true },
        select: { rating: true, total_reviews: true },
      }),
    ]);

    const currentSoldMap: Record<string, number> = {};
    for (const row of currentUnitsSoldRows) {
      currentSoldMap[row.product_id] = Number(row.units_sold);
    }

    const prevSoldMap: Record<string, number> = {};
    for (const row of prevUnitsSoldRows) {
      prevSoldMap[row.product_id] = Number(row.units_sold);
    }

    const stockMap: Record<string, number> = {};
    for (const row of stockRows) {
      stockMap[row.id] = row.stock_quantity;
    }

    const currentSellThroughRates: number[] = [];
    for (const [productId, unitsSold] of Object.entries(currentSoldMap)) {
      const stockNow = stockMap[productId] ?? 0;
      const denominator = unitsSold + stockNow;
      if (denominator > 0) {
        currentSellThroughRates.push(unitsSold / denominator);
      }
    }

    const prevSellThroughRates: number[] = [];
    for (const [productId, unitsSold] of Object.entries(prevSoldMap)) {
      const stockNow = stockMap[productId] ?? 0;
      const denominator = unitsSold + stockNow;
      if (denominator > 0) {
        prevSellThroughRates.push(unitsSold / denominator);
      }
    }

    const currentAvgSellThrough =
      currentSellThroughRates.length > 0
        ? currentSellThroughRates.reduce((sum, r) => sum + r, 0) /
          currentSellThroughRates.length
        : 0;

    const prevAvgSellThrough =
      prevSellThroughRates.length > 0
        ? prevSellThroughRates.reduce((sum, r) => sum + r, 0) /
          prevSellThroughRates.length
        : 0;

    let totalWeightedRating = 0;
    let totalReviews = 0;
    for (const p of ratingRows) {
      const r = Number(p.rating);
      const n = p.total_reviews;
      if (n > 0) {
        totalWeightedRating += r * n;
        totalReviews += n;
      }
    }
    const weightedAvgRating =
      totalReviews > 0 ? totalWeightedRating / totalReviews : 0;

    const pctChange = (curr: number, prev: number) =>
      prev !== 0 ? ((curr - prev) / Math.abs(prev)) * 100 : 0;

    return {
      period: range,
      total_skus_active: {
        value: skuActive,
        formatted: skuActive,
        delta: `${skuNewThisPeriod > 0 ? `+${skuNewThisPeriod} new this period` : 'No new Stock this periond'}`,
        trend: skuNewThisPeriod > 0 ? 'up' : 'down',
        is_negative_metric: false, // flag untuk frontend
      },
      sell_through_rate: {
        value: parseFloat((currentAvgSellThrough * 100).toFixed(1)),
        formatted: `${(currentAvgSellThrough * 100).toFixed(1)}%`,
        delta: pctChange(currentAvgSellThrough, prevAvgSellThrough),
        trend: skuNewThisPeriod > 0 ? 'up' : 'down',
        is_negative_metric: false,
      },
      low_stock_alerts: {
        value: lowStockCount,
        formatted: `${lowStockCount} SKUs`,
        delta: '',
        trend: lowStockCount > 0 ? 'up' : 'down',
        is_negative_metric: true,
      },
      avg_product_rating: {
        value: parseFloat(weightedAvgRating.toFixed(2)),
        formatted: `${weightedAvgRating.toFixed(1)} / 5`,
        delta: '',
        trend: parseFloat(weightedAvgRating.toFixed(1)) > 3.2 ? 'up' : 'down',
        is_negative_metric: false,
      },
    };
  }

  async getTopProducts(user: AuthenticatedUser, dateRangeDto: DateRangeDto) {
    const range = getQuarterDateRange(dateRangeDto);
    const prevRange = resolvePreviousPeriod(range);

    const queryFilterRegion = user.region_id
      ? Prisma.sql`AND o.region_id = CAST(${user.region_id} AS UUID)`
      : Prisma.empty;

    const topProducts = await this.prisma.$queryRaw<
      {
        id: string;
        name: number;
        current_revenue: number;
        revenue_share: number;
        previous_revenue: number;
        growth_percentage: number;
      }[]
    >`
      WITH current_period AS (
        SELECT
          p.id,
          p.name,
          SUM(oi.subtotal) AS current_revenue,
          ROUND(
            (
              SUM(oi.subtotal) / SUM(SUM(oi.subtotal)) OVER ()
            ) * 100,
            2
          ) AS revenue_share
        FROM order_items oi
        JOIN orders o ON o.id = oi.order_id
        JOIN products p ON p.id = oi.product_id
        WHERE
          o.ordered_at BETWEEN ${range.gte} AND ${range.lte}
          AND o.status != 'returned'
          ${queryFilterRegion}
        GROUP BY p.id, p.name
      ),
      previous_period AS (
        SELECT
          p.id,
          p.name,
          SUM(oi.subtotal) AS previous_revenue
        FROM order_items oi
        JOIN orders o ON o.id = oi.order_id
        JOIN products p ON p.id = oi.product_id
        WHERE
          o.ordered_at BETWEEN ${prevRange.gte} AND ${prevRange.lte}
          AND o.status != 'returned'
          ${queryFilterRegion}
        GROUP BY p.id, p.name
      )
        SELECT
          cp.id,
          cp.name,
          cp.current_revenue,
          cp.revenue_share,
          COALESCE(pp.previous_revenue, 0) AS previous_revenue,
          CASE
            WHEN COALESCE(pp.previous_revenue, 0) = 0
            THEN NULL
            ELSE ROUND(
              (
                (cp.current_revenue - pp.previous_revenue) / pp.previous_revenue
              ) * 100,
              2
            )
          END AS growth_percentage
        FROM current_period cp
        LEFT JOIN previous_period pp ON pp.id = cp.id
        ORDER BY cp.current_revenue DESC
        LIMIT 6
    `;

    return {
      period: range,
      topProducts,
      topRevenue: topProducts[0].revenue_share,
    };
  }

  async getMatrixProducts(user: AuthenticatedUser, dateRangeDto: DateRangeDto) {
    const range = getQuarterDateRange(dateRangeDto);
    const prevRange = resolvePreviousPeriod(range);

    const queryFilterRegion = user.region_id
      ? Prisma.sql`AND region_id = CAST(${user.region_id} AS UUID)`
      : Prisma.empty;

    const matrixProducts = await this.prisma.$queryRaw<
      {
        id: string;
        name: string;
        sku: string;
        stock_quantity: number;
        category_name: string;
        revenue: number;
        units_sold: number;
        current_month_revenue: number;
        prev_month_revenue: number;
        mom_delta: number;
      }[]
    >`
      WITH range_revenue AS (
        SELECT
          oi.product_id,
          SUM(oi.subtotal) AS revenue,
          SUM(oi.quantity) AS units_sold
        FROM order_items oi
        JOIN orders o ON o.id = oi.order_id
        WHERE
          o.ordered_at BETWEEN ${range.gte} AND ${range.lte}
          AND o.status != 'returned'
          ${queryFilterRegion}
        GROUP BY oi.product_id
      ),
      current_month AS (
        SELECT
          oi.product_id,
          SUM(oi.subtotal) AS revenue
        FROM order_items oi
        JOIN orders o ON o.id = oi.order_id
        WHERE
          o.ordered_at BETWEEN ${range.gte} AND ${range.lte}
          AND o.status != 'returned'
          ${queryFilterRegion}
        GROUP BY oi.product_id
      ),
      previous_month AS (
        SELECT
          oi.product_id,
          SUM(oi.subtotal) AS revenue
        FROM order_items oi
        JOIN orders o ON o.id = oi.order_id
        WHERE
          o.ordered_at BETWEEN ${prevRange.gte} AND ${prevRange.lte}
          AND o.status != 'returned'
          ${queryFilterRegion}
        GROUP BY oi.product_id
      )
      SELECT
        p.id,
        p.name,
        p.sku,
        p.stock_quantity,
        c.name AS category_name,
        COALESCE(rr.revenue, 0) AS revenue,
        COALESCE(rr.units_sold, 0) AS units_sold,
        COALESCE(cm.revenue, 0) AS current_month_revenue,
        COALESCE(pm.revenue, 0) AS prev_month_revenue,
        CASE
          WHEN COALESCE(pm.revenue, 0) = 0 AND COALESCE(cm.revenue, 0) > 0 THEN 100
          WHEN COALESCE(pm.revenue, 0) = 0 THEN 0
          ELSE ROUND(
            (
              COALESCE(cm.revenue, 0) - pm.revenue
            ) / pm.revenue * 100,
            1
          )
        END AS mom_delta
      FROM products p
      JOIN categories c ON c.id = p.category_id
      INNER JOIN range_revenue rr ON rr.product_id = p.id
      LEFT JOIN current_month cm ON cm.product_id = p.id
      LEFT JOIN previous_month pm ON pm.product_id = p.id
      WHERE p.is_active = true
      ORDER BY revenue DESC
    `;

    const calcMedian = (numbers: number[]) => {
      if (!numbers.length) return 0;
      const sorted = [...numbers].sort((a, b) => a - b);
      const mid = Math.floor(sorted.length / 2);
      return sorted.length % 2 !== 0
        ? sorted[mid]
        : (sorted[mid - 1] + sorted[mid]) / 2;
    };

    const classifyProduct = (
      revenue: number,
      momDelta: number,
      medianRevenue: number,
    ): string => {
      const isHighRevenue = revenue >= medianRevenue;
      const isPositiveMoM = momDelta > 0;
      const isRisingFast = momDelta >= 15;
      const isStable = Math.abs(momDelta) < 5;

      if (isHighRevenue && isStable) return 'cash_cow'; // cash cow dicek duluan
      if (isHighRevenue && isPositiveMoM) return 'star';
      if (isHighRevenue && !isPositiveMoM) return 'at_risk';
      if (!isHighRevenue && isRisingFast) return 'rising';
      return 'other';
    };

    // Hitung median revenue
    const allRevenues = matrixProducts.map((r) => Number(r.revenue));
    const medianRevenue = calcMedian(allRevenues);

    // Klasifikasi tiap produk ke kuadran
    const matrix: Record<
      string,
      {
        id: string;
        name: string;
        sku: string;
        category: string;
        revenue: number;
        revenue_formatted: string;
        units_sold: number;
        mom_delta: number;
        mom_formatted: string;
        mom_trend: 'up' | 'down' | 'flat';
        stock_quantity: number;
        stock_status: string;
      }[]
    > = {
      star: [],
      at_risk: [],
      rising: [],
      cash_cow: [],
      other: [],
    };

    for (const r of matrixProducts) {
      const revenue = Number(r.revenue);
      const momDelta = Number(r.mom_delta);
      const quadrant = classifyProduct(revenue, momDelta, medianRevenue);

      matrix[quadrant].push({
        id: r.id,
        name: r.name,
        sku: r.sku,
        category: r.category_name,
        revenue: parseFloat(revenue.toFixed(2)),
        revenue_formatted: formatCurrency(revenue),
        units_sold: Number(r.units_sold),
        mom_delta: momDelta,
        mom_formatted: `${momDelta >= 0 ? '+' : ''}${momDelta.toFixed(1)}%`,
        mom_trend: momDelta > 0 ? 'up' : momDelta < 0 ? 'down' : 'flat',
        stock_quantity: r.stock_quantity,
        stock_status: getStockStatus(r.stock_quantity),
      });
    }

    for (const q of Object.keys(matrix)) {
      matrix[q].sort((a, b) => b.revenue - a.revenue);
    }

    return {
      period: range,
      classification_rules: {
        median_revenue: parseFloat(medianRevenue.toFixed(2)),
        rising_threshold: `MoM > 15%`,
        stable_threshold: `|MoM| < 5%`,
      },
      products: {
        star: {
          label: 'Stars',
          description: 'Revenue tinggi & tren naik',
          color: 'green',
          count: matrix.star.length,
          products: matrix.star.slice(0, 2), // tampilkan max 5 per kuadran
        },
        at_risk: {
          label: 'At risk',
          description: 'Revenue tinggi tapi tren turun',
          color: 'red',
          count: matrix.at_risk.length,
          products: matrix.at_risk.slice(0, 2),
        },
        rising: {
          label: 'Rising',
          description: 'Revenue kecil tapi momentum tinggi',
          color: 'blue',
          count: matrix.rising.length,
          products: matrix.rising.slice(0, 2),
        },
        cash_cow: {
          label: 'Cash cows',
          description: 'Revenue tinggi & stabil',
          color: 'amber',
          count: matrix.cash_cow.length,
          products: matrix.cash_cow.slice(0, 2),
        },
      },
      total_classified: matrixProducts.length,
    };
  }
}
