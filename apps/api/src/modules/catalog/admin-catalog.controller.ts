import { Body, Controller, Delete, Get, HttpCode, Param, ParseUUIDPipe, Patch, Post, Put, Req } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';
import { Audit, setAuditBefore } from '../audit/audit.interceptor';
import { RequirePermissions } from '../auth/interface/decorators';
import { AttributeService } from './attribute.service';
import {
  AttributeDto,
  AttributeValueDto,
  BrandDto,
  CategoryAttributesDto,
  CategoryDto,
  CollectionDto,
  CollectionProductsDto,
  SizeGuideDto,
  UpdateAttributeDto,
  UpdateAttributeValueDto,
  UpdateBrandDto,
  UpdateCategoryDto,
  UpdateCollectionDto,
  UpdateSizeGuideDto,
} from './catalog.dto';
import { CategoryService } from './category.service';
import { MerchandisingService } from './merchandising.service';

@ApiTags('admin: catalog')
@ApiBearerAuth()
@Controller('admin')
export class AdminCatalogController {
  constructor(
    private readonly categories: CategoryService,
    private readonly attributes: AttributeService,
    private readonly merch: MerchandisingService,
  ) {}

  // ───── Categories ─────
  @Get('categories')
  @RequirePermissions('catalog.category.read')
  categoryTree() {
    return this.categories.tree({ activeOnly: false });
  }

  @Get('categories/:id')
  @RequirePermissions('catalog.category.read')
  category(@Param('id', ParseUUIDPipe) id: string) {
    return this.categories.get(id);
  }

  @Get('categories/:id/effective-attributes')
  @RequirePermissions('catalog.category.read')
  effective(@Param('id', ParseUUIDPipe) id: string) {
    return this.categories.effectiveAttributes(id);
  }

  @Post('categories')
  @RequirePermissions('catalog.category.write')
  @Audit('category.create', { entityType: 'category' })
  createCategory(@Body() dto: CategoryDto) {
    return this.categories.create(dto);
  }

  @Patch('categories/:id')
  @RequirePermissions('catalog.category.write')
  @Audit('category.update', { entityType: 'category', idParam: 'id' })
  async updateCategory(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateCategoryDto, @Req() req: Request) {
    const { before, after } = await this.categories.update(id, dto);
    setAuditBefore(req, before);
    return after;
  }

  @Put('categories/:id/attributes')
  @RequirePermissions('catalog.category.write')
  @Audit('category.attributes', { entityType: 'category', idParam: 'id' })
  setCategoryAttributes(@Param('id', ParseUUIDPipe) id: string, @Body() dto: CategoryAttributesDto) {
    return this.categories.setAttributes(id, dto);
  }

  @Delete('categories/:id')
  @HttpCode(204)
  @RequirePermissions('catalog.category.write')
  @Audit('category.delete', { entityType: 'category', idParam: 'id' })
  deleteCategory(@Param('id', ParseUUIDPipe) id: string) {
    return this.categories.remove(id);
  }

  // ───── Attributes ─────
  @Get('attributes')
  @RequirePermissions('catalog.attribute.read')
  listAttributes() {
    return this.attributes.list();
  }

  @Post('attributes')
  @RequirePermissions('catalog.attribute.write')
  @Audit('attribute.create', { entityType: 'attribute' })
  createAttribute(@Body() dto: AttributeDto) {
    return this.attributes.create(dto);
  }

  @Patch('attributes/:id')
  @RequirePermissions('catalog.attribute.write')
  @Audit('attribute.update', { entityType: 'attribute', idParam: 'id' })
  updateAttribute(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateAttributeDto) {
    return this.attributes.update(id, dto);
  }

  @Delete('attributes/:id')
  @HttpCode(204)
  @RequirePermissions('catalog.attribute.write')
  @Audit('attribute.delete', { entityType: 'attribute', idParam: 'id' })
  deleteAttribute(@Param('id', ParseUUIDPipe) id: string) {
    return this.attributes.remove(id);
  }

  @Post('attributes/:id/values')
  @RequirePermissions('catalog.attribute.write')
  @Audit('attribute.value.create', { entityType: 'attributeValue' })
  addValue(@Param('id', ParseUUIDPipe) id: string, @Body() dto: AttributeValueDto) {
    return this.attributes.addValue(id, dto);
  }

  @Patch('attribute-values/:id')
  @RequirePermissions('catalog.attribute.write')
  @Audit('attribute.value.update', { entityType: 'attributeValue', idParam: 'id' })
  updateValue(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateAttributeValueDto) {
    return this.attributes.updateValue(id, dto);
  }

  @Delete('attribute-values/:id')
  @HttpCode(204)
  @RequirePermissions('catalog.attribute.write')
  @Audit('attribute.value.delete', { entityType: 'attributeValue', idParam: 'id' })
  deleteValue(@Param('id', ParseUUIDPipe) id: string) {
    return this.attributes.removeValue(id);
  }

  // ───── Brands, size guides, collections ─────
  @Get('brands')
  @RequirePermissions('catalog.product.read')
  brands() {
    return this.merch.brands();
  }

  @Post('brands')
  @RequirePermissions('catalog.product.write')
  @Audit('brand.create', { entityType: 'brand' })
  createBrand(@Body() dto: BrandDto) {
    return this.merch.createBrand(dto);
  }

  @Patch('brands/:id')
  @RequirePermissions('catalog.product.write')
  @Audit('brand.update', { entityType: 'brand', idParam: 'id' })
  updateBrand(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateBrandDto) {
    return this.merch.updateBrand(id, dto);
  }

  @Get('size-guides')
  @RequirePermissions('catalog.product.read')
  sizeGuides() {
    return this.merch.sizeGuides();
  }

  @Post('size-guides')
  @RequirePermissions('catalog.product.write')
  @Audit('sizeGuide.create', { entityType: 'sizeGuide' })
  createSizeGuide(@Body() dto: SizeGuideDto) {
    return this.merch.createSizeGuide(dto);
  }

  @Patch('size-guides/:id')
  @RequirePermissions('catalog.product.write')
  @Audit('sizeGuide.update', { entityType: 'sizeGuide', idParam: 'id' })
  updateSizeGuide(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateSizeGuideDto) {
    return this.merch.updateSizeGuide(id, dto);
  }

  @Get('collections')
  @RequirePermissions('catalog.product.read')
  collections() {
    return this.merch.collections();
  }

  @Post('collections')
  @RequirePermissions('catalog.product.write')
  @Audit('collection.create', { entityType: 'collection' })
  createCollection(@Body() dto: CollectionDto) {
    return this.merch.createCollection(dto);
  }

  @Patch('collections/:id')
  @RequirePermissions('catalog.product.write')
  @Audit('collection.update', { entityType: 'collection', idParam: 'id' })
  updateCollection(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateCollectionDto) {
    return this.merch.updateCollection(id, dto);
  }

  @Put('collections/:id/products')
  @RequirePermissions('catalog.product.write')
  @Audit('collection.products', { entityType: 'collection', idParam: 'id' })
  setCollectionProducts(@Param('id', ParseUUIDPipe) id: string, @Body() dto: CollectionProductsDto) {
    return this.merch.setCollectionProducts(id, dto);
  }
}
