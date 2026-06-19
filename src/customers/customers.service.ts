import { Injectable, Logger } from '@nestjs/common';
import {
  getQuarterDateRange,
  DateRangeDto,
  resolvePreviousPeriod,
  formatCurrency,
} from 'src/common/dto/date-range.dto';
import { PrismaService } from 'src/prisma/prisma.service';
import { AuthenticatedUser } from 'src/auth/auth.types';
import { Prisma } from '@prisma/client';

@Injectable()
export class CustomersService {
  private readonly logger = new Logger(CustomersService.name);
  constructor(private prisma: PrismaService) {}

  // Get KPI Customers
  async getKpisCustomers(user: AuthenticatedUser, dateRangeDto: DateRangeDto) {
    const range = getQuarterDateRange(dateRangeDto);
    const prevRange = resolvePreviousPeriod(range);
    const prev2Range = resolvePreviousPeriod(prevRange);

    const regionWhere = {
      region_id: user.region_id ? user.region_id : undefined,
    };

    const regionQueryFilter = user.region_id
      ? Prisma.sql`AND region_id = CAST(${user.region_id} AS UUID)`
      : Prisma.empty;

    const [
      currentTotalCustomers,
      prevTotalCustomers,
      currentAvgLtv,
      prevAvgLtv,
      currentChurnRate,
      prevChurnRate,
      currentRepeatPurchaseRate,
      prevRepeatPurchaseRate,
    ] = await Promise.all([
      // Get Total Customers current
      this.prisma.customer.count({
        where: {
          ...regionWhere,
          created_at: { lte: range.lte },
        },
      }),

      // Get Total Customers Previous
      this.prisma.customer.count({
        where: {
          ...regionWhere,
          created_at: { lte: prevRange.lte },
        },
      }),

      // Get Average Live Time Current
      this.prisma.customer.aggregate({
        where: {
          ...regionWhere,
          last_order_at: range,
        },
        _avg: {
          lifetime_value: true,
        },
      }),

      // Get Average Live Time Previous
      this.prisma.customer.aggregate({
        where: {
          ...regionWhere,
          last_order_at: prevRange,
        },
        _avg: {
          lifetime_value: true,
        },
      }),

      // Get Churn Rate Current
      this.prisma.$queryRaw<{ churn_rate: number }[]>`
        WITH current_active AS (
          SELECT DISTINCT customer_id
          FROM orders
          WHERE 
            ordered_at BETWEEN ${range.gte} AND ${range.lte}
            ${regionQueryFilter}
        ),
        prev_active AS (
          SELECT DISTINCT customer_id
          FROM orders
          WHERE 
            ordered_at BETWEEN ${prevRange.gte} AND ${prevRange.lte}
            ${regionQueryFilter}
        )
        SELECT
        COALESCE(
          (
            COUNT(*) * 100.0 /
            NULLIF(
              (SELECT COUNT(*) FROM prev_active),
              0
            )
          ),
          0
        )::FLOAT AS churn_rate
        FROM prev_active pa
        LEFT JOIN current_active ca
          ON pa.customer_id = ca.customer_id
        WHERE ca.customer_id IS NULL
      `,

      // Get Churn Rate Previous
      this.prisma.$queryRaw<{ churn_rate: number }[]>`
        WITH current_active AS (
          SELECT DISTINCT customer_id
          FROM orders
          WHERE 
            ordered_at BETWEEN ${prevRange.gte} AND ${prevRange.lte}
            ${regionQueryFilter}
        ),
        prev_active AS (
          SELECT DISTINCT customer_id
          FROM orders
          WHERE 
            ordered_at BETWEEN ${prev2Range.gte} AND ${prev2Range.lte}
            ${regionQueryFilter}
        )
        SELECT
          COALESCE(
            (
              COUNT(*) * 100.0 /
              NULLIF(
                (SELECT COUNT(*) FROM prev_active),
                0
              )
            ),
            0
          )::FLOAT AS churn_rate
        FROM prev_active pa
        LEFT JOIN current_active ca
          ON pa.customer_id = ca.customer_id
        WHERE ca.customer_id IS NULL
      `,

      // Get Current Repeat Purchase Rate
      this.prisma.$queryRaw<{ round: number }[]>`
        WITH customer_orders AS (
          SELECT
            customer_id,
            COUNT(*) AS total_orders
          FROM orders
          WHERE 
            ordered_at BETWEEN ${range.gte} AND ${range.lte}
            ${regionQueryFilter}
          GROUP BY customer_id
        )
        SELECT 
          ROUND(
            COUNT(*) FILTER (
              WHERE total_orders > 1
            ) * 100.0
            / NULLIF(COUNT(*), 0), 2
          )
        FROM customer_orders
      `,

      // Get Previous Repeat Purchase Rate
      this.prisma.$queryRaw<{ round: number }[]>`
        WITH customer_orders AS (
          SELECT
            customer_id,
            COUNT(*) AS total_orders
          FROM orders
          WHERE 
            ordered_at BETWEEN ${prevRange.gte} AND ${prevRange.lte}
            ${regionQueryFilter}
          GROUP BY customer_id
        )
        SELECT 
          ROUND(
            COUNT(*) FILTER (
              WHERE total_orders > 1
            ) * 100.0
            / NULLIF(COUNT(*), 0), 2
          )
        FROM customer_orders
      `,
    ]);

    const pctChange = (curr: number, prev: number) =>
      prev !== 0 ? ((curr - prev) / Math.abs(prev)) * 100 : 0;

    return {
      period: range,
      totalCustomers: {
        value: currentTotalCustomers,
        formatted: currentTotalCustomers.toLocaleString('id-ID'),
        delta: pctChange(currentTotalCustomers, prevTotalCustomers),
        trend: currentTotalCustomers >= prevTotalCustomers ? 'up' : 'down',
        is_negative_metric: false, // flag untuk frontend
      },
      avgLtvCustomers: {
        value: currentAvgLtv._avg.lifetime_value,
        formatted: formatCurrency(Number(currentAvgLtv._avg.lifetime_value)),
        delta: pctChange(
          Number(currentAvgLtv._avg.lifetime_value),
          Number(prevAvgLtv._avg.lifetime_value),
        ),
        trend:
          Number(currentAvgLtv._avg.lifetime_value) >=
          Number(prevAvgLtv._avg.lifetime_value)
            ? 'up'
            : 'down',
        is_negative_metric: false,
      },
      churnRateCustomers: {
        value: currentChurnRate[0].churn_rate,
        formatted: `${currentChurnRate[0].churn_rate.toFixed(3)}%`,
        delta: currentChurnRate[0].churn_rate - prevChurnRate[0].churn_rate,
        trend:
          currentChurnRate[0].churn_rate >= prevChurnRate[0].churn_rate
            ? 'up'
            : 'down',
        is_negative_metric: true,
      },
      repeatPurchaseRate: {
        value: currentRepeatPurchaseRate[0].round,
        formatted: `${currentRepeatPurchaseRate[0].round}%`,
        delta:
          currentRepeatPurchaseRate[0].round - prevRepeatPurchaseRate[0].round,
        trend:
          currentRepeatPurchaseRate[0].round >= prevRepeatPurchaseRate[0].round
            ? 'up'
            : 'down',
        is_negative_metric: false,
      },
    };
  }

