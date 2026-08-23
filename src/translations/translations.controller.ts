import { Body, Controller, Delete, Get, Param, Put, Query } from '@nestjs/common';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe';
import { BulkUpsertTranslationDto, BulkUpsertTranslationSchema } from './dto/bulk-upsert-translation.dto';
import { UpsertTranslationDto, UpsertTranslationSchema } from './dto/upsert-translation.dto';
import { TranslationsService } from './translations.service';

@Controller('translations')
export class TranslationsController {
  constructor(private readonly service: TranslationsService) {}

  /** GET /api/translations/:entityType/:entityId?lang=en */
  @Get(':entityType/:entityId')
  findForEntity(
    @Param('entityType') entityType: string,
    @Param('entityId') entityId: string,
    @Query('lang') lang?: string,
  ) {
    return this.service.findForEntity(entityType, entityId, lang);
  }

  /** PUT /api/translations — upsert a single translation */
  @Put()
  upsert(@Body(new ZodValidationPipe(UpsertTranslationSchema)) dto: UpsertTranslationDto) {
    return this.service.upsert(dto);
  }

  /** PUT /api/translations/bulk — upsert many translations at once */
  @Put('bulk')
  bulkUpsert(@Body(new ZodValidationPipe(BulkUpsertTranslationSchema)) dto: BulkUpsertTranslationDto) {
    return this.service.bulkUpsert(dto);
  }

  /** DELETE /api/translations/entry/:id — delete one row by UUID */
  @Delete('entry/:id')
  deleteById(@Param('id') id: string) {
    return this.service.deleteById(id);
  }

  /** DELETE /api/translations/:entityType/:entityId — delete all rows for entity */
  @Delete(':entityType/:entityId')
  deleteForEntity(@Param('entityType') entityType: string, @Param('entityId') entityId: string) {
    return this.service.deleteForEntity(entityType, entityId);
  }
}
