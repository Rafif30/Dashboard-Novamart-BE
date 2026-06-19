import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import {
  DateRangeDto,
  resolvePreviousPeriod,
  formatCurrency,
  formatMonthKey,
  formatMonthLabel,
  getFullyearDateRange,
  getStockStatus,
  getQuarterDateRange,
} from '../common/dto/date-range.dto';
import { AuthenticatedUser } from 'src/auth/auth.types';
import { Prisma } from '@prisma/client';

@Injectable()
export class OverviewService {
  private readonly logger = new Logger(OverviewService.name);
  constructor(private prisma: PrismaService) {}

  async getKpis(user: AuthenticatedUser, dateRangeDto: DateRangeDto) {
    const range = getQuarterDateRange(dateRangeDto);
    const previousRange = resolvePreviousPeriod(range);

    // Base where clause yang dipakai berulang
    const orderWhere = {
      ordered_at: range,
      channel: undefined,
      region_id: user.region_id ?? undefined,
    };
    const orderWherePrev = {
      ordered_at: previousRange,
      channel: undefined,
      region_id: user.region_id ?? undefined,
    };

    // Query daily_metrics (sudah diagregasi, cepat)
    const [
      revenueCurrent,
      revenuePrev,
      ordersCurrent,
      ordersPrev,
      customersCurrent,
      customersPrev,
      returnRateCurrent,
      returnRatePrev,
    ] = await Promise.all([
      // 1. Total revenue periode ini (sum total_amount - discount_amount)
      this.prisma.order.aggregate({
        where: orderWhere,
        _sum: { total_amount: true, discount_amount: true },
      }),

      // 2. Total revenue periode sebelumnya (untuk delta %)
      this.prisma.order.aggregate({
        where: orderWherePrev,
        _sum: { total_amount: true, discount_amount: true },
      }),

      // 3. Total orders periode ini
      this.prisma.order.count({ where: orderWhere }),

      // 4. Total orders periode sebelumnya
      this.prisma.order.count({ where: orderWherePrev }),

      // 5. Active customers: customer yang punya order di periode ini
      this.prisma.order.findMany({
        where: orderWhere,
        select: { customer_id: true },
        distinct: ['customer_id'],
      }),

      // 6. Active customers periode sebelumnya
      this.prisma.order.findMany({
        where: orderWherePrev,
        select: { customer_id: true },
        distinct: ['customer_id'],
      }),

      // 7. Return rate periode ini
      this.prisma.order.groupBy({
        by: ['status'],
        where: orderWhere,
        _count: { status: true },
      }),

      // 8. Return rate periode sebelumnya
      this.prisma.order.groupBy({
        by: ['status'],
        where: orderWherePrev,
        _count: { status: true },
      }),
    ]);

    // Hitung net revenue (total - discount)
    const netRevenueCurrent =
      Number(revenueCurrent._sum.total_amount ?? 0) -
      Number(revenueCurrent._sum.discount_amount ?? 0);
    const netRevenuePrev =
      Number(revenuePrev._sum.total_amount ?? 0) -
      Number(revenuePrev._sum.discount_amount ?? 0);

    // Hitung return rate dari groupBy result
    function calcReturnRate(groupByResult: typeof returnRateCurrent) {
      const total = groupByResult.reduce((sum, g) => sum + g._count.status, 0);
      const returned =
        groupByResult.find((g) => g.status === 'returned')?._count.status ?? 0;
      return total > 0 ? returned / total : 0;
    }

    const returnRateCur = calcReturnRate(returnRateCurrent);
    const returnRatePre = calcReturnRate(returnRatePrev);

    const pctChange = (curr: number, prev: number) =>
      prev !== 0 ? ((curr - prev) / Math.abs(prev)) * 100 : 0;

    return {
      period: range,
      kpis: {
        revenue: {
          value: netRevenueCurrent,
          formatted: formatCurrency(netRevenueCurrent),
          delta: pctChange(netRevenueCurrent, netRevenuePrev),
          trend: netRevenueCurrent >= netRevenuePrev ? 'up' : 'down',
          is_negative_metric: false, // flag untuk frontend
        },
        orders: {
          value: ordersCurrent,
          formatted: ordersCurrent.toLocaleString('id-ID'),
          delta: pctChange(ordersCurrent, ordersPrev),
          trend: ordersCurrent >= ordersPrev ? 'up' : 'down',
          is_negative_metric: false, // flag untuk frontend
        },
        active_customers: {
          value: customersCurrent.length,
          formatted: customersCurrent.length.toLocaleString('id-ID'),
          delta: pctChange(customersCurrent.length, customersPrev.length),
          trend:
            customersCurrent.length >= customersPrev.length ? 'up' : 'down',
          is_negative_metric: false, // flag untuk frontend
        },
        return_rate: {
          value: returnRateCur,
          formatted: `${(returnRateCur * 100).toFixed(1)}%`,
          delta: pctChange(returnRateCur, returnRatePre),
          // return rate: trend 'up' = buruk (lebih banyak yang return)
          trend: returnRateCur >= returnRatePre ? 'up' : 'down',
          is_negative_metric: true, // flag untuk frontend
        },
      },
    };
  }