  async getCustomerSegments(
    user: AuthenticatedUser,
    dateRangeDto: DateRangeDto,
  ) {
    const range = getQuarterDateRange(dateRangeDto);

    const whereMetric = {
      region_id: user.region_id ? user.region_id : undefined,
    };

    // Get Customer Segments
    const customerSegments = await this.prisma.customer.groupBy({
      by: ['segment'],
      where: {
        ...whereMetric,
        created_at: { lte: range.lte },
      },
      _min: {
        lifetime_value: true,
      },
      _max: {
        lifetime_value: true,
        last_order_at: true,
      },
      _avg: {
        lifetime_value: true,
      },
      _count: {
        id: true,
      },
    });

    const mostCustomer = Math.max(
      ...customerSegments.map((customer) => Number(customer._count.id)),
    );

    const customerSegment = customerSegments
      .map((customer) => ({
        segment: customer.segment
          .split('_')
          .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
          .join(' '),
        avgLtv: Number(customer._avg.lifetime_value),
        formattedAvgLtv: formatCurrency(Number(customer._avg.lifetime_value)),
        totalCustomer: customer._count.id,
        percentageCustomer: (Number(customer._count.id) / mostCustomer) * 100,
      }))
      .sort((a, b) => b.avgLtv - a.avgLtv);

    return {
      period: range,
      customerSegment,
    };
  }

