import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { CacheModule } from '@nestjs/cache-manager';
import { redisStore } from 'cache-manager-redis-yet';

import { AppController } from './app.controller';
import { AppService } from './app.service';
import { PrismaModule } from './prisma/prisma.module';
import { AuthModule } from './auth/auth.module';
import { OverviewService } from './overview/overview.service';
import { OverviewModule } from './overview/overview.module';
import { RevenueModule } from './revenue/revenue.module';
import { OrdersModule } from './orders/orders.module';
import { ProductsModule } from './products/products.module';
import { CustomersModule } from './customers/customers.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    // ─────────────────────────────────────────────
    // CACHE MODULE — Redis (atau memory kalau dev)
    // isGlobal: true → inject CACHE_MANAGER di mana saja
    //
    // Set CACHE_STORE=memory di .env untuk dev tanpa Redis
    // ─────────────────────────────────────────────
    CacheModule.registerAsync({
      isGlobal: true,
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: async (config: ConfigService) => {
        if (config.get('CACHE_STORE') === 'memory') {
          return { ttl: 5 * 60 * 1000 };
        }
        const redisUrl = config.get<string>(
          'REDIS_URL',
          'redis://localhost:6379',
        );
        const url = new URL(redisUrl);
        const store = await redisStore({
          socket: { host: url.hostname, port: Number(url.port) || 6379 },
        });
        return { store, ttl: 5 * 60 * 1000 };
      },
    }),
    PrismaModule,
    AuthModule,
    OverviewModule,
    RevenueModule,
    OrdersModule,
    ProductsModule,
    CustomersModule,
  ],
  controllers: [AppController],
  providers: [AppService, OverviewService],
})
export class AppModule {}
