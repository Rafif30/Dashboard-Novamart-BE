import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import {
  DateRangeDto,
  resolvePreviousPeriod,
  formatCurrency,
  getFullyearDateRange,
  getQuarterDateRange,
  forecastRevenue,
  formatMonthLabel,
} from '../common/dto/date-range.dto';
import { AuthenticatedUser } from 'src/auth/auth.types';
import { Prisma } from '@prisma/client';

@Injectable()
export class RevenueService {
  private readonly logger = new Logger(RevenueService.name);
  constructor(private prisma: PrismaService) {}

  // Get KPI Revenue
  async getKpisRevenue(user: AuthenticatedUser, dateRangeDto: DateRangeDto) {
    const range = getQuarterDateRange(dateRangeDto);
    const previousRange = resolvePreviousPeriod(range);
    const year = getFullyearDateRange(
      dateRangeDto.year ?? new Date().getFullYear().toString(),
    );
    const previousYear = resolvePreviousPeriod(year);

    const metricsWhere = {
      region_id: user.region_id ?? undefined,
      channel: user.region_id ? undefined : null,
    };

    const regionFilter = user.region_id
      ? Prisma.sql`AND o.region_id = CAST(${user.region_id} AS UUID)`
      : Prisma.empty;

    const queryOrders = (range: { gte: Date; lte: Date }) => {
      return this.prisma.$queryRaw<
        {
          revenue: number;
          discount: number;
          net_revenue: number;
          cogs: number;
          gross_profit: number;
          gross_margin: number;
        }[]
      >(Prisma.sql`
           WITH sales AS (
      SELECT
        COALESCE(SUM(oi.subtotal), 0) AS revenue,
        COALESCE(SUM(p.cost_price * oi.quantity), 0) AS cogs
      FROM order_items oi
      JOIN orders o
        ON o.id = oi.order_id
      JOIN products p
        ON p.id = oi.product_id
      WHERE
        o.ordered_at BETWEEN ${range.gte} AND ${range.lte}
        ${regionFilter}
    ),
    discounts AS (
      SELECT
        COALESCE(SUM(o.discount_amount), 0) AS discount
      FROM orders o
      WHERE
        o.ordered_at BETWEEN ${range.gte} AND ${range.lte}
        ${regionFilter}
    )
    SELECT
      s.revenue,
      d.discount,
      s.revenue - d.discount AS net_revenue,
      s.cogs,
      (s.revenue - d.discount - s.cogs) AS gross_profit,
      CASE
        WHEN (s.revenue - d.discount) = 0 THEN 0
        ELSE
          (
            (s.revenue - d.discount - s.cogs)
            /
            (s.revenue - d.discount)
          ) * 100
      END AS gross_margin
    FROM sales s
    CROSS JOIN discounts d 
        `);
    };

    const [
      currentYearRevenue,
      previousYearRevenue,
      currentAvgValueOrders,
      previousAvgValueOrders,
      currentOrdersItem,
      previousOrdersItem,
    ] = await Promise.all([
      //   1. Ambil data total revenue satu tahun penuh
      this.prisma.dailyMetric.aggregate({
        where: {
          ...metricsWhere,
          metric_date: year,
        },
        _sum: {
          total_revenue: true,
        },
      }),
      //   2. Ambil data total revenue satu tahun penuh sebelumnya
      this.prisma.dailyMetric.aggregate({
        where: {
          ...metricsWhere,
          metric_date: previousYear,
        },
        _sum: {
          total_revenue: true,
          avg_order_value: true,
        },
      }),

      //   3. Ambil data total rata-rata order per periode
      this.prisma.dailyMetric.aggregate({
        where: {
          ...metricsWhere,
          metric_date: range,
        },
        _sum: {
          total_orders: true,
          total_revenue: true,
        },
      }),

      //   4. Ambil data total rata-rata order per periode sebelumnya
      this.prisma.dailyMetric.aggregate({
        where: {
          ...metricsWhere,
          metric_date: previousRange,
        },
        _sum: {
          total_orders: true,
          total_revenue: true,
        },
      }),

      //   5. Ambil data orders item per periode
      queryOrders(range),

      //   6. Ambil data orders item per periode sebelumnya
      queryOrders(previousRange),
    ]);

    const pctChange = (curr: number, prev: number) =>
      prev !== 0 ? ((curr - prev) / Math.abs(prev)) * 100 : 0;

    const currentYearRevenueValue = Number(
      currentYearRevenue._sum.total_revenue,
    );
    const previousYearRevenueValue = Number(
      previousYearRevenue._sum.total_revenue,
    );

    const currentAvgValueOrdersValue =
      Number(currentAvgValueOrders._sum.total_revenue) /
      Number(currentAvgValueOrders._sum.total_orders);

    const previousAvgValueOrdersValue =
      Number(previousAvgValueOrders._sum.total_revenue) /
      Number(previousAvgValueOrders._sum.total_orders);

    const revenueYtd = {
      value: currentYearRevenueValue,
      formatted: formatCurrency(currentYearRevenueValue),
      delta: pctChange(currentYearRevenueValue, previousYearRevenueValue),
      trend:
        currentYearRevenueValue >= previousYearRevenueValue ? 'up' : 'down',
      is_negative_metric: false, // flag untuk frontend
    };

    const avgOrderValue = {
      value: currentAvgValueOrdersValue,
      formatted: formatCurrency(currentAvgValueOrdersValue),
      delta: pctChange(currentAvgValueOrdersValue, previousAvgValueOrdersValue),
      trend:
        currentAvgValueOrdersValue >= previousAvgValueOrdersValue
          ? 'up'
          : 'down',
      is_negative_metric: false, // flag untuk frontend
    };

    const grossMargin = {
      value: currentOrdersItem[0].gross_margin,
      formatted: `${currentOrdersItem[0].gross_margin.toFixed(2)}%`,
      delta:
        currentOrdersItem[0].gross_margin - previousOrdersItem[0].gross_margin,
      trend:
        currentOrdersItem[0].gross_margin >= previousOrdersItem[0].gross_margin
          ? 'up'
          : 'false',
      is_negative_metric: false, // flag untuk frontend
    };

    return {
      period: range,
      revenueYtd,
      avgOrderValue,
      grossMargin,
    };
  }

