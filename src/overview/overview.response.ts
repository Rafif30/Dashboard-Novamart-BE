import { ApiProperty } from '@nestjs/swagger';

export class KpiValueDto {
  @ApiProperty({
    description: 'Current KPI value (raw number)',
    example: 1234567.89,
  })
  value: number;

  @ApiProperty({
    description: 'Formatted KPI value for display (currency, percentage, etc)',
    example: 'Rp 1.234.568',
  })
  formatted: string;

  @ApiProperty({
    description: 'Percentage change from previous period',
    example: 12.5,
  })
  delta: number;

  @ApiProperty({
    description: 'Trend direction (up or down)',
    enum: ['up', 'down'],
    example: 'up',
  })
  trend: 'up' | 'down';

  @ApiProperty({
    description:
      'Flag to indicate if this is a negative metric. When true, trend direction should be inverted (up = bad, down = good)',
    example: false,
  })
  is_negative_metric: boolean;
}

export class KpisDto {
  @ApiProperty({
    description:
      'Net revenue KPI (total revenue - discounts). Formatted as IDR currency.',
    type: KpiValueDto,
    example: {
      value: 1234567.89,
      formatted: 'Rp 1.234.568',
      delta: 12.5,
      trend: 'up',
      is_negative_metric: false,
    },
  })
  revenue: KpiValueDto;

  @ApiProperty({
    description: 'Total orders KPI. Formatted with thousand separators.',
    type: KpiValueDto,
    example: {
      value: 456,
      formatted: '456',
      delta: 8.3,
      trend: 'up',
      is_negative_metric: false,
    },
  })
  orders: KpiValueDto;

  @ApiProperty({
    description:
      'Active customers KPI (unique customers in period). Formatted with thousand separators.',
    type: KpiValueDto,
    example: {
      value: 123,
      formatted: '123',
      delta: 5.2,
      trend: 'up',
      is_negative_metric: false,
    },
  })
  active_customers: KpiValueDto;

  @ApiProperty({
    description:
      'Return rate KPI (percentage of returned orders). Formatted as percentage. Note: trend is inverted (up = bad)',
    type: KpiValueDto,
    example: {
      value: 0.05,
      formatted: '5.0%',
      delta: -2.1,
      trend: 'up',
      is_negative_metric: true,
    },
  })
  return_rate: KpiValueDto;
}

export class GetKpisResponseDto {
  @ApiProperty({
    description: 'Date range of the KPIs',
    type: Object,
    example: {
      gte: '2026-05-01T00:00:00.000Z',
      lte: '2026-05-31T23:59:59.999Z',
    },
  })
  period: {
    gte: Date;
    lte: Date;
  };

  @ApiProperty({
    description:
      'All KPI metrics with raw values, formatted values, deltas, and trends',
    type: KpisDto,
  })
  kpis: KpisDto;
}
