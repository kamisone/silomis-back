import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post, Put, Query, UploadedFile, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { z } from 'zod';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { GcsService } from '../../gcs/gcs.service';
import { AssetUrlService } from '../../asset-url/asset-url.service';
import { TranslationService } from '../../ai/translation.service';
import { ProductsService } from './products.service';
import {
  CreateProductDto,
  CreateProductSchema,
  CreateVariantDto,
  CreateVariantSchema,
  UpdateProductDto,
  UpdateProductSchema,
  UpdateVariantDto,
  UpdateVariantSchema,
} from './dto/product.dto';

const MAX_DOC_BYTES = 20 * 1024 * 1024;
const ALLOWED_DOC_MIMES = ['application/pdf'];

const TranslateTextSchema = z.object({ text: z.string().min(1).max(500) });
const TranslateShortTextSchema = z.object({ text: z.string().min(1).max(2000) });
const TranslateHtmlSchema = z.object({ html: z.string().min(1) });
const TranslateInfoSectionSchema = z.object({ label: z.string().min(1).max(200), value: z.string().min(1).max(5000) });
const TranslateFaqSchema = z.object({ question: z.string().min(1).max(300), answer: z.string().min(1).max(5000) });
const TranslateStoryItemSchema = z.object({ title: z.string().min(1).max(300), description: z.string().min(1).max(5000) });
const TranslateTrustBadgeSchema = z.object({ title: z.string().min(1).max(200), subtitle: z.string().max(300) });
const TranslateSocialVideoSchema = z.object({ text: z.string().min(1).max(60) });

@Controller('admin/shop/products')
export class ProductAdminController {
  constructor(
    private readonly products: ProductsService,
    private readonly gcs: GcsService,
    private readonly urls: AssetUrlService,
    private readonly translation: TranslationService,
  ) {}

  @Get()
  list(
    @Query('status') status?: string,
    @Query('search') search?: string,
    @Query('featured') featured?: string,
    @Query('isTestProduct') isTestProduct?: string,
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
  ) {
    return this.products.adminList({
      status,
      search,
      featured: featured === 'true' ? true : featured === 'false' ? false : undefined,
      isTestProduct: isTestProduct === 'true' ? true : isTestProduct === 'false' ? false : undefined,
      limit: limit ? parseInt(limit, 10) : undefined,
      offset: offset ? parseInt(offset, 10) : undefined,
    });
  }

  @Get('deleted')
  listDeleted(@Query('search') search?: string, @Query('limit') limit?: string, @Query('offset') offset?: string) {
    return this.products.adminListDeleted({
      search,
      limit: limit ? parseInt(limit, 10) : undefined,
      offset: offset ? parseInt(offset, 10) : undefined,
    });
  }

  @Get(':id')
  getOne(@Param('id') id: string) {
    return this.products.findById(id);
  }

  @Post()
  create(@Body(new ZodValidationPipe(CreateProductSchema)) dto: CreateProductDto) {
    return this.products.create(dto);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body(new ZodValidationPipe(UpdateProductSchema)) dto: UpdateProductDto) {
    return this.products.update(id, dto);
  }

  @Post(':id/publish')
  publish(@Param('id') id: string) {
    return this.products.publish(id);
  }

  @Post(':id/archive')
  archive(@Param('id') id: string) {
    return this.products.archive(id);
  }

  @Delete(':id')
  @HttpCode(204)
  remove(@Param('id') id: string) {
    return this.products.softDelete(id);
  }

  @Delete(':id/permanent')
  @HttpCode(204)
  hardDelete(@Param('id') id: string) {
    return this.products.hardDelete(id);
  }

  @Post(':id/restore')
  restore(@Param('id') id: string) {
    return this.products.restore(id);
  }

  // ── Section AI translation ────────────────────────────────────────────────
  // One endpoint per content section on the product-edit page. The admin
  // writes the section in English (the shop's base language), then clicks
  // "Generate" to get the 6 overlay languages back.

  @Post('sections/title/translate')
  @HttpCode(200)
  translateTitleSection(@Body(new ZodValidationPipe(TranslateTextSchema)) dto: z.infer<typeof TranslateTextSchema>) {
    return this.translation.translateTitle(dto.text);
  }

  @Post('sections/short-description/translate')
  @HttpCode(200)
  translateShortDescriptionSection(@Body(new ZodValidationPipe(TranslateShortTextSchema)) dto: z.infer<typeof TranslateShortTextSchema>) {
    return this.translation.translateShortDescription(dto.text);
  }

  @Post('sections/description/translate')
  @HttpCode(200)
  translateDescriptionSection(@Body(new ZodValidationPipe(TranslateHtmlSchema)) dto: z.infer<typeof TranslateHtmlSchema>) {
    return this.translation.translateDescription(dto.html);
  }

  @Post('sections/info-sections/translate')
  @HttpCode(200)
  translateInfoSectionsSection(@Body(new ZodValidationPipe(TranslateInfoSectionSchema)) dto: z.infer<typeof TranslateInfoSectionSchema>) {
    return this.translation.translateInfoSection(dto);
  }

  @Post('sections/faqs/translate')
  @HttpCode(200)
  translateFaqsSection(@Body(new ZodValidationPipe(TranslateFaqSchema)) dto: z.infer<typeof TranslateFaqSchema>) {
    return this.translation.translateFaq(dto);
  }

