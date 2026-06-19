import {
  Controller,
  UseGuards,
  Get,
  UseInterceptors,
  Query,
  Req,
} from '@nestjs/common';
import { JwtAuthGuard } from 'src/auth/guards/auth.guard';
import { AuthenticatedUser } from 'src/auth/auth.types';
import { RegionGuard } from 'src/common/guards/region.guard';
import { DateRangeDto } from 'src/common/dto/date-range.dto';
import { DashboardCacheInterceptor } from 'src/common/interceptors/dashboard-cache.interceptor';
import {
  ApiTags,
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiQuery,
} from '@nestjs/swagger';
import { ProductsService } from './products.service';

@ApiTags('Products')
@ApiBearerAuth('access-token')
@Controller('products')
@UseGuards(JwtAuthGuard, RegionGuard)
@UseInterceptors(DashboardCacheInterceptor)
export class ProductsController {
  constructor(private readonly productService: ProductsService) {}

  @Get('kpis')
  @ApiOperation({ summary: 'Get total revenue for a date range' })
  @ApiResponse({ status: 200, description: 'Total revenue data' })
  @ApiQuery({ name: 'gte', required: true, description: 'Start date' })
  @ApiQuery({ name: 'lte', required: true, description: 'End date' })
  async getKpisProducts(
    @Req() req: Request & { user: AuthenticatedUser },
    @Query() dateRangeDto: DateRangeDto,
  ) {
    return this.productService.getKpisProducts(req.user, dateRangeDto);
  }

  @Get('topProducts')
  @ApiOperation({ summary: 'Get total revenue for a date range' })
  @ApiResponse({ status: 200, description: 'Total revenue data' })
  @ApiQuery({ name: 'gte', required: true, description: 'Start date' })
  @ApiQuery({ name: 'lte', required: true, description: 'End date' })
  async getTopProducts(
    @Req() req: Request & { user: AuthenticatedUser },
    @Query() dateRangeDto: DateRangeDto,
  ) {
    return this.productService.getTopProducts(req.user, dateRangeDto);
  }

  @Get('matrix')
  @ApiOperation({ summary: 'Get total revenue for a date range' })
  @ApiResponse({ status: 200, description: 'Total revenue data' })
  @ApiQuery({ name: 'gte', required: true, description: 'Start date' })
  @ApiQuery({ name: 'lte', required: true, description: 'End date' })
  async getMatrixProducts(
    @Req() req: Request & { user: AuthenticatedUser },
    @Query() dateRangeDto: DateRangeDto,
  ) {
    return this.productService.getMatrixProducts(req.user, dateRangeDto);
  }
}
