import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { z } from 'zod';
import { Public } from '../auth/public.decorator';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe';
import { TranslationService } from '../ai/translation.service';
import { CountriesService } from './countries.service';
import { Country } from '../../generated/prisma/client';

const TranslateTextSchema = z.object({ text: z.string().min(1).max(200) });

@Public()
@Controller('shop/countries')
export class CountryPublicController {
  constructor(private readonly countries: CountriesService) {}

  @Get()
  list(@Query('lang') lang?: string) {
    return this.countries.listActive(lang);
  }
}

@Controller('admin/shop/countries')
export class CountryAdminController {
  constructor(
    private readonly countries: CountriesService,
    private readonly translation: TranslationService,
  ) {}

  @Get()
  listAll() {
    return this.countries.listAll();
  }

  @Post()
  create(@Body() dto: Partial<Country> & { isoCode: string; name: string }) {
    return this.countries.create(dto);
  }

  // ── AI translation ─────────────────────────────────────────────────────
  // The admin writes the country name in English, then clicks "Generate" to
  // get the base language plus the other overlay languages.
  @Post('sections/name/translate')
  translateNameSection(
    @Body(new ZodValidationPipe(TranslateTextSchema))
    dto: z.infer<typeof TranslateTextSchema>,
  ) {
    return this.translation.translateCountryName(dto.text);
  }

  @Patch(':isoCode')
  @HttpCode(200)
  patch(
    @Param('isoCode') isoCode: string,
    @Body() dto: Partial<Omit<Country, 'isoCode'>>,
  ) {
    return this.countries.patch(isoCode, dto);
  }

  @Delete(':isoCode')
  @HttpCode(204)
  remove(@Param('isoCode') isoCode: string) {
    return this.countries.remove(isoCode);
  }
}
