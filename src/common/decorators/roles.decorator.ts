import { SetMetadata } from '@nestjs/common';
import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { Role } from '@prisma/client';
import { AuthenticatedUser } from '../../auth/auth.types';

// ─────────────────────────────────────────────
// @Roles() DECORATOR
//
// Tandai endpoint dengan role yang diizinkan.
// Dipakai bersama RolesGuard.
//
// Contoh:
//   @Roles(Role.SUPER_ADMIN)              ← hanya super admin
//   @Roles(Role.SUPER_ADMIN, Role.EXECUTIVE) ← super admin atau executive
// ─────────────────────────────────────────────
export const ROLES_KEY = 'roles';
export const Roles = (...roles: Role[]) => SetMetadata(ROLES_KEY, roles);

// ─────────────────────────────────────────────
// @CurrentUser() DECORATOR
//
// Shortcut untuk ambil req.user di parameter controller.
//
// Tanpa decorator:
//   @Get('me')
//   getMe(@Request() req) {
//     return req.user;
//   }
//
// Dengan decorator:
//   @Get('me')
//   getMe(@CurrentUser() user: AuthenticatedUser) {
//     return user;
//   }
// ─────────────────────────────────────────────
export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): AuthenticatedUser => {
    const request = ctx
      .switchToHttp()
      .getRequest<{ user: AuthenticatedUser }>();
    return request.user;
  },
);
