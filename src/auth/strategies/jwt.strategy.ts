import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { ConfigService } from '@nestjs/config';
import { JwtPayload, AuthenticatedUser } from '../auth.types';
import { PrismaService } from '../../prisma/prisma.service';

/**
 * JWT STRATEGY
 *
 * Cara kerja:
 * 1. Request masuk dengan header: Authorization: Bearer <token>
 * 2. Strategy ekstrak token dari header
 * 3. Verifikasi signature token dengan JWT_SECRET
 * 4. Decode payload → panggil validate()
 * 5. Return value di-attach ke req.user
 *
 * Strategy ini dipakai oleh JwtAuthGuard untuk proteksi endpoint.
 */
@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy, 'jwt') {
  constructor(
    private configService: ConfigService,
    private prisma: PrismaService,
  ) {
    super({
      // Ekstrak token dari header Authorization: Bearer <token>
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      // Tolak token yang sudah expired
      ignoreExpiration: false,
      secretOrKey: configService.getOrThrow<string>('JWT_SECRET'),
    });
  }

  async validate(payload: JwtPayload): Promise<AuthenticatedUser> {
    // Cek user masih aktif di DB (bukan hanya percaya payload token)
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
      throw new UnauthorizedException('User tidak aktif atau tidak ditemukan');
    }

    // Ini yang akan tersedia sebagai req.user di controller
    return {
      id: user.id,
      email: user.email,
      role: user.role,
      region_id: user.region_id,
    };
  }
}
