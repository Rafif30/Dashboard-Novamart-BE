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
import { JwtAuthGuard, RolesGuard } from '../auth/guards/auth.guard';
import { AuthenticatedUser } from '../auth/auth.types';
import { RegionGuard } from '../common/guards/region.guard';
import { OrdersService } from './orders.service';
import { DashboardCacheInterceptor } from '../common/interceptors/dashboard-cache.interceptor';
import { DateRangeDto } from '../common/dto/date-range.dto';
import { Roles } from 'src/common/decorators/roles.decorator';
import { Role } from '@prisma/client';

@ApiTags('Orders')
@ApiBearerAuth('access-token')
@Controller('orders')
@UseGuards(JwtAuthGuard, RegionGuard, RolesGuard)
@UseInterceptors(DashboardCacheInterceptor)
export class OrdersController {
  constructor(private readonly ordersService: OrdersService) {}

  @Get('kpis')
  @ApiOperation({ summary: 'Get total revenue for a date range' })
  @ApiResponse({ status: 200, description: 'Total revenue data' })
  @ApiQuery({ name: 'gte', required: true, description: 'Start date' })
  @ApiQuery({ name: 'lte', required: true, description: 'End date' })
  async getKpisOrders(
    @Req() req: Request & { user: AuthenticatedUser },
    @Query() dateRangeDto: DateRangeDto,
  ) {
    return this.ordersService.getKpisOrders(req.user, dateRangeDto);
  }

  @Get('status')
  @ApiOperation({ summary: 'Get total revenue for a date range' })
  @ApiResponse({ status: 200, description: 'Total revenue data' })
  @ApiQuery({ name: 'gte', required: true, description: 'Start date' })
  @ApiQuery({ name: 'lte', required: true, description: 'End date' })
  async getStatusOrders(
    @Req() req: Request & { user: AuthenticatedUser },
    @Query() dateRangeDto: DateRangeDto,
  ) {
    return this.ordersService.getStatusOrder(req.user, dateRangeDto);
  }

  @Get('weekly')
  @ApiOperation({ summary: 'Get total revenue for a date range' })
  @ApiResponse({ status: 200, description: 'Total revenue data' })
  @ApiQuery({ name: 'gte', required: true, description: 'Start date' })
  @ApiQuery({ name: 'lte', required: true, description: 'End date' })
  async getWeeklyOrders(
    @Req() req: Request & { user: AuthenticatedUser },
    @Query() dateRangeDto: DateRangeDto,
  ) {
    return this.ordersService.getWeeklyOrders(req.user, dateRangeDto);
  }

  @Roles(Role.EXECUTIVE, Role.SUPER_ADMIN)
  @Get('topRegion')
  @ApiOperation({ summary: 'Get total revenue for a date range' })
  @ApiResponse({ status: 200, description: 'Total revenue data' })
  @ApiQuery({ name: 'gte', required: true, description: 'Start date' })
  @ApiQuery({ name: 'lte', required: true, description: 'End date' })
  async getTopRegionOrders(@Query() dateRangeDto: DateRangeDto) {
    return this.ordersService.getTopRegionOrders(dateRangeDto);
  }

  @Get('recently')
  @ApiOperation({ summary: 'Get total revenue for a date range' })
  @ApiResponse({ status: 200, description: 'Total revenue data' })
  @ApiQuery({ name: 'gte', required: true, description: 'Start date' })
  @ApiQuery({ name: 'lte', required: true, description: 'End date' })
  async getRecentOrder(
    @Req() req: Request & { user: AuthenticatedUser },
    @Query() dateRangeDto: DateRangeDto,
  ) {
    return this.ordersService.getRecentOrder(req.user, dateRangeDto);
  }

  @Get('topChannel')
  @ApiOperation({ summary: 'Get total revenue for a date range' })
  @ApiResponse({ status: 200, description: 'Total revenue data' })
  @ApiQuery({ name: 'gte', required: true, description: 'Start date' })
  @ApiQuery({ name: 'lte', required: true, description: 'End date' })
  async getTopChannel(
    @Req() req: Request & { user: AuthenticatedUser },
    @Query() dateRangeDto: DateRangeDto,
  ) {
    return this.ordersService.getTopChannel(req.user, dateRangeDto);
  }
}
