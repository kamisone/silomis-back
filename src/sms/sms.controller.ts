import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { z } from 'zod';
import { Public } from '../auth/public.decorator';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe';
import { SmsType } from '../../generated/prisma/client';
import { SmsService } from './sms.service';

const SmsMessageSchema = z.object({
  to: z.string().min(1, 'to is required'),
  message: z.string().min(1, 'message is required'),
});

type SmsMessageDto = z.infer<typeof SmsMessageSchema>;

/**
 * Polling endpoints for a device-based SMS gateway (an Android phone running
 * an SMS-forwarder app, or similar) to pick up outbound MFA/notification
 * messages and report delivery.
 */
@Controller()
export class SmsController {
  constructor(private readonly smsService: SmsService) {}

  @Public()
  @Get('sms')
  getSmsToSend(@Query('type') type: SmsType = 'outbound', @Query('to') to?: string) {
    return this.smsService.pollNext(type, to ? this.normalizeQueryPhone(to) : undefined);
  }

  @Get('sms-all')
  getAllSms() {
    return this.smsService.pollAll();
  }

  @Get('sms/last-consumed')
  getLastConsumed(@Query('to') to: string) {
    return this.smsService.getLastConsumed(this.normalizeQueryPhone(to));
  }

  private normalizeQueryPhone(raw: string): string {
    // Express decodes '+' as space in query strings; restore it then strip whitespace
    const restored = raw.startsWith(' ') ? '+' + raw.slice(1) : raw;
    return restored.replace(/\s+/g, '').replace(/^00/, '+');
  }

  @Public()
  @Post('sms/ack/:id')
  async ackSms(@Param('id') id: string) {
    return this.smsService.ack(parseInt(id, 10));
  }

  @Public()
  @Post('sms')
  sendSms(@Body(new ZodValidationPipe(SmsMessageSchema)) body: SmsMessageDto) {
    return this.smsService.addMessage(body.to, body.message);
  }

  /**
   * The gateway posts replies back here, which is the only way an `inbound`
   * row is ever created — without it `getLastConsumed` and a `type=inbound`
   * poll can only ever come back empty.
   *
   * Vitecamio also hands each reply to its rent-sessions service, which is how
   * a customer texting back drives a rental. Silomis has no such domain, so an
   * inbound message is recorded and nothing acts on it yet; anything that wants
   * to react to replies hooks in here.
   */
  @Public()
  @Post('receive')
  receiveFromGateway(@Body(new ZodValidationPipe(SmsMessageSchema)) body: SmsMessageDto) {
    return this.smsService.addMessage(body.to, body.message, 'inbound');
  }
}
