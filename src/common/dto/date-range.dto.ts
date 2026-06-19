import { IsOptional, IsString } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export enum GranularityEnum {
  DAY = 'day',
  WEEK = 'week',
  MONTH = 'month',
}

export type QuarterType = 'Q1' | 'Q2' | 'Q3' | 'Q4';

// ============================================================
// DateRangeDto
//
// Query param STANDAR yang dipakai oleh semua endpoint dashboard.
// Contoh request:
//   GET /api/overview/kpis?from=2026-01-01&to=2026-05-12
//   GET /api/revenue/trend?from=2026-01-01&to=2026-05-12&granularity=month
//   GET /api/orders/summary?region_id=uuid-xxx&channel=website
//
// Semua field optional — kalau tidak diisi, service pakai
// default (misal: YTD / semua region / semua channel).
// ============================================================

export class DateRangeDto {
  @IsOptional()
  @IsString()
  @ApiProperty({
    description: 'Current Year KPI. Formatted with thousand separators',
    example: '2026-01-01',
    required: false,
  })
  year?: string; //

  @IsOptional()
  @IsString()
  @ApiProperty({
    description: 'Current Quarter KPI',
    example: '2026-01-01',
    required: false,
  })
  quarter?: QuarterType;
}

// ============================================================
// Helper: resolve date range by quarter
//
// Return object siap pakai untuk Prisma query:
//   { gte: Date, lte: Date }
// ============================================================
export function getQuarterDateRange(dto: DateRangeDto): {
  gte: Date;
  lte: Date;
} {
  const quarterMap = {
    Q1: { startMonth: 0, endMonth: 2 }, // Jan - Mar
    Q2: { startMonth: 3, endMonth: 5 }, // Apr - Jun
    Q3: { startMonth: 6, endMonth: 8 }, // Jul - Sep
    Q4: { startMonth: 9, endMonth: 11 }, // Oct - Dec
  };
  const now = new Date();

  const year = dto.year ?? now.getFullYear();
  const quarter =
    dto.quarter ?? (`Q${Math.ceil((now.getMonth() + 1) / 3)}` as QuarterType);

  const selectedQuarter = quarterMap[quarter];

  const fromDate = new Date(Number(year), selectedQuarter.startMonth, 1);

  const toDate = new Date(
    Number(year),
    selectedQuarter.endMonth + 1,
    0, // hari terakhir bulan sebelumnya
    23,
    59,
    59,
    999,
  );

  return {
    gte: fromDate,
    lte: toDate,
  };
}

// ============================================================
// Helper: resolve comparison period
//
// Untuk hitung "vs last period" di KPI cards.
// Kalau range = 132 hari, prev period = 132 hari sebelumnya.
// ============================================================
export function resolvePreviousPeriod(range: { gte: Date; lte: Date }): {
  gte: Date;
  lte: Date;
} {
  const diffMs = range.lte.getTime() - range.gte.getTime();

  return {
    gte: new Date(range.gte.getTime() - diffMs - 1000),
    lte: new Date(range.gte.getTime() - 1000),
  };
}

export function formatCurrency(amount: number) {
  return new Intl.NumberFormat('id-ID', {
    style: 'currency',
    currency: 'IDR',
    maximumFractionDigits: 0,
  }).format(amount);
}

export function formatMonthKey(date: string | Date) {
  const d = new Date(date);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

export function formatMonthLabel(date: string | Date) {
  return new Date(date).toLocaleDateString('id-ID', {
    month: 'short',
  });
}

export function getFullyearDateRange(year: string): { gte: Date; lte: Date } {
  const from = new Date(`${year}-01-01T00:00:00.000Z`);
  const to = new Date(`${year}-12-31T23:59:59.999Z`);
  return { gte: from, lte: to };
}

export function getStockStatus(qty: number) {
  if (qty === 0) return 'out_of_stock';
  if (qty < 20) return 'low';
  if (qty < 50) return 'medium';
  return 'healthy';
}

function linearRegression(data: { x: number; y: number }[]) {
  const n = data.length;

  const sumX = data.reduce((acc, p) => acc + p.x, 0);
  const sumY = data.reduce((acc, p) => acc + p.y, 0);

  const sumXY = data.reduce((acc, p) => acc + p.x * p.y, 0);

  const sumXX = data.reduce((acc, p) => acc + p.x * p.x, 0);

  const slope = (n * sumXY - sumX * sumY) / (n * sumXX - sumX * sumX);

  const intercept = (sumY - slope * sumX) / n;

  return {
    slope,
    intercept,
  };
}

export function forecastRevenue(
  revenueBymonth: { month: Date; revenue: number }[],
  monthsAhead = 3,
) {
  const mappingForLinear = revenueBymonth.map((item, index) => ({
    x: index + 1,
    y: Number(item.revenue),
  }));

  const { slope, intercept } = linearRegression(mappingForLinear);
  const lastX = mappingForLinear[mappingForLinear.length - 1].x;

  return Array.from({ length: monthsAhead }, (_, index) => {
    const x = lastX + index + 1;

    const revenue = intercept + slope * x;

    return {
      month: `2026-${x >= 10 ? x : `0${x}`}-01T00:00:00.000Z`,
      revenue: Math.round(revenue),
    };
  });
}
