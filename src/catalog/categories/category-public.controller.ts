import { Controller, Get } from '@nestjs/common';
import { Public } from '../../auth/public.decorator';
import { CategoriesService } from './categories.service';

@Public()
@Controller('shop/categories')
export class CategoryPublicController {
  constructor(private readonly categories: CategoriesService) {}

  @Get()
  findActive() {
    return this.categories.findActive();
  }
}
