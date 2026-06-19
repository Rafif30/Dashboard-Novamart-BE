import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
  Inject,
} from '@nestjs/common';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import type { Cache } from 'cache-manager';
import { Observable, of } from 'rxjs';
import { tap } from 'rxjs/operators';
import { Request } from 'express';
import { AuthenticatedUser } from '../../auth/auth.types';

// ============================================================
// DashboardCacheInterceptor
//
// Cache yang aware terhadap role dan region user.
//
// Cache key dibuat dari:
//   {method}:{path}:{query_string}:{region_scope}
//
// Contoh:
//   "GET:/api/overview/kpis:from=2026-01-01&to=2026-05-12:all"
//   "GET:/api/overview/kpis:from=2026-01-01&to=2026-05-12:region:uuid-xxx"
//
// Kenapa perlu region_scope di cache key?
// - SUPER_ADMIN lihat semua data → key: ":all"
// - ANALYST_REGION lihat data region A → key: ":region:uuid-A"
// - Keduanya tidak boleh dapat cache yang sama
//
// Default TTL: 5 menit (bisa di-override per endpoint)
// ============================================================

@Injectable()
export class DashboardCacheInterceptor implements NestInterceptor {
  constructor(@Inject(CACHE_MANAGER) private cacheManager: Cache) {}

  async intercept(
    context: ExecutionContext,
    next: CallHandler,
  ): Promise<Observable<unknown>> {
    const request = context.switchToHttp().getRequest<Request>();
    const user = request.user as AuthenticatedUser | undefined;

    const cacheKey = this.buildCacheKey(request, user);

    // Coba ambil dari cache
    const cached = await this.cacheManager.get(cacheKey);
    if (cached !== undefined && cached !== null) {
      return of(cached);
    }

    // Tidak ada cache → jalankan handler, simpan hasilnya
    return next.handle().pipe(
      tap((response) => {
        const ttl = this.resolveTtl(request.path);
        void this.cacheManager.set(cacheKey, response, ttl);
      }),
    );
  }

  private buildCacheKey(request: Request, user?: AuthenticatedUser): string {
    const queryString = new URLSearchParams(
      request.query as Record<string, string>,
    ).toString();

    // Scope: ANALYST_REGION dapat scope per-region, yang lain dapat "all"
    const regionScope =
      user?.role === 'ANALYST_REGION' && user.region_id
        ? `region:${user.region_id}`
        : 'all';

    return `${request.method}:${request.path}:${queryString}:${regionScope}`;
  }

  // TTL berbeda per jenis endpoint:
  // - daily_metrics sudah diagregasi → bisa cache lebih lama
  // - data realtime (orders baru) → cache lebih pendek
  private resolveTtl(path: string): number {
    if (path.includes('/overview/kpis')) return 5 * 60 * 1000; // 5 menit
    if (path.includes('/overview/charts')) return 5 * 60 * 1000;
    if (path.includes('/revenue')) return 10 * 60 * 1000; // 10 menit
    if (path.includes('/orders/heatmap')) return 15 * 60 * 1000; // 15 menit
    if (path.includes('/customers')) return 10 * 60 * 1000;
    if (path.includes('/products/top')) return 10 * 60 * 1000;
    return 5 * 60 * 1000; // default 5 menit
  }
}
