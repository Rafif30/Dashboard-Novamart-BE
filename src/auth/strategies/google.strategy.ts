import { Injectable } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { Strategy, VerifyCallback, Profile } from 'passport-google-oauth20';
import { ConfigService } from '@nestjs/config';
import { AuthService } from '../auth.service';

/**
 * GOOGLE STRATEGY
 *
 * Cara kerja:
 * 1. User hit GET /auth/google  → Passport redirect ke halaman login Google
 * 2. User login & setuju → Google redirect ke GET /auth/google/callback
 *    dengan query param `code`
 * 3. Passport tukar `code` dengan access_token ke server Google
 * 4. Google kembalikan profile user (id, email, nama, foto)
 * 5. Method `validate()` di bawah dipanggil dengan profile tersebut
 * 6. Return value dari validate() di-attach ke req.user
 */
@Injectable()
export class GoogleStrategy extends PassportStrategy(Strategy, 'google') {
  constructor(
    private configService: ConfigService,
    private authService: AuthService,
  ) {
    super({
      clientID: configService.getOrThrow<string>('GOOGLE_CLIENT_ID'),
      clientSecret: configService.getOrThrow<string>('GOOGLE_CLIENT_SECRET'),
      callbackURL: configService.getOrThrow<string>('GOOGLE_CALLBACK_URL'),
      scope: ['email', 'profile'], // data yang kita minta dari Google
    });
  }

  async validate(
    _accessToken: string,
    _refreshToken: string,
    profile: Profile,
    done: VerifyCallback,
  ): Promise<void> {
    const email = profile.emails?.[0]?.value;
    const avatar = profile.photos?.[0]?.value;

    if (!email) {
      return done(new Error('No email returned from Google'), undefined);
    }

    // Serahkan ke AuthService untuk cek/buat user di DB
    const user = await this.authService.findOrCreateFromOAuth({
      provider: 'GOOGLE',
      provider_user_id: profile.id,
      provider_email: email,
      name: profile.displayName,
      avatar_url: avatar ?? null,
    });

    done(null, user);
  }
}
