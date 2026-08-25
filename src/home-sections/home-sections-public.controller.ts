import { Controller, Get, Query } from '@nestjs/common';
import { Public } from '../auth/public.decorator';
import { HomeSectionsService } from './home-sections.service';
import { HeroSlidesService } from './hero-slides.service';

@Public()
@Controller('shop')
export class HomeSectionsPublicController {
  constructor(
    private readonly sections: HomeSectionsService,
    private readonly heroSlides: HeroSlidesService,
  ) {}

  @Get('home-sections')
  listSections() {
    return this.sections.publicList();
  }

  @Get('hero-slides')
  listHeroSlides(@Query('lang') lang?: string) {
    return this.heroSlides.publicList(lang);
  }
}
