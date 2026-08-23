import { Module } from '@nestjs/common';
import { AntiSpamService } from './anti-spam.service';
import { TurnstileService } from './turnstile.service';

@Module({
  providers: [AntiSpamService, TurnstileService],
  exports: [AntiSpamService],
})
export class AntiSpamModule {}
