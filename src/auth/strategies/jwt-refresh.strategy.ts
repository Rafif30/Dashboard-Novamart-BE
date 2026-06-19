import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { ConfigService } from '@nestjs/config';
import { Request } from 'express';
import { PrismaService } from '../../prisma/prisma.service';
import { JwtPayload } from '../auth.types';

/**
 * JWT REFRESH STRATEGY
 *
 * Berbeda dengan JwtStrategy (access token dari header),
 * refresh token dibaca dari httpOnly cookie — lebih aman
 * karena tidak bisa diakses JavaScript di browser.
 *
 * Cara kerja:
 * 1. Request hit POST /auth/refresh
 * 2. Strategy baca refresh token dari cookie `refresh_token`
 * 3. Verifikasi dengan JWT_REFRESH_SECRET (secret BERBEDA dari access token)
 * 4. Kalau valid → issue access token baru
 */
@Injectable()
export class JwtRefreshStrategy extends PassportStrategy(
  Strategy,
  'jwt-refresh',
) {
  constructor(
    private configService: ConfigService,
    private prisma: PrismaService,
  ) {
    super({
      // Baca dari cookie, bukan header Authorization
      jwtFromRequest: ExtractJwt.fromExtractors([
        // eslint-disable-next-line @typescript-eslint/no-unsafe-return
        (req: Request) => req?.cookies?.['refresh_token'] ?? null,
      ]),
      ignoreExpiration: false,
      secretOrKey: configService.getOrThrow<string>('JWT_REFRESH_SECRET'),
      passReqToCallback: true,
    });
  }

  async validate(req: Request, payload: JwtPayload) {
    const user = await this.prisma.user.findUnique({
      where: { id: payload.sub },
      select: {
        id: true,
        email: true,
        role: true,
        region_id: true,
        is_active: true,
      },
    });

    if (!user || !user.is_active) {
      throw new UnauthorizedException('Session tidak valid');
    }

    return {
      id: user.id,
      email: user.email,
      role: user.role,
      region_id: user.region_id,
    };
  }
}
