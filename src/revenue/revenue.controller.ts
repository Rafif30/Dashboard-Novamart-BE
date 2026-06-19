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
import { RevenueService } from './revenue.service';
import { DashboardCacheInterceptor } from '../common/interceptors/dashboard-cache.interceptor';
import { DateRangeDto } from '../common/dto/date-range.dto';

@ApiTags('Revenue')
@ApiBearerAuth('access-token')
@Controller('revenue')
@UseGuards(JwtAuthGuard, RegionGuard)
@UseInterceptors(DashboardCacheInterceptor)
export class RevenueController {
  constructor(private readonly revenueService: RevenueService) {}

  @Get('kpis')
  @ApiOperation({ summary: 'Get total revenue for a date range' })
  @ApiResponse({ status: 200, description: 'Total revenue data' })
  @ApiQuery({ name: 'gte', required: true, description: 'Start date' })
  @ApiQuery({ name: 'lte', required: true, description: 'End date' })
  async getKpisRevenue(
    @Req() req: Request & { user: AuthenticatedUser },
    @Query() dateRangeDto: DateRangeDto,
  ) {
    return this.revenueService.getKpisRevenue(req.user, dateRangeDto);
  }

  @Get('channel')
  @ApiOperation({ summary: 'Get total revenue for a date range' })
  @ApiResponse({ status: 200, description: 'Total revenue data' })
  @ApiQuery({ name: 'gte', required: true, description: 'Start date' })
  @ApiQuery({ name: 'lte', required: true, description: 'End date' })
  async getRevenueByChannel(
    @Req() req: Request & { user: AuthenticatedUser },
    @Query() dateRangeDto: DateRangeDto,
  ) {
    return this.revenueService.getRevenueChannel(req.user, dateRangeDto);
  }

  @Get('category')
  @ApiOperation({ summary: 'Get total revenue for a date range' })
  @ApiResponse({ status: 200, description: 'Total revenue data' })
  @ApiQuery({ name: 'gte', required: true, description: 'Start date' })
  @ApiQuery({ name: 'lte', required: true, description: 'End date' })
  async getRevenueCategory(
    @Req() req: Request & { user: AuthenticatedUser },
    @Query() dateRangeDto: DateRangeDto,
  ) {
    return this.revenueService.getRevenueCategory(req.user, dateRangeDto);
  }

  @Get('trends')
  @ApiOperation({ summary: 'Get total revenue for a date range' })
  @ApiResponse({ status: 200, description: 'Total revenue data' })
  @ApiQuery({ name: 'gte', required: true, description: 'Start date' })
  @ApiQuery({ name: 'lte', required: true, description: 'End date' })
  async getRevenueTrend(
    @Req() req: Request & { user: AuthenticatedUser },
    @Query() dateRangeDto: DateRangeDto,
  ) {
    return this.revenueService.getRevenueTrend(req.user, dateRangeDto);
  }
}
