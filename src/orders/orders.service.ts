import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import {
  DateRangeDto,
  resolvePreviousPeriod,
  formatCurrency,
  getQuarterDateRange,
} from '../common/dto/date-range.dto';
import { AuthenticatedUser } from 'src/auth/auth.types';
import { Prisma } from '@prisma/client';

@Injectable()
export class OrdersService {
  private readonly logger = new Logger(OrdersService.name);
  constructor(private prisma: PrismaService) {}

  // Get KPIs Orders
  async getKpisOrders(user: AuthenticatedUser, dateRangeDto: DateRangeDto) {
    const range = getQuarterDateRange(dateRangeDto);
    const prevRange = resolvePreviousPeriod(range);

    const queryRegionFilter = user.region_id
      ? Prisma.sql`AND region_id = CAST(${user.region_id} AS UUID)`
      : Prisma.empty;

    const [
      currentTotalOrders,
      prevTotalOrders,
      currentFulfilledOrders,
      prevFulfilledOrders,
      currentDeliveryDate,
      prevDeliveryDate,
      currentReturnOrders,
      prevReturnOrders,
    ] = await Promise.all([
      // Get Current Orders Period
      this.prisma.order.count({
        where: {
          ordered_at: range,
          region_id: user.region_id ? user.region_id : undefined,
        },
      }),

      // Get Previous Orders Period
      this.prisma.order.count({
        where: {
          ordered_at: prevRange,
          region_id: user.region_id ? user.region_id : undefined,
        },
      }),

      // Get Current Fulfilled Orders
      this.prisma.order.count({
        where: {
          ordered_at: range,
          region_id: user.region_id ? user.region_id : undefined,
          status: { in: ['delivered', 'shipped'] },
        },
      }),

      // Get Previous Fulfilled Orders
      this.prisma.order.count({
        where: {
          ordered_at: prevRange,
          region_id: user.region_id ? user.region_id : undefined,
          status: { in: ['delivered', 'shipped'] },
        },
      }),

      // Get Current Delivery Date
      this.prisma.$queryRaw<{ avg_delivery_hours: string }[]>`
        SELECT
            AVG(EXTRACT(EPOCH FROM (delivered_at - ordered_at))
            ) / 3600 AS avg_delivery_hours
        FROM orders
        WHERE ordered_at BETWEEN ${range.gte} AND ${range.lte}
            ${queryRegionFilter}
            AND delivered_at IS NOT NULL
      `,

      // Get Previous Delivery Date
      this.prisma.$queryRaw<{ avg_delivery_hours: string }[]>`
        SELECT
            AVG(EXTRACT(EPOCH FROM (delivered_at - ordered_at))
            ) / 3600 AS avg_delivery_hours
        FROM orders
        WHERE ordered_at BETWEEN ${prevRange.gte} AND ${prevRange.lte}
            ${queryRegionFilter}
            AND delivered_at IS NOT NULL
      `,

      // Get Current Returned Orders
      this.prisma.order.count({
        where: {
          ordered_at: range,
          region_id: user.region_id ? user.region_id : undefined,
          status: { in: ['returned'] },
        },
      }),

      // Get Previous Returned Orders
      this.prisma.order.count({
        where: {
          ordered_at: prevRange,
          region_id: user.region_id ? user.region_id : undefined,
          status: { in: ['returned'] },
        },
      }),
    ]);

    const pctChange = (curr: number, prev: number) =>
      prev !== 0 ? ((curr - prev) / Math.abs(prev)) * 100 : 0;

    const currentRateFulfillment =
      (currentFulfilledOrders / currentTotalOrders) * 100;

    const prevRateFulfillment =
      prevFulfilledOrders > 0
        ? (prevFulfilledOrders / prevTotalOrders) * 100
        : 0;

    const currentRateReturned =
      (currentReturnOrders / currentTotalOrders) * 100;

    const prevRateReturned =
      prevReturnOrders > 0 ? (prevReturnOrders / prevTotalOrders) * 100 : 0;

    const currAvgHours = Number(
      currentDeliveryDate?.[0]?.avg_delivery_hours ?? 0,
    );
    const prevAvgHours = Number(prevDeliveryDate?.[0]?.avg_delivery_hours ?? 0);

    const totalOrders = {
      value: currentTotalOrders,
      formatted: currentTotalOrders.toLocaleString('id-ID'),
      delta: pctChange(currentTotalOrders, prevTotalOrders),
      trend: currentTotalOrders >= prevTotalOrders ? 'up' : 'down',
      is_negative_metric: false, // flag untuk frontend
    };

    const fulfillmentRate = {
      value: currentRateFulfillment.toFixed(2),
      formatted: `${currentRateFulfillment.toFixed(2)}%`,
      delta: pctChange(currentRateFulfillment, prevRateFulfillment),
      trend: currentRateFulfillment >= prevRateFulfillment ? 'up' : 'down',
      is_negative_metric: false, // flag untuk frontend
    };

    const avgDeliveryTime = {
      value: currAvgHours,
      formatted: `${(currAvgHours / 24).toFixed(1)} Days`,
      delta: (currAvgHours - prevAvgHours) / 24,
      trend: currAvgHours >= prevAvgHours ? 'up' : 'down',
      is_negative_metric: true, // flag untuk frontend
    };

    const returnRate = {
      value: currentRateReturned,
      formatted: `${currentRateReturned.toFixed(2)}%`,
      delta: pctChange(currentRateReturned, prevRateReturned),
      trend: currentRateReturned >= prevRateReturned ? 'up' : 'down',
      is_negative_metric: true, // flag untuk frontend
    };

    return {
      period: range,
      totalOrders,
      fulfillmentRate,
      avgDeliveryTime,
      returnRate,
    };
  }