  async getCustomerCohorts(
    user: AuthenticatedUser,
    dateRangeDto: DateRangeDto,
  ) {
    const range = getQuarterDateRange(dateRangeDto);
    const regionQueryFilter = user.region_id
      ? Prisma.sql`WHERE region_id = CAST(${user.region_id} AS UUID)`
      : Prisma.empty;

    const cohorts = await this.prisma.$queryRaw`
      WITH customer_cohorts AS (
        SELECT
          customer_id,
          DATE_TRUNC('month', MIN(ordered_at)) AS cohort_month
        FROM orders
        ${regionQueryFilter}
        GROUP BY customer_id
        HAVING DATE_TRUNC('month', MIN(ordered_at))
          BETWEEN ${range.gte} AND ${range.lte}
      ),
      cohort_sizes AS (
        SELECT
          cohort_month,
          COUNT(*) AS cohort_size
        FROM customer_cohorts
        GROUP BY cohort_month
      ),
      customer_activity AS (
        SELECT
          customer_id,
          DATE_TRUNC('month', ordered_at) AS active_month
        FROM orders
      )
      SELECT
        TO_CHAR(cc.cohort_month, 'YYYY-MM') AS cohort,
        ROUND(
          COUNT(DISTINCT CASE WHEN month_number = 0 THEN cc.customer_id END)
          * 100.0 / cs.cohort_size,
          2
        ) AS m0,
        ROUND(
          COUNT(DISTINCT CASE WHEN month_number = 1 THEN cc.customer_id END)
          * 100.0 / cs.cohort_size,
          2
        ) AS m1,
        ROUND(
          COUNT(DISTINCT CASE WHEN month_number = 2 THEN cc.customer_id END)
          * 100.0 / cs.cohort_size,
          2
        ) AS m2
      FROM (
        SELECT
          cc.customer_id,
          cc.cohort_month,
          (
            DATE_PART('year', age(ca.active_month, cc.cohort_month)) * 12
            +
            DATE_PART('month', age(ca.active_month, cc.cohort_month))
          )::INT AS month_number
        FROM customer_cohorts cc
        JOIN customer_activity ca
          ON ca.customer_id = cc.customer_id
      ) cc
      JOIN cohort_sizes cs
        ON cs.cohort_month = cc.cohort_month
      GROUP BY
        cc.cohort_month,
        cs.cohort_size
      ORDER BY
        cc.cohort_month
    `;

    return {
      period: range,
      cohorts,
    };
  }

  async getCustomerReturning(
    user: AuthenticatedUser,
    dateRangeDto: DateRangeDto,
  ) {
    const range = getQuarterDateRange(dateRangeDto);

    const queryRegionFilter = user.region_id
      ? Prisma.sql`AND region_id = CAST(${user.region_id} AS UUID)`
      : Prisma.empty;

    const result = await this.prisma.$queryRaw<
      { new_customers: number; returning_customers: number }[]
    >`
      WITH first_orders AS (
        SELECT
          customer_id,
          MIN(ordered_at) AS first_order_at
        FROM orders customer_id
        GROUP BY customer_id
      ),
      current_customers AS (
        SELECT DISTINCT customer_id
        FROM orders
        WHERE
          ordered_at BETWEEN ${range.gte} AND ${range.lte}
          ${queryRegionFilter}
      )
      SELECT
        COUNT(
          CASE 
            WHEN fo.first_order_at BETWEEN ${range.gte} AND ${range.lte}
            THEN 1
          END
        )::INT AS new_customers,
        COUNT(
          CASE
            WHEN fo.first_order_at < ${range.gte}
            THEN 1
          END
        )::INT AS returning_customers
      FROM current_customers cc
      JOIN first_orders fo
        ON fo.customer_id = cc.customer_id;
    `;

    const totalCustomer =
      result[0].new_customers + result[0].returning_customers;
    const newCustomers = {
      value: result[0].new_customers,
      percentage: (result[0].new_customers / totalCustomer) * 100,
      label: 'New',
    };

    const returnCustomers = {
      value: result[0].returning_customers,
      percentage: (result[0].returning_customers / totalCustomer) * 100,
      label: 'Returning',
    };

    return {
      period: range,
      newCustomers,
      returnCustomers,
    };
  }
}
