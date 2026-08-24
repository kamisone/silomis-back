import { Module } from '@nestjs/common';
import { GcsModule } from '../gcs/gcs.module';
import { AssetUrlModule } from '../asset-url/asset-url.module';
import { MediaModule } from '../media/media.module';
import { TranslationsModule } from '../translations/translations.module';
import { AiModule } from '../ai/ai.module';
import { CategoriesService } from './categories/categories.service';
import { CategoryAdminController } from './categories/category-admin.controller';
import { CategoryPublicController } from './categories/category-public.controller';
import { TagsService } from './tags/tags.service';
import { TagAdminController } from './tags/tag-admin.controller';
import { VariantAttributesService } from './variant-attributes/variant-attributes.service';
import { VariantAttributeAdminController } from './variant-attributes/variant-attribute-admin.controller';
import { VariantAttributePublicController } from './variant-attributes/variant-attribute-public.controller';
import { ProductsService } from './products/products.service';
import { ProductAdminController } from './products/product-admin.controller';
import { ProductPublicController } from './products/product-public.controller';
import { VariantStockController } from './products/variant-stock.controller';
import { RecommendationService } from './recommendation.service';
import { RecommendationListener } from './recommendation.listener';
import { ProductSearchService } from './products/product-search.service';
import { ProductSearchPublicController, ProductSearchAdminController } from './products/product-search.controller';
import { SearchIndexListener } from './products/search-index.listener';
import { ReviewsModule } from '../reviews/reviews.module';

@Module({
  imports: [GcsModule, AssetUrlModule, MediaModule, TranslationsModule, ReviewsModule, AiModule],
  controllers: [CategoryAdminController, CategoryPublicController, TagAdminController, VariantAttributeAdminController, VariantAttributePublicController, ProductAdminController, ProductPublicController, VariantStockController, ProductSearchPublicController, ProductSearchAdminController],
  providers: [CategoriesService, TagsService, VariantAttributesService, ProductsService, RecommendationService, RecommendationListener, ProductSearchService, SearchIndexListener],
  exports: [CategoriesService, TagsService, VariantAttributesService, ProductsService, RecommendationService, ProductSearchService],
})
export class CatalogModule {}
