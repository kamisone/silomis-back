import { Controller, Get, Query } from '@nestjs/common';
import { Public } from '../../auth/public.decorator';
import { TranslationsService } from '../../translations/translations.service';
import { VariantAttributesService } from './variant-attributes.service';

const ET_VARIANT_ATTR = 'shop_variant_attribute';
const ET_VARIATION_OPTION = 'shop_variation_option_value';

@Public()
@Controller('shop/variant-attributes')
export class VariantAttributePublicController {
  constructor(
    private readonly attributes: VariantAttributesService,
    private readonly translations: TranslationsService,
  ) {}

  @Get()
  async findActive(@Query('lang') lang?: string) {
    const attrs = await this.attributes.findActive();
    const translated = await this.translations.maybeApply(attrs, ET_VARIANT_ATTR, lang);
    for (const attr of translated) {
      if (attr.optionValues?.length) {
        attr.optionValues = await this.translations.maybeApply(attr.optionValues, ET_VARIATION_OPTION, lang);
      }
    }
    return translated;
  }
}