  // Get Order Status Breakdown
  async getStatusOrder(user: AuthenticatedUser, dateRangeDto: DateRangeDto) {
    const range = getQuarterDateRange(dateRangeDto);

    const whereMetrics = {
      ordered_at: range,
      region_id: user.region_id ? user.region_id : undefined,
    };

    const [
      totalOrders,
      totalDeliverd,
      totalShipped,
      totalProcessing,
      totalReturned,
    ] = await Promise.all([
      // Get Total Orders
      this.prisma.order.count({ where: whereMetrics }),

      // Get Total Deliverd,
      this.prisma.order.count({
        where: {
          ...whereMetrics,
          status: 'delivered',
        },
      }),

      // Get Total Shipped,
      this.prisma.order.count({
        where: {
          ...whereMetrics,
          status: 'shipped',
        },
      }),

      // Get Total Processing,
      this.prisma.order.count({
        where: {
          ...whereMetrics,
          status: 'processing',
        },
      }),

      // Get Total Returned,
      this.prisma.order.count({
        where: {
          ...whereMetrics,
          status: 'returned',
        },
      }),
    ]);

    const ordersStatus = {
      totalOrders: totalOrders,
      orderStatusData: [
        {
          label: 'Delivered',
          value: totalDeliverd,
          percentage: (totalDeliverd / totalOrders) * 100,
        },
        {
          label: 'Shipped',
          value: totalShipped,
          percentage: (totalShipped / totalOrders) * 100,
        },
        {
          label: 'Processing',
          value: totalProcessing,
          percentage: (totalProcessing / totalOrders) * 100,
        },
        {
          label: 'Returned',
          value: totalReturned,
          percentage: (totalReturned / totalOrders) * 100,
        },
      ],
    };

    return {
      period: range,
      ordersStatus,
    };
  }

