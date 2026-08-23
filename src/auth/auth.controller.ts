import { Body, Controller, Get, Post, Request, UseGuards } from '@nestjs/common';
import { Throttle, ThrottlerGuard } from '@nestjs/throttler';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe';
import { AuthService } from './auth.service';
import { MfaService } from './mfa.service';
import { LoginDto, LoginSchema } from './dto/login.dto';
import { RefreshDto, RefreshSchema } from './dto/refresh.dto';
import { MfaSendDto, MfaSendSchema } from './dto/mfa-send.dto';
import { MfaVerifyDto, MfaVerifySchema } from './dto/mfa-verify.dto';
import { Public } from './public.decorator';

// 10 attempts per 15 minutes per IP — applied per-route below, not at the
// controller level. `@nestjs/throttler` checks EVERY named bucket registered
// in ThrottlerModule.forRoot(...) against any route under
// `@UseGuards(ThrottlerGuard)`, not just the bucket(s) named in that route's
// own `@Throttle(...)`. Guarding only the credential-guessing-relevant
// routes (login/refresh/mfa/logout) — and never `me` — keeps the passive
// session-check route from ever being throttled.
const AUTH_THROTTLE = { auth: { ttl: 15 * 60 * 1000, limit: 10 } };

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
  @UseGuards(ThrottlerGuard)
  @Throttle(AUTH_THROTTLE)
  @Post('login')
  login(@Body(new ZodValidationPipe(LoginSchema)) body: LoginDto) {
    return this.authService.login(body.email, body.password);
  }

  @Public()
  @UseGuards(ThrottlerGuard)
  @Throttle(AUTH_THROTTLE)
  @Post('refresh')
  refresh(@Body(new ZodValidationPipe(RefreshSchema)) body: RefreshDto) {
    return this.authService.refresh(body.refresh_token);
  }

  @Public()
  @UseGuards(ThrottlerGuard)
  @Throttle(AUTH_THROTTLE)
  @Post('logout')
  async logout(@Body(new ZodValidationPipe(RefreshSchema)) body: RefreshDto) {
    await this.authService.logout(body.refresh_token);
    return { ok: true };
  }

  @Public()
  @UseGuards(ThrottlerGuard)
  @Throttle(AUTH_THROTTLE)
  @Post('mfa/send')
  mfaSend(@Body(new ZodValidationPipe(MfaSendSchema)) body: MfaSendDto) {
    return this.mfaService.resend(body.challengeToken, body.method);
  }

  @Public()
  @UseGuards(ThrottlerGuard)
  @Throttle(AUTH_THROTTLE)
  @Post('mfa/verify')
  mfaVerify(@Body(new ZodValidationPipe(MfaVerifySchema)) body: MfaVerifyDto) {
    return this.authService.verifyMfa(body.challengeToken, body.otp);
  }
}
