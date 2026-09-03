import { Controller, Get, Query } from '@nestjs/common';
import { Public } from '../../auth/public.decorator';
import { CategoriesService } from './categories.service';

@Public()
@Controller('shop/categories')
export class CategoryPublicController {
  constructor(private readonly categories: CategoriesService) {}

  @Get()
  findActive(@Query('lang') lang?: string) {
    return this.categories.findActive(lang);
  }
}