  async getWeeklyOrders(user: AuthenticatedUser, dateRangeDto: DateRangeDto) {
    const range = getQuarterDateRange(dateRangeDto);

    const queryRegionFilter = user.region_id
      ? Prisma.sql`
        AND region_id = CAST(${user.region_id} AS UUID)
      `
      : Prisma.sql`AND channel IS NULL`;

    const [totalOrders, result] = await Promise.all([
      // Get Total Orders
      this.prisma.dailyMetric.aggregate({
        where: {
          metric_date: range,
          channel: { equals: null },
        },
        _sum: {
          total_orders: true,
        },
      }),

      // Get Orders By Days
      this.prisma.$queryRaw<
        { day_name: string; total_orders: number; total_revenue: number }[]
      >`
          SELECT
              TO_CHAR(metric_date, 'Day') AS day_name,
              SUM(total_orders)::INT AS total_orders,
              ROUND(SUM(total_revenue), 2) AS total_revenue
          FROM daily_metrics
          WHERE 
              metric_date BETWEEN ${range.gte} AND ${range.lte}
              ${queryRegionFilter}
          GROUP BY TO_CHAR(metric_date, 'Day')
        `,
    ]);

    const totalOrdersByDay = result.map((order) => ({
      ...order,
      percentage: (
        (order.total_orders / Number(totalOrders._sum.total_orders)) *
        100
      ).toFixed(2),
    }));

    return {
      period: range,
      totalOrdersByDay,
    };
  }

  async getTopRegionOrders(dateRangeDto: DateRangeDto) {
    const range = getQuarterDateRange(dateRangeDto);

    const topItems = await this.prisma.$queryRaw<
      {
        region_id: string;
        name: string;
        total_orders: number;
        total_revenue: number;
      }[]
    >`
        SELECT
            r.id AS region_id,
            r.name AS name,
            SUM(d.total_orders)::INT AS total_orders,
            ROUND(SUM(d.total_revenue), 2) AS total_revenue
        FROM daily_metrics d
        INNER JOIN regions r
            ON r.id = d.region_id
        WHERE d.metric_date BETWEEN ${range.gte} AND ${range.lte}
        GROUP BY r.id, r.name
        ORDER BY total_revenue DESC
        LIMIT 4
      `;

    return {
      period: range,
      topItems,
    };
  }

  async getRecentOrder(user: AuthenticatedUser, dateRangeDto: DateRangeDto) {
    const range = getQuarterDateRange(dateRangeDto);

    const queryRegionFilter = user.region_id
      ? Prisma.sql`WHERE o.region_id = CAST(${user.region_id} AS UUID)`
      : Prisma.empty;

    const result = await this.prisma.$queryRaw<
      {
        order_id: string;
        products: string;
        revenue: number;
        customer_name: string;
        ordered_date: string;
        status: 'delivered' | 'shipped' | 'processing' | 'returned';
      }[]
    >`
        SELECT
            o.id AS order_id,
            STRING_AGG(p.name, ', ') AS products,
            (o.total_amount)::INT AS revenue,
            c.name AS customer_name,
            o.ordered_at as ordered_date,
            o.status as status
        FROM orders o
        JOIN order_items oi
            ON o.id = oi.order_id
        JOIN products p
            ON p.id = oi.product_id
        JOIN customers c
            ON c.id = o.customer_id
        ${queryRegionFilter} 
        GROUP BY 
            o.id,
            c.name,
            o.total_amount,
            o.discount_amount,
            o.ordered_at,
            o.status
        ORDER BY o.ordered_at DESC
        LIMIT 5
    `;

    const recentOrders = result.map((item) => ({
      ...item,
      revenue_formatted: formatCurrency(Number(item.revenue)),
    }));

    return {
      period: range,
      recentOrders,
    };
  }

  async getTopChannel(user: AuthenticatedUser, dateRangeDto: DateRangeDto) {
    const range = getQuarterDateRange(dateRangeDto);
    const topChannel = await this.prisma.dailyMetric.groupBy({
      by: ['channel'],
      where: {
        metric_date: range,
        region_id: user.region_id,
      },
      _sum: {
        total_orders: true,
        total_revenue: true,
      },
    });

    const response = topChannel.map((item) => ({
      name: item.channel,
      total_orders: item._sum.total_orders,
      total_revenue: Number(item._sum.total_revenue),
    }));

    return {
      period: range,
      topItems: response,
    };
  }
}
