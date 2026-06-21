import { Injectable, ForbiddenException, Logger, Inject } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import { OAuthProvider } from '@prisma/client';
import { JwtPayload, AuthenticatedUser } from './auth.types';
import { Response } from 'express';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import type { Cache } from 'cache-manager';
import { randomUUID } from 'crypto';

interface OAuthProfile {
  provider: OAuthProvider;
  provider_user_id: string;
  provider_email: string;
  name: string;
  avatar_url: string | null;
}

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private prisma: PrismaService,
    private jwtService: JwtService,
    private configService: ConfigService,
    @Inject(CACHE_MANAGER)
    private cacheManager: Cache,
  ) {}

  // ─────────────────────────────────────────────
  // FIND OR CREATE USER FROM OAUTH
  //
  // Dipanggil oleh GoogleStrategy setelah Google
  // berhasil return profile user.
  //
  // Alur:
  // 1. Cari OAuthAccount berdasarkan provider + provider_user_id
  // 2. Kalau ada → return user-nya langsung
  // 3. Kalau tidak ada → cek apakah email sudah terdaftar
  //    - Kalau email ada → link akun OAuth ke user existing
  //    - Kalau email belum ada → TOLAK (user harus dibuat admin dulu)
  // ─────────────────────────────────────────────
  async findOrCreateFromOAuth(
    profile: OAuthProfile,
  ): Promise<AuthenticatedUser> {
    // Cek apakah OAuthAccount sudah ada
    const existingOAuth = await this.prisma.oAuthAccount.findUnique({
      where: {
        provider_provider_user_id: {
          provider: profile.provider,
          provider_user_id: profile.provider_user_id,
        },
      },
      include: { user: true },
    });

    if (existingOAuth) {
      // Update avatar kalau berubah
      if (existingOAuth.user.avatar_url !== profile.avatar_url) {
        await this.prisma.user.update({
          where: { id: existingOAuth.user.id },
          data: { avatar_url: profile.avatar_url },
        });
      }

      const u = existingOAuth.user;
      return { id: u.id, email: u.email, role: u.role, region_id: u.region_id };
    }

    // OAuthAccount belum ada — cek apakah email terdaftar
    let userByEmail = await this.prisma.user.findUnique({
      where: { email: profile.provider_email },
    });

    if (!userByEmail) {
      // Bikin User Baru dengan default ROLE = ANALYST_REGION and Region = Jawa
      const regionIDJawa = await this.prisma.region.findUnique({
        where: { name: 'Jawa' },
      });
      userByEmail = await this.prisma.user.create({
        data: {
          name: profile.name,
          email: profile.provider_email,
          role: 'ANALYST_REGION',
          region_id: regionIDJawa?.id,
          is_active: true,
        },
      });
    }

    if (!userByEmail.is_active) {
      throw new ForbiddenException('Akun kamu telah dinonaktifkan.');
    }

    // Email ada → link OAuth ke user existing
    await this.prisma.oAuthAccount.create({
      data: {
        user_id: userByEmail.id,
        provider: profile.provider,
        provider_user_id: profile.provider_user_id,
        provider_email: profile.provider_email,
      },
    });

    // Update avatar kalau belum ada
    if (!userByEmail.avatar_url && profile.avatar_url) {
      await this.prisma.user.update({
        where: { id: userByEmail.id },
        data: { avatar_url: profile.avatar_url },
      });
    }

    this.logger.log(
      `OAuth linked: ${profile.provider_email} via ${profile.provider}`,
    );

    return {
      id: userByEmail.id,
      email: userByEmail.email,
      role: userByEmail.role,
      region_id: userByEmail.region_id,
    };
  }

  // ─────────────────────────────────────────────
  // GENERATE TOKEN PAIR
  //
  // Buat access token (short-lived) dan
  // refresh token (long-lived).
  //
  // Access token  → dikirim dalam response body
  // Refresh token → dikirim via httpOnly cookie
  // ─────────────────────────────────────────────
  generateTokens(user: AuthenticatedUser): {
    accessToken: string;
    refreshToken: string;
  } {
    const payload: JwtPayload = {
      sub: user.id,
      email: user.email,
      role: user.role,
      region_id: user.region_id,
    };

    const accessToken = this.jwtService.sign(payload, {
      secret: this.configService.getOrThrow('JWT_SECRET'),
      expiresIn: this.configService.get('JWT_EXPIRES_IN', '15m'),
    });

    const refreshToken = this.jwtService.sign(payload, {
      secret: this.configService.getOrThrow('JWT_REFRESH_SECRET'),
      expiresIn: this.configService.get('JWT_REFRESH_EXPIRES_IN', '7d'),
    });

    return { accessToken, refreshToken };
  }

  // ─────────────────────────────────────────────
  // Create Auth CODE
  //
  // bikin auth code disini
  // simpan code di redis cache
  // ─────────────────────────────────────────────
  async createAuthorizationCode(userId: string): Promise<string> {
    const code = randomUUID();

    await this.cacheManager.set(`oauth:${code}`, userId, 5 * 60 * 1000);

    return code;
  }

  // ─────────────────────────────────────────────
  // EXCHANGE CODE
  //
  // exchange code with token
  //
  // validasi token dengan cache redis
  // ─────────────────────────────────────────────
  async exchangeCode(code: string, res: Response) {
    const userId = await this.cacheManager.get<string>(`oauth:${code}`);

    if (!userId) {
      throw new ForbiddenException('Invalid authorization code');
    }

    await this.cacheManager.del(`oauth:${code}`);

    const user = await this.prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user) {
      throw new ForbiddenException('User not found');
    }

    const { accessToken, refreshToken } = this.generateTokens({
      id: user.id,
      email: user.email,
      role: user.role,
      region_id: user.region_id,
    });

    this.setRefreshTokenCookie(res, refreshToken);

    return {
      access_token: accessToken,
      expires_in: 15 * 60,
    };
  }

  // ─────────────────────────────────────────────
  // SET REFRESH TOKEN COOKIE
  //
  // httpOnly  → tidak bisa dibaca JavaScript (aman dari XSS)
  // secure    → hanya dikirim via HTTPS (di production)
  // sameSite  → batasi pengiriman cookie cross-site (CSRF protection)
  // ─────────────────────────────────────────────
  setRefreshTokenCookie(res: Response, refreshToken: string): void {
    const isProd = this.configService.get('NODE_ENV') === 'production';

    res.cookie('refresh_token', refreshToken, {
      httpOnly: true,
      secure: isProd,
      sameSite: 'lax',
      maxAge: 7 * 24 * 60 * 60 * 1000, // 7 hari dalam milidetik
      path: '/', // cookie hanya dikirim ke endpoint ini
    });
  }

  // Hapus cookie saat logout
  clearRefreshTokenCookie(res: Response): void {
    res.clearCookie('refresh_token', { path: '/' });
  }

  // Update last_login
  async updateLastLogin(userId: string): Promise<void> {
    await this.prisma.user.update({
      where: { id: userId },
      data: { last_login: new Date() },
    });
  }

  // Simpan audit log
  async logActivity(
    userId: string,
    action: string,
    ipAddress?: string,
  ): Promise<void> {
    await this.prisma.auditLog.create({
      data: { user_id: userId, action, ip_address: ipAddress },
    });
  }

  // Ambil profil user lengkap (untuk GET /auth/me)
  async getProfile(userId: string) {
    return this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        name: true,
        email: true,
        avatar_url: true,
        role: true,
        region_id: true,
        last_login: true,
        region: {
          select: { id: true, name: true, slug: true },
        },
      },
    });
  }
}
