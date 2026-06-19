import {
  Controller,
  Get,
  Query,
  UseGuards,
  UseInterceptors,
  Req,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiQuery,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/auth.guard';
import { AuthenticatedUser } from '../auth/auth.types';
import { RegionGuard } from '../common/guards/region.guard';
import { DashboardCacheInterceptor } from '../common/interceptors/dashboard-cache.interceptor';
import { DateRangeDto } from '../common/dto/date-range.dto';
import { OverviewService } from './overview.service';
import { GetKpisResponseDto } from './overview.response';

@ApiTags('Overview')
@ApiBearerAuth('access-token')
@Controller('overview')
@UseGuards(JwtAuthGuard, RegionGuard)
@UseInterceptors(DashboardCacheInterceptor)
export class OverviewController {
  constructor(private readonly overviewService: OverviewService) {}

  // Get KPIs untuk dashboard overview
  @Get('kpis')
  @ApiOperation({
    summary: 'Get dashboard KPIs',
    description:
      'Retrieves key performance indicators (KPIs) including revenue, orders, active customers, and return rate. Supports optional date range filtering and region filtering.',
  })
  @ApiQuery({
    name: 'from',
    required: false,
    type: String,
    description:
      'Start date (YYYY-MM-DD). If not provided, defaults to start of current year (YTD)',
    example: '2026-01-01',
  })
  @ApiQuery({
    name: 'to',
    required: false,
    type: String,
    description: 'End date (YYYY-MM-DD). If not provided, defaults to today',
    example: '2026-05-31',
  })
  @ApiQuery({
    name: 'region_id',
    required: false,
    type: String,
    description:
      'UUID of region to filter by. Will be auto-set by system for ANALYST_REGION roles. Can be omitted for ADMIN role to get all regions.',
    example: '550e8400-e29b-41d4-a716-446655440000',
  })
  @ApiResponse({
    status: 200,
    description: 'KPIs retrieved successfully',
    type: GetKpisResponseDto,
  })
  @ApiResponse({
    status: 400,
    description: 'Bad request - invalid date format or parameters',
  })
  @ApiResponse({
    status: 401,
    description: 'Unauthorized - invalid or missing access token',
  })
  async getKpis(
    @Req() req: Request & { user: AuthenticatedUser },
    @Query() dateRangeDto: DateRangeDto,
  ) {
    return this.overviewService.getKpis(req.user, dateRangeDto);
  }

  // Get Metrik Monthly vs Target
  @Get('charts')
  @ApiOperation({
    summary: 'Get monthly metrics vs target',
    description: 'Retrieves monthly performance metrics compared to targets.',
  })
  async getCharts(
    @Req() req: Request & { user: AuthenticatedUser },
    @Query() dateRangeDto: DateRangeDto,
  ) {
    return this.overviewService.getChart(req.user, dateRangeDto);
  }

  // Get Top Products
  @Get('top-products')
  @ApiOperation({
    summary: 'Get top selling products',
    description:
      'Retrieves top selling products based on revenue and units sold.',
  })
  async getTopProducts(
    @Req() req: Request & { user: AuthenticatedUser },
    @Query() dateRangeDto: DateRangeDto,
  ) {
    return this.overviewService.getTopProducts(req.user, dateRangeDto);
  }

  // Get Customer Segments
  @Get('customer-segments')
  @ApiOperation({
    summary: 'Get Customer Segments',
    description:
      'Retrieves customer segments based on their behavior and characteristics.',
  })
  async getCustomerSegments(
    @Req() req: Request & { user: AuthenticatedUser },
    @Query() dateRangeDto: DateRangeDto,
  ) {
    return this.overviewService.getCustomerSegments(req.user, dateRangeDto);
  }
}