  @Post('sections/story-items/translate')
  @HttpCode(200)
  translateStoryItemsSection(@Body(new ZodValidationPipe(TranslateStoryItemSchema)) dto: z.infer<typeof TranslateStoryItemSchema>) {
    return this.translation.translateStoryItem(dto);
  }

  @Post('sections/trust-badges/translate')
  @HttpCode(200)
  translateTrustBadgeSection(@Body(new ZodValidationPipe(TranslateTrustBadgeSchema)) dto: z.infer<typeof TranslateTrustBadgeSchema>) {
    return this.translation.translateTrustBadge(dto);
  }

  @Post('sections/social-videos/translate')
  @HttpCode(200)
  translateSocialVideoSection(@Body(new ZodValidationPipe(TranslateSocialVideoSchema)) dto: z.infer<typeof TranslateSocialVideoSchema>) {
    return this.translation.translateSocialVideo(dto.text);
  }

  @Post('sections/story-narrative-title/translate')
  @HttpCode(200)
  translateStoryNarrativeTitleSection(@Body(new ZodValidationPipe(TranslateTextSchema)) dto: z.infer<typeof TranslateTextSchema>) {
    return this.translation.translateStoryNarrativeTitle(dto.text);
  }

  @Post('sections/social-videos-title/translate')
  @HttpCode(200)
  translateSocialVideosTitleSection(@Body(new ZodValidationPipe(TranslateTextSchema)) dto: z.infer<typeof TranslateTextSchema>) {
    return this.translation.translateSocialVideosTitle(dto.text);
  }

  // ── Variants ──────────────────────────────────────────────────────────

  @Post(':id/variants')
  addVariant(@Param('id') productId: string, @Body(new ZodValidationPipe(CreateVariantSchema)) dto: CreateVariantDto) {
    return this.products.addVariant(productId, dto);
  }

  @Patch(':id/variants/:variantId')
  updateVariant(@Param('variantId') variantId: string, @Body(new ZodValidationPipe(UpdateVariantSchema)) dto: UpdateVariantDto) {
    return this.products.updateVariant(variantId, dto);
  }

  @Delete(':id/variants/:variantId')
  @HttpCode(204)
  deleteVariant(@Param('variantId') variantId: string) {
    return this.products.deleteVariant(variantId);
  }

  /** Generate all possible variant combinations from the product's linked attributes. */
  @Post(':id/variants/generate-combinations')
  @HttpCode(200)
  generateCombinations(@Param('id') productId: string) {
    return this.products.generateVariantCombinations(productId);
  }

  // ── Product-level attribute scoping ─────────────────────────────────────

  @Get(':id/attributes')
  getAttributes(@Param('id') id: string) {
    return this.products.getProductAttributes(id);
  }

  @Post(':id/attributes')
  addAttribute(@Param('id') productId: string, @Body() dto: { attributeId: string; defaultOptionValueId?: string | null; sortOrder?: number }) {
    return this.products.addProductAttribute(productId, dto.attributeId, dto.defaultOptionValueId, dto.sortOrder);
  }

  @Patch(':id/attributes/:attributeId')
  updateAttribute(@Param('id') productId: string, @Param('attributeId') attributeId: string, @Body() dto: { defaultOptionValueId: string | null }) {
    return this.products.updateProductAttribute(productId, attributeId, dto.defaultOptionValueId);
  }

  @Delete(':id/attributes/:attributeId')
  @HttpCode(200)
  removeAttribute(@Param('id') productId: string, @Param('attributeId') attributeId: string) {
    return this.products.removeProductAttribute(productId, attributeId);
  }

  // ── Per-product images for "image" swatch option values ─────────────────

  @Get(':id/option-images')
  getOptionImages(@Param('id') id: string) {
    return this.products.getProductOptionImages(id);
  }

  @Put(':id/option-images/:optionValueId')
  setOptionImage(@Param('id') productId: string, @Param('optionValueId') optionValueId: string, @Body() dto: { mediaKey: string }) {
    return this.products.setProductOptionImage(productId, optionValueId, dto.mediaKey);
  }

  @Delete(':id/option-images/:optionValueId')
  @HttpCode(204)
  removeOptionImage(@Param('id') productId: string, @Param('optionValueId') optionValueId: string) {
    return this.products.removeProductOptionImage(productId, optionValueId);
  }

  // ── Document upload ──────────────────────────────────────────────────────

  @Post(':id/documents/upload')
  @UseInterceptors(FileInterceptor('file'))
  async uploadDocument(@Param('id') productId: string, @UploadedFile() file: Express.Multer.File) {
    if (!file || !ALLOWED_DOC_MIMES.includes(file.mimetype)) throw new Error('Only PDF files are accepted');
    if (file.size > MAX_DOC_BYTES) throw new Error('File too large (max 20 MB)');

    const ext = file.originalname.split('.').pop()?.toLowerCase() ?? 'pdf';
    const storageKey = `documents/products/${productId}/${Date.now()}.${ext}`;
    await this.gcs.upload(file.buffer, storageKey, file.mimetype, 'publicRead');
    const url = await this.urls.resolve(storageKey);

    return { storageKey, url, originalFilename: file.originalname, sizeBytes: file.size };
  }
}