  // Get Reveue By Channel
  async getRevenueChannel(user: AuthenticatedUser, dateRangeDto: DateRangeDto) {
    const range = getQuarterDateRange(dateRangeDto);
    const prevRange = resolvePreviousPeriod(range);

    const metricsWhere = {
      region_id: user.region_id ?? undefined,
      channel: { not: null },
    };

    const [currentRevenue, prevRevenue] = await Promise.all([
      // Current Revenue By Channel
      this.prisma.dailyMetric.groupBy({
        by: ['channel'],
        where: {
          ...metricsWhere,
          metric_date: range,
        },
        _sum: {
          total_revenue: true,
        },
        orderBy: {
          _sum: {
            total_revenue: 'desc',
          },
        },
      }),

      // Previous Revenue By Channel
      this.prisma.dailyMetric.groupBy({
        by: ['channel'],
        where: {
          ...metricsWhere,
          metric_date: prevRange,
        },
        _sum: {
          total_revenue: true,
        },
        orderBy: {
          _sum: {
            total_revenue: 'desc',
          },
        },
      }),
    ]);

    const totalRevenue = currentRevenue.reduce(
      (sum, item) => sum + Number(item._sum.total_revenue ?? 0),
      0,
    );

    const getGrowthRevenue = (channelName: string, revenue: number) => {
      const prevRevenueChannel = prevRevenue.find(
        (item) => item.channel === channelName,
      )?._sum.total_revenue;

      return (
        ((revenue - Number(prevRevenueChannel)) / Number(prevRevenueChannel)) *
        100
      ).toFixed(2);
    };

    const revenueByChannel = currentRevenue.map((item) => ({
      channel: item.channel,
      value: item._sum.total_revenue,
      formattedValue: formatCurrency(Number(item._sum.total_revenue)),
      growth: `${getGrowthRevenue(
        item.channel ?? '',
        Number(item._sum.total_revenue),
      )}%`,
      share: ((Number(item._sum.total_revenue) / totalRevenue) * 100).toFixed(
        2,
      ),
    }));

    return {
      period: range,
      revenueByChannel,
    };
  }

