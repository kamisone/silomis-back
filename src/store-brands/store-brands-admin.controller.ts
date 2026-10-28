import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
} from '@nestjs/common';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe';
import { StoreBrandsService } from './store-brands.service';
import {
  CreateStoreBrandDto,
  CreateStoreBrandSchema,
  LinkStoreBrandProductDto,
  LinkStoreBrandProductSchema,
  UpdateStoreBrandDto,
  UpdateStoreBrandSchema,
} from './dto/store-brand.dto';

@Controller('admin/shop/store-brands')
export class StoreBrandsAdminController {
  constructor(private readonly brands: StoreBrandsService) {}

  @Get()
  list() {
    return this.brands.adminList();
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.brands.findById(id);
  }

  @Post()
  @HttpCode(201)
  create(
    @Body(new ZodValidationPipe(CreateStoreBrandSchema))
    dto: CreateStoreBrandDto,
  ) {
    return this.brands.create(dto);
  }

  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(UpdateStoreBrandSchema))
    dto: UpdateStoreBrandDto,
  ) {
    return this.brands.update(id, dto);
  }

  @Delete(':id')
  @HttpCode(204)
  remove(@Param('id') id: string) {
    return this.brands.remove(id);
  }

  @Post(':id/products')
  linkProduct(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(LinkStoreBrandProductSchema))
    dto: LinkStoreBrandProductDto,
  ) {
    return this.brands.linkProduct(id, dto.productId);
  }

  @Delete(':id/products/:productId')
  unlinkProduct(
    @Param('id') id: string,
    @Param('productId') productId: string,
  ) {
    return this.brands.unlinkProduct(id, productId);
  }
}