  async getChart(user: AuthenticatedUser, dateRangeDto: DateRangeDto) {
    const range = getQuarterDateRange(dateRangeDto);
    const year = getFullyearDateRange(
      dateRangeDto.year ?? new Date().getFullYear().toString(),
    );

    const metricsWhere = {
      region_id: user.region_id ?? undefined,
    };

    const [monthlyMetrics, channelMetrics] = await Promise.all([
      // Ambil data daily_metric untuk periode yang dipilih (biasanya 1 tahun penuh) untuk chart.
      this.prisma.dailyMetric.findMany({
        where: {
          ...metricsWhere,
          metric_date: year,
          channel: user.region_id ? undefined : null,
        },
        orderBy: { metric_date: 'asc' },
        select: {
          metric_date: true,
          total_revenue: true,
          target_revenue: true,
        },
      }),

      //  Ambil breakdown revenue dan order count per channel untuk periode ini (untuk chart pie atau tabel).
      this.prisma.dailyMetric.findMany({
        where: {
          ...metricsWhere,
          metric_date: range,
          channel: { not: null }, // hanya baris per-channel
        },
        select: {
          channel: true,
          total_revenue: true,
          total_orders: true,
        },
      }),
    ]);

    const monthlyMap: Record<
      string,
      {
        month: string;
        label: string;
        revenue: number;
        target: number;
      }
    > = {};
    for (const row of monthlyMetrics) {
      const key = formatMonthKey(row.metric_date); // "2024-01"
      if (!monthlyMap[key]) {
        monthlyMap[key] = {
          month: key,
          label: formatMonthLabel(row.metric_date), // "Jan 2024"
          revenue: 0,
          target: 0,
        };
      }
      monthlyMap[key].revenue += Number(row.total_revenue);
      monthlyMap[key].target += Number(row.target_revenue);
    }

    const barChartData = Object.values(monthlyMap);

    const channelMap: Record<
      string,
      {
        channel: string;
        revenue: number;
        orders: number;
      }
    > = {};
    for (const row of channelMetrics) {
      if (row.channel === null) {
        continue;
      }

      if (!channelMap[row.channel]) {
        channelMap[row.channel] = {
          channel: row.channel,
          revenue: 0,
          orders: 0,
        };
      }
      channelMap[row.channel].revenue += Number(row.total_revenue);
      channelMap[row.channel].orders += row.total_orders;
    }

    const totalRevenue = Object.values(channelMap).reduce(
      (sum, c) => sum + c.revenue,
      0,
    );

    const donutData = Object.values(channelMap)
      .map((c) => ({
        channel: c.channel,
        revenue: c.revenue,
        formatted: formatCurrency(c.revenue),
        orders: c.orders,
        percentage:
          totalRevenue > 0
            ? parseFloat(((c.revenue / totalRevenue) * 100).toFixed(1))
            : 0,
      }))
      .sort((a, b) => b.revenue - a.revenue);

    return {
      period: range,
      barChart: barChartData,
      donutChart: donutData,
    };
  }