  // Get Top 5 Revenue Product
  async getRevenueCategory(
    user: AuthenticatedUser,
    dateRangeDto: DateRangeDto,
  ) {
    const range = getQuarterDateRange(dateRangeDto);
    const limit = 5;

    const filterRegion = user.region_id
      ? Prisma.sql`AND o.region_id = CAST(${user.region_id} AS UUID)`
      : Prisma.empty;

    interface TopProduct {
      id: string;
      name: string;
      revenue: string;
    }

    const getTopCategory: TopProduct[] = await this.prisma.$queryRaw`
      SELECT
        c.id,
        c.name,
        SUM(oi.subtotal) AS revenue
      FROM order_items oi
      JOIN products p ON p.id = oi.product_id
      JOIN orders o ON o.id = oi.order_id
      JOIN categories c ON c.id = p.category_id
      WHERE
        o.status != 'returned'
        AND o.ordered_at BETWEEN ${range.gte} AND ${range.lte}
        ${filterRegion}
      GROUP BY c.id, c.name
      ORDER BY revenue DESC
      LIMIT ${limit}
    `;

    const revenueCategory = getTopCategory.map((item) => ({
      category: item.name,
      value: Number(item.revenue),
      formatted: formatCurrency(Number(item.revenue)),
    }));

    return {
      period: range,
      revenueCategory,
    };
  }

  // Get Trend Revenue
  async getRevenueTrend(user: AuthenticatedUser, dateRangeDto: DateRangeDto) {
    const year = getFullyearDateRange(
      dateRangeDto.year ?? new Date().getFullYear().toString(),
    );

    const queryFilterRegions = user.region_id
      ? Prisma.sql`AND region_id = CAST(${user.region_id} AS UUID)`
      : Prisma.empty;

    const revenueByMonth = await this.prisma.$queryRaw<
      { month: Date; revenue: number }[]
    >`
        SELECT
          DATE_TRUNC('month', ordered_at) AS month,
          ROUND(SUM(total_amount), 3) AS revenue
        FROM orders
        WHERE 
          status != 'returned' 
          AND ordered_at BETWEEN ${year.gte} AND ${year.lte}
          ${queryFilterRegions}
        GROUP BY 1
        ORDER BY 1
        LIMIT 12
      `;

    const forecastLength =
      12 - revenueByMonth.length < 3 ? 12 - revenueByMonth.length : 3;

    const revenueForecast: {
      month: string;
      actual: number | null;
      forecast: number | null;
    }[] =
      revenueByMonth.length < 12
        ? forecastRevenue(revenueByMonth, forecastLength).map((item) => ({
            month: formatMonthLabel(item.month),
            actual: null,
            forecast: item.revenue,
          }))
        : [];
    const revenueActual: {
      month: string;
      actual: number | null;
      forecast: number | null;
    }[] = revenueByMonth.map((item, index) => ({
      month: formatMonthLabel(item.month),
      actual: Number(item.revenue),
      forecast:
        index + 1 == revenueByMonth.length ? Number(item.revenue) : null,
    }));

    const revenueTrend: {
      month: string;
      actual: number | null;
      forecast: number | null;
    }[] =
      revenueByMonth.length < 12
        ? revenueActual.concat(revenueForecast)
        : revenueActual;

    return {
      period: year,
      revenueTrend,
    };
  }
}
