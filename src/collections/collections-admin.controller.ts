import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post, Put, Query } from '@nestjs/common';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe';
import { CollectionsService } from './collections.service';
import { AddCollectionProductDto, AddCollectionProductSchema, CreateCollectionDto, CreateCollectionSchema, ReorderCollectionProductsDto, ReorderCollectionProductsSchema, UpdateCollectionDto, UpdateCollectionSchema } from './dto/collection.dto';

@Controller('admin/shop/collections')
export class CollectionsAdminController {
  constructor(private readonly collections: CollectionsService) {}

  @Get()
  list(@Query('isActive') isActive?: string, @Query('isFeatured') isFeatured?: string, @Query('limit') limit?: string, @Query('offset') offset?: string) {
    return this.collections.adminList({
      isActive: isActive !== undefined ? isActive === 'true' : undefined,
      isFeatured: isFeatured !== undefined ? isFeatured === 'true' : undefined,
      limit: limit ? parseInt(limit, 10) : undefined,
      offset: offset ? parseInt(offset, 10) : undefined,
    });
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.collections.findById(id);
  }

  @Post()
  @HttpCode(201)
  create(@Body(new ZodValidationPipe(CreateCollectionSchema)) dto: CreateCollectionDto) {
    return this.collections.create(dto);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body(new ZodValidationPipe(UpdateCollectionSchema)) dto: UpdateCollectionDto) {
    return this.collections.update(id, dto);
  }

  @Delete(':id')
  @HttpCode(204)
  remove(@Param('id') id: string) {
    return this.collections.remove(id);
  }

  @Post(':id/products')
  @HttpCode(201)
  addProduct(@Param('id') id: string, @Body(new ZodValidationPipe(AddCollectionProductSchema)) dto: AddCollectionProductDto) {
    return this.collections.addProduct(id, dto.productId);
  }

  @Delete(':id/products/:productId')
  @HttpCode(204)
  removeProduct(@Param('id') id: string, @Param('productId') productId: string) {
    return this.collections.removeProduct(id, productId);
  }

  @Put(':id/products/reorder')
  @HttpCode(204)
  reorderProducts(@Param('id') id: string, @Body(new ZodValidationPipe(ReorderCollectionProductsSchema)) dto: ReorderCollectionProductsDto) {
    return this.collections.reorderProducts(id, dto.productIds);
  }
}
