import {
  Body,
  Controller,
  Get,
  Headers,
  Post,
  HttpCode,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Public } from '../auth/public.decorator';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe';
import { SupportConversationsService } from './support-conversations.service';
import { BootstrapSchema, BootstrapDto } from './dto/send-message.dto';
import { GUEST_WS_TICKET_TTL } from './support.constants';

function extractGuestToken(header: string | undefined): string | null {
  if (!header || !/^[0-9a-f-]{36}$/i.test(header.trim())) return null;
  return header.trim();
}

// All three endpoints are BFF-internal: the Next.js server calls them, not browsers.
// Every user's request arrives from the same server IP, so per-IP throttling would
// lock out all users simultaneously after the first few calls.
// The real abuse protection is the guest-token check in each handler — a random UUID
// header is required, and the token is only ever issued via the httpOnly BFF cookie.
@Public()
@Controller('support/guest')
export class SupportGuestController {
  constructor(
    private readonly convService: SupportConversationsService,
    private readonly jwtService: JwtService,
  ) {}

  @Post('bootstrap')
  @HttpCode(200)
  async bootstrap(
    @Headers('x-support-token') tokenHeader: string | undefined,
    @Body(new ZodValidationPipe(BootstrapSchema)) dto: BootstrapDto,
  ) {
    const guestToken = extractGuestToken(tokenHeader);
    if (!guestToken) throw new UnauthorizedException('invalid_token');
    return this.convService.bootstrap(guestToken, dto.guestName);
  }

  @Get('history')
  async history(
    @Headers('x-support-token') tokenHeader: string | undefined,
    @Headers('x-support-since') since: string | undefined,
  ) {
    const guestToken = extractGuestToken(tokenHeader);
    if (!guestToken) return { messages: [] };

    const conv = await this.convService.getByGuestToken(guestToken);
    if (!conv) return { messages: [] };

    const { messages } = await this.convService.bootstrap(
      guestToken,
      undefined,
      since,
    );
    return {
      messages,
      conversationId: conv.id,
      status: conv.status,
      unreadGuestCount: conv.unreadGuestCount,
    };
  }

  @Post('ws-ticket')
  @HttpCode(200)
  async getWsTicket(
    @Headers('x-support-token') tokenHeader: string | undefined,
  ) {
    const guestToken = extractGuestToken(tokenHeader);
    if (!guestToken) throw new UnauthorizedException('invalid_token');

    const ticket = this.jwtService.sign(
      { guestToken, purpose: 'guest-ws' },
      { expiresIn: GUEST_WS_TICKET_TTL },
    );

    return { ticket };
  }
}
