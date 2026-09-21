import { Body, Controller, Get, Post, Request } from '@nestjs/common';
import { RateLimit } from '../common/throttling/rate-limit.decorator';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe';
import { AuthService } from './auth.service';
import { MfaService } from './mfa.service';
import { LoginDto, LoginSchema } from './dto/login.dto';
import { RefreshDto, RefreshSchema } from './dto/refresh.dto';
import { MfaSendDto, MfaSendSchema } from './dto/mfa-send.dto';
import { MfaVerifyDto, MfaVerifySchema } from './dto/mfa-verify.dto';
import { Public } from './public.decorator';

// 10 attempts per 15 minutes, applied per route below rather than to the
// whole controller — `me` is a passive session check that navigation calls on
// every request, and throttling it would log admins out for browsing quickly.
const AUTH_LIMIT = [10, 15] as const;

@Controller('auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly mfaService: MfaService,
  ) {}

  /**
   * Called by session-resolution logic on every navigation / proxied API
   * request — deliberately NOT rate-limited. It's a passive "is this token
   * still valid" read, not an attack surface.
   */
  @Get('me')
  me(@Request() req: { user: { id: string; email: string } }) {
    return req.user;
  }

  @Public()
  @RateLimit(...AUTH_LIMIT)
  @Post('login')
  login(@Body(new ZodValidationPipe(LoginSchema)) body: LoginDto) {
    return this.authService.login(body.email, body.password);
  }

  @Public()
  @RateLimit(...AUTH_LIMIT)
  @Post('refresh')
  refresh(@Body(new ZodValidationPipe(RefreshSchema)) body: RefreshDto) {
    return this.authService.refresh(body.refresh_token);
  }

  @Public()
  @RateLimit(...AUTH_LIMIT)
  @Post('logout')
  async logout(@Body(new ZodValidationPipe(RefreshSchema)) body: RefreshDto) {
    await this.authService.logout(body.refresh_token);
    return { ok: true };
  }

  @Public()
  @RateLimit(...AUTH_LIMIT)
  @Post('mfa/send')
  mfaSend(@Body(new ZodValidationPipe(MfaSendSchema)) body: MfaSendDto) {
    return this.mfaService.resend(body.challengeToken, body.method);
  }

  @Public()
  @RateLimit(...AUTH_LIMIT)
  @Post('mfa/verify')
  mfaVerify(@Body(new ZodValidationPipe(MfaVerifySchema)) body: MfaVerifyDto) {
    return this.authService.verifyMfa(body.challengeToken, body.otp);
  }
}
