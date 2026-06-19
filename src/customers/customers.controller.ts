import {
  Controller,
  UseGuards,
  UseInterceptors,
  Get,
  Query,
  Req,
} from '@nestjs/common';
import { JwtAuthGuard } from 'src/auth/guards/auth.guard';
import { AuthenticatedUser } from 'src/auth/auth.types';
import { RegionGuard } from 'src/common/guards/region.guard';
import { DashboardCacheInterceptor } from 'src/common/interceptors/dashboard-cache.interceptor';
import {
  ApiTags,
  ApiBearerAuth,
  ApiResponse,
  ApiOperation,
  ApiQuery,
} from '@nestjs/swagger';
import { CustomersService } from './customers.service';
import { DateRangeDto } from 'src/common/dto/date-range.dto';

@ApiTags('Customers')
@ApiBearerAuth('access-token')
@Controller('customers')
@UseGuards(JwtAuthGuard, RegionGuard)
@UseInterceptors(DashboardCacheInterceptor)
export class CustomersController {
  constructor(private readonly customersService: CustomersService) {}

  @Get('kpis')
  @ApiOperation({ summary: 'Get total revenue for a date range' })
  @ApiResponse({ status: 200, description: 'Total revenue data' })
  @ApiQuery({ name: 'gte', required: true, description: 'Start date' })
  @ApiQuery({ name: 'lte', required: true, description: 'End date' })
  async getKpisCustomers(
    @Req() req: Request & { user: AuthenticatedUser },
    @Query() dateRangeDto: DateRangeDto,
  ) {
    return this.customersService.getKpisCustomers(req.user, dateRangeDto);
  }

  @Get('segments')
  @ApiOperation({ summary: 'Get total revenue for a date range' })
  @ApiResponse({ status: 200, description: 'Total revenue data' })
  @ApiQuery({ name: 'gte', required: true, description: 'Start date' })
  @ApiQuery({ name: 'lte', required: true, description: 'End date' })
  async getCustomerSegments(
    @Req() req: Request & { user: AuthenticatedUser },
    @Query() dateRangeDto: DateRangeDto,
  ) {
    return this.customersService.getCustomerSegments(req.user, dateRangeDto);
  }

  @Get('cohorts')
  @ApiOperation({ summary: 'Get total revenue for a date range' })
  @ApiResponse({ status: 200, description: 'Total revenue data' })
  @ApiQuery({ name: 'gte', required: true, description: 'Start date' })
  @ApiQuery({ name: 'lte', required: true, description: 'End date' })
  async getCustomerCohorts(
    @Req() req: Request & { user: AuthenticatedUser },
    @Query() dateRangeDto: DateRangeDto,
  ) {
    return this.customersService.getCustomerCohorts(req.user, dateRangeDto);
  }

  @Get('returning')
  @ApiOperation({ summary: 'Get total revenue for a date range' })
  @ApiResponse({ status: 200, description: 'Total revenue data' })
  @ApiQuery({ name: 'gte', required: true, description: 'Start date' })
  @ApiQuery({ name: 'lte', required: true, description: 'End date' })
  async getCustomerReturning(
    @Req() req: Request & { user: AuthenticatedUser },
    @Query() dateRangeDto: DateRangeDto,
  ) {
    return this.customersService.getCustomerReturning(req.user, dateRangeDto);
  }
}
