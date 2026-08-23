import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  Post,
  Query,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import { Response } from 'express';
import { Throttle, ThrottlerGuard } from '@nestjs/throttler';
import { Public } from '../auth/public.decorator';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe';
import { AntiSpamService } from '../common/anti-spam/anti-spam.service';
import { NewsletterService } from './newsletter.service';
import {
  CreateNewsletterSubscriberDto,
  CreateNewsletterSubscriberSchema,
} from './dto/create-newsletter-subscriber.dto';

/** Generic success shape returned to all callers — real or bot */
const SILENT_OK = { id: 'ok', createdAt: new Date().toISOString() } as const;

/** 1x1 transparent GIF, used as the email open-tracking pixel */
const TRACKING_PIXEL = Buffer.from(
  'R0lGODlhAQABAAAAACH5BAEKAAEALAAAAAABAAEAAAICTAEAOw==',
  'base64',
);

@Public()
@Controller('newsletter')
export class NewsletterController {
  constructor(
    private readonly service: NewsletterService,
    private readonly antiSpam: AntiSpamService,
  ) {}

  @Post()
  @HttpCode(201)
  @UseGuards(ThrottlerGuard)
  @Throttle({ contact: { ttl: 15 * 60 * 1000, limit: 5 } })
  async subscribe(
    @Body(new ZodValidationPipe(CreateNewsletterSubscriberSchema))
    dto: CreateNewsletterSubscriberDto,
    @Req() req: Request & { ip?: string; headers: Record<string, string> },
  ) {
    const forwarded = (req.headers['x-forwarded-for'] ?? '')
      .split(',')[0]
      .trim();
    const ip = req.ip ?? (forwarded || null);
    const userAgent = req.headers['user-agent'];

    const spam = await this.antiSpam.evaluate({
      honeypot: dto._hp,
      renderedAt: dto._t,
      turnstileToken: dto._token,
      name: '',
      contact: dto.email,
      subject: '',
      message: '',
      ip,
      userAgent,
    });

    // All blocked submissions — real or silent — return identical 201 to the caller.
    if (spam.decision === 'block') {
      return SILENT_OK;
    }

    return this.service.subscribe(dto);
  }

  @Get('unsubscribe/:token')
  async unsubscribe(@Param('token') token: string, @Res() res: Response) {
    const subscriber = await this.service.unsubscribeByToken(token);

    const message = subscriber
      ? `<p>Vous avez été désabonné avec succès.</p><p>You have been successfully unsubscribed.</p>`
      : `<p>Lien de désabonnement invalide ou déjà utilisé.</p><p>Invalid or already-used unsubscribe link.</p>`;

    res.type('html').send(`<!DOCTYPE html>
<html><head><meta charset="utf-8"><title>Unsubscribe</title>
<style>body{font-family:Arial,sans-serif;max-width:480px;margin:80px auto;text-align:center;color:#1a1a1a}</style>
</head><body><h1>Newsletter</h1>${message}</body></html>`);
  }

  @Get('track/open/:token')
  async trackOpen(@Param('token') token: string, @Res() res: Response) {
    await this.service.recordOpen(token);
    res.set('Content-Type', 'image/gif');
    res.set('Cache-Control', 'no-store, no-cache, must-revalidate');
    res.send(TRACKING_PIXEL);
  }

  @Get('track/click/:token')
  async trackClick(
    @Param('token') token: string,
    @Query('u') u: string | undefined,
    @Res() res: Response,
  ) {
    await this.service.recordClick(token);
    const target = u ? decodeURIComponent(u) : (process.env.APP_URL ?? '/');
    res.redirect(302, target);
  }
}
