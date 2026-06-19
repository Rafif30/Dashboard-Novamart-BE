import {
  Controller,
  Get,
  Post,
  Body,
  UseGuards,
  Req,
  Res,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiCookieAuth,
  ApiBearerAuth,
} from '@nestjs/swagger';
import type { Request, Response } from 'express';
import { AuthService } from './auth.service';
import {
  JwtAuthGuard,
  GoogleOAuthGuard,
  JwtRefreshGuard,
} from './guards/auth.guard';
import { CurrentUser } from '../common/decorators/roles.decorator';
import { ExchangeCodeDto } from '../common/dto/exchange-code.dto';
import * as authTypes from './auth.types';
import { RefreshTokenResponseDto } from './auth.response';
import { ConfigService } from '@nestjs/config';

@ApiTags('Auth')
@Controller('auth')
export class AuthController {
  constructor(
    private authService: AuthService,
    private configService: ConfigService,
  ) {}

  // ─────────────────────────────────────────────
  // GET /auth/google
  //
  // Endpoint pertama yang di-hit user.
  // GoogleOAuthGuard otomatis redirect browser
  // ke halaman login Google — tidak ada kode
  // tambahan yang perlu ditulis di sini.
  // ─────────────────────────────────────────────
  @Get('google')
  @UseGuards(GoogleOAuthGuard)
  @ApiOperation({
    summary: 'Initiate Google OAuth login',
    description:
      'Redirects to Google OAuth consent screen. User will be prompted to select their Google account and grant permissions.',
  })
  @ApiResponse({
    status: 302,
    description: 'Redirect to Google OAuth',
  })
  googleLogin() {
    // Handled by Passport — redirect ke Google
  }

  // ─────────────────────────────────────────────
  // GET /auth/google/callback
  //
  // Google redirect ke sini setelah user login.
  // GoogleOAuthGuard memanggil GoogleStrategy.validate()
  // yang return user → tersimpan di req.user.
  // ─────────────────────────────────────────────
  @Get('google/callback')
  @UseGuards(GoogleOAuthGuard)
  @ApiOperation({
    summary: 'Google OAuth callback',
    description:
      'Receives callback from Google after user authentication. redirects to frontend with code in URL.',
  })
  @ApiResponse({
    status: 302,
    description: 'Redirect to frontend with code in URL query parameter',
  })
  async googleCallback(@Req() req: Request, @Res() res: Response) {
    const user = req.user as authTypes.AuthenticatedUser;

    const code = await this.authService.createAuthorizationCode(user.id);

    // Redirect ke frontend dengan Code di URL
    // Frontend tangkap code dari URL, akan di excahnge di auth/token
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
    const frontendUrl = this.configService.getOrThrow('FRONTEND_URL');
    return res.redirect(`${frontendUrl}/auth/callback?code=${code}`);
  }

  // ─────────────────────────────────────────────
  // POST /auth/token
  //
  // Frontend tukar code dengan token disini.
  // validasi code yang ada di redis cache
  // return access_token dan refresh_token
  // ─────────────────────────────────────────────
  @Post('token')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Generate JWT Token',
    description: 'Receives Code from frontend, exchange code with JWT Token',
  })
  async generateToken(
    @Body() dto: ExchangeCodeDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    return this.authService.exchangeCode(dto.code, res);
  }

  // ─────────────────────────────────────────────
  // POST /auth/refresh
  //
  // Dipanggil frontend secara otomatis sebelum
  // access token expired (atau saat dapat 401).
  //
  // Baca refresh token dari httpOnly cookie →
  // issue access token baru.
  // ─────────────────────────────────────────────
  @Post('refresh')
  @UseGuards(JwtRefreshGuard)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Refresh access token',
    description:
      'Issues a new access token using the refresh token from httpOnly cookie. Automatically called by frontend before token expiration.',
  })
  @ApiCookieAuth()
  @ApiResponse({
    status: 200,
    description: 'New access token issued successfully',
    type: RefreshTokenResponseDto,
  })
  @ApiResponse({
    status: 401,
    description: 'Unauthorized - refresh token invalid or expired',
  })
  refresh(
    @CurrentUser() user: authTypes.AuthenticatedUser,
    @Res({ passthrough: true }) res: Response,
  ) {
    const { accessToken, refreshToken } = this.authService.generateTokens(user);

    // Rotate refresh token (issue yang baru, invalidate yang lama)
    this.authService.setRefreshTokenCookie(res, refreshToken);

    return {
      access_token: accessToken,
      expires_in: 15 * 60, // 15 menit dalam detik
    };
  }

  // ─────────────────────────────────────────────
  // GET /auth/me
  //
  // Ambil profil user yang sedang login.
  // Butuh access token yang valid.
  // ─────────────────────────────────────────────
  @Get('me')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('access-token')
  @ApiOperation({
    summary: 'Get current user profile',
    description: 'Retrieves the profile of the currently authenticated user.',
  })
  @ApiResponse({
    status: 200,
    description: 'User profile retrieved successfully',
  })
  @ApiResponse({
    status: 401,
    description: 'Unauthorized - invalid or missing access token',
  })
  async getMe(@CurrentUser() user: authTypes.AuthenticatedUser) {
    return this.authService.getProfile(user.id);
  }

  // ─────────────────────────────────────────────
  // POST /auth/logout
  //
  // Hapus refresh token cookie.
  // Frontend juga harus hapus access token dari memory.
  // ─────────────────────────────────────────────
  @Post('logout')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Logout current user',
    description:
      'Logs out the current user by clearing the refresh token cookie. Frontend should also clear the access token from memory.',
  })
  @ApiResponse({
    status: 200,
    description: 'Logout successful',
  })
  @ApiResponse({
    status: 401,
    description: 'Unauthorized - invalid or missing access token',
  })
  logout(
    @CurrentUser() user: authTypes.AuthenticatedUser,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    this.authService.clearRefreshTokenCookie(res);
    return { message: 'Logout berhasil' };
  }
}
