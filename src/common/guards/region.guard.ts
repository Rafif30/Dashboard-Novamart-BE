import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
} from '@nestjs/common';
import { AuthenticatedUser } from '../../auth/auth.types';
import { Request } from 'express';

// ============================================================
// RegionGuard
//
// Guard ini dipakai di semua endpoint dashboard yang
// mengembalikan data berdasarkan region.
//
// Cara kerja:
// - SUPER_ADMIN & EXECUTIVE: boleh query region mana saja.
//   Kalau tidak kirim ?region_id, dapat semua region.
// - ANALYST_REGION: region_id di query param SELALU di-override
//   dengan region_id milik user tersebut.
//   Mereka tidak bisa lihat data region lain meski kirim
//   ?region_id yang berbeda.
//
// Cara pakai di controller:
//   @UseGuards(JwtAuthGuard, RegionGuard)
//   @Get('kpis')
//   getKpis(@Query() dto: DateRangeDto) { ... }
//
// Setelah guard ini jalan, dto.region_id sudah aman dipakai
// di service tanpa perlu cek role lagi.
// ============================================================

@Injectable()
export class RegionGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<Request>();
    const user = request.user as AuthenticatedUser;

    if (!user) return false;

    if (user.role === 'ANALYST_REGION') {
      if (!user.region_id) {
        throw new ForbiddenException(
          'Akun Analyst kamu belum dikonfigurasi region. Hubungi administrator.',
        );
      }

      // Force override — ANALYST tidak bisa ganti region_id via query param
      request.query.region_id = user.region_id;
    }

    // SUPER_ADMIN & EXECUTIVE: biarkan query param apa adanya
    return true;
  }
}
