import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { Throttle, ThrottlerGuard } from '@nestjs/throttler';
import { Public } from '../auth/public.decorator';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe';
import { AntiSpamService } from '../common/anti-spam/anti-spam.service';
import { ContactsService } from './contacts.service';
import {
  CreateContactDto,
  CreateContactSchema,
} from './dto/create-contact.dto';

/** Generic success shape returned to all callers — real or bot */
const SILENT_OK = { id: 'ok', createdAt: new Date().toISOString() } as const;

@Public()
@Controller('contacts')
export class ContactsPublicController {
  constructor(
    private readonly service: ContactsService,
    private readonly antiSpam: AntiSpamService,
  ) {}

  @Post()
  @HttpCode(201)
  @UseGuards(ThrottlerGuard)
  @Throttle({ contact: { ttl: 15 * 60 * 1000, limit: 5 } })
  async create(
    @Body(new ZodValidationPipe(CreateContactSchema)) dto: CreateContactDto,
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
      name: dto.name,
      contact: dto.contact,
      subject: dto.subject,
      message: dto.message,
      ip,
      userAgent,
    });

    // All blocked submissions — real or silent — return identical 201 to the caller.
    // Never expose which rule triggered to avoid fingerprinting the filter.
    if (spam.decision === 'block') {
      return SILENT_OK;
    }

    return this.service.create({
      name: dto.name,
      contact: dto.contact,
      subject: dto.subject,
      message: dto.message,
    });
  }
}

@Controller('admin/contacts')
export class ContactsAdminController {
  constructor(private readonly service: ContactsService) {}

  @Get()
  findAll(@Query('limit') limit?: string) {
    return this.service.findAll(limit ? parseInt(limit, 10) : 50);
  }

  @Patch(':id/read')
  markRead(@Param('id') id: string) {
    return this.service.markRead(id);
  }
}