  async getTopProducts(user: AuthenticatedUser, dateRangeDto: DateRangeDto) {
    const range = getQuarterDateRange(dateRangeDto);
    const limit = 5;

    const regionFilter = user.region_id
      ? Prisma.sql`AND o.region_id = CAST(${user.region_id} AS UUID)`
      : Prisma.empty;

    const rows = await this.prisma.$queryRaw`
      SELECT
        p.id,
        p.name,
        p.sku,
        p.stock_quantity,
        p.rating,
        c.name            AS category_name,
        SUM(oi.subtotal)  AS revenue,
        SUM(oi.quantity)  AS units_sold,
        COUNT(DISTINCT o.id) AS order_count
      FROM order_items oi
      JOIN orders o  ON o.id  = oi.order_id
      JOIN products p ON p.id = oi.product_id
      JOIN categories c ON c.id = p.category_id
      WHERE
        o.ordered_at BETWEEN ${range.gte} AND ${range.lte}
        AND o.status != 'returned'
        ${regionFilter}
      GROUP BY p.id, p.name, p.sku, p.stock_quantity, p.rating, c.name
      ORDER BY revenue DESC
      LIMIT ${limit}
    `;

    // Hitung total revenue semua produk (untuk share %)
    const totalRevenue = (rows as { revenue: number }[]).reduce(
      (sum: number, r: { revenue: number }) => sum + Number(r.revenue),
      0,
    );

    type Product = {
      rank: number;
      id: string;
      name: string;
      sku: string;
      category_name: string;
      revenue: number;
      revenue_formatted: string;
      revenue_share: number;
      units_sold: number;
      order_count: number;
      stock_quantity: number;
      stock_status: string;
      rating: number;
    };

    const products: Product[] = (rows as Product[]).map((r, idx) => ({
      rank: idx + 1,
      id: r.id,
      name: r.name,
      sku: r.sku,
      category_name: r.category_name,
      revenue: Number(r.revenue),
      revenue_formatted: formatCurrency(Number(r.revenue)),
      revenue_share:
        totalRevenue > 0
          ? parseFloat(((Number(r.revenue) / totalRevenue) * 100).toFixed(1))
          : 0,
      units_sold: Number(r.units_sold),
      order_count: Number(r.order_count),
      stock_quantity: r.stock_quantity,
      stock_status: getStockStatus(r.stock_quantity),
      rating: Number(r.rating),
    }));

    return {
      period: range,
      topProducts: products,
    };
  }

  async getCustomerSegments(
    user: AuthenticatedUser,
    dateRangeDto: DateRangeDto,
  ) {
    const range = getQuarterDateRange(dateRangeDto);

    const queryFilterRegion = user.region_id
      ? Prisma.sql`AND o.region_id = CAST(${user.region_id} AS UUID)`
      : Prisma.empty;

    const segmentStats = await this.prisma.$queryRaw<
      {
        segment: string;
        total_customers: number;
        avg_ltv: number;
        total_revenue: number;
      }[]
    >`
      WITH segment_stats AS (
        SELECT
          segment,
          COUNT(DISTINCT id)::INT AS total_customers,
          AVG(lifetime_value) AS avg_ltv
        FROM customers
        GROUP BY segment
      ),
      segment_revenue AS (
        SELECT
          c.segment,
          SUM(o.total_amount) AS total_revenue
        FROM orders o
        JOIN customers c
          ON c.id = o.customer_id
        WHERE 
          o.ordered_at BETWEEN ${range.gte} AND ${range.lte}
          AND o.status != 'returned'
          ${queryFilterRegion}
        GROUP BY c.segment    
      )
        SELECT
          ss.segment,
          ss.total_customers,
          ROUND(ss.avg_ltv, 2) AS avg_ltv,
          COALESCE(sr.total_revenue, 0) AS total_revenue
        FROM segment_stats ss
        LEFT JOIN segment_revenue sr
          ON sr.segment = ss.segment
        ORDER BY avg_ltv DESC
    `;

    const segments = segmentStats.map((s) => ({
      segment: s.segment,
      count: s.total_customers,
      avg_ltv: parseFloat(Number(s.avg_ltv ?? 0).toFixed(2)),
      total_revenue: parseFloat(Number(s.total_revenue ?? 0).toFixed(2)),
    }));

    return {
      period: range,
      segments,
    };
  }
}
