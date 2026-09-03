import { Controller, Get, Param, Query } from '@nestjs/common';
import { Public } from '../../auth/public.decorator';
import { TranslationsService } from '../../translations/translations.service';
import { ET_SHOP_CATEGORY_FILTER, ET_SHOP_CATEGORY_FILTER_VALUE } from '../../translations/translation-entities';
import { CategoryFiltersService } from './category-filters.service';

@Public()
@Controller('shop/categories/:categoryId/filters')
export class CategoryFiltersPublicController {
  constructor(
    private readonly filters: CategoryFiltersService,
    private readonly translations: TranslationsService,
  ) {}

  @Get()
  async find(@Param('categoryId') categoryId: string, @Query('lang') lang?: string) {
    const [rawFilters, priceBounds] = await Promise.all([
      this.filters.findActiveForCategory(categoryId),
      this.filters.priceBounds(categoryId),
    ]);

    const translatedFilters = await this.translations.maybeApply(rawFilters, ET_SHOP_CATEGORY_FILTER, lang);
    for (const filter of translatedFilters) {
      if (filter.values?.length) {
        filter.values = await this.translations.maybeApply(filter.values, ET_SHOP_CATEGORY_FILTER_VALUE, lang);
      }
    }

    return { filters: translatedFilters, priceBounds };
  }
}
