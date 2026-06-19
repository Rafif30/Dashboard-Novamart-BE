import {
  Injectable,
  ExecutionContext,
  CanActivate,
  ForbiddenException,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { Reflector } from '@nestjs/core';
import { Role } from '@prisma/client';
import { ROLES_KEY } from '../../common/decorators/roles.decorator';
import { AuthenticatedUser } from '../auth.types';

// ─────────────────────────────────────────────
// JWT AUTH GUARD
// Proteksi endpoint agar hanya bisa diakses
// dengan access token yang valid.
//
// Cara pakai di controller:
//   @UseGuards(JwtAuthGuard)
//   @Get('profile')
// ─────────────────────────────────────────────
@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {}

// ─────────────────────────────────────────────
// GOOGLE OAUTH GUARD
// Dipakai di dua endpoint:
// 1. GET /auth/google         → redirect ke Google
// 2. GET /auth/google/callback → tangkap profile dari Google
// ─────────────────────────────────────────────
@Injectable()
export class GoogleOAuthGuard extends AuthGuard('google') {}

// ─────────────────────────────────────────────
// JWT REFRESH GUARD
// Proteksi endpoint refresh token.
// Baca token dari httpOnly cookie.
// ─────────────────────────────────────────────
@Injectable()
export class JwtRefreshGuard extends AuthGuard('jwt-refresh') {}

// ─────────────────────────────────────────────
// ROLES GUARD
// Dipakai BERSAMA JwtAuthGuard untuk batasi
// akses berdasarkan role user.
//
// Cara pakai di controller:
//   @UseGuards(JwtAuthGuard, RolesGuard)
//   @Roles(Role.SUPER_ADMIN, Role.EXECUTIVE)
//   @Get('config')
// ─────────────────────────────────────────────
@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    // Baca role yang dibutuhkan dari decorator @Roles(...)
    const requiredRoles = this.reflector.getAllAndOverride<Role[]>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    // Kalau endpoint tidak pasang @Roles, semua role boleh akses
    if (!requiredRoles || requiredRoles.length === 0) return true;

    const request = context
      .switchToHttp()
      .getRequest<{ user: AuthenticatedUser }>();
    const user: AuthenticatedUser = request.user;

    if (!requiredRoles.includes(user.role)) {
      throw new ForbiddenException(
        `Role ${user.role} tidak memiliki akses ke resource ini`,
      );
    }

    return true;
  }
}
