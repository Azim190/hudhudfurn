import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { AttributeType, CollectionType, PhotoStyle, PricingMode, ProductStatus, RelationType, Vertical } from '@prisma/client';
import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsDateString,
  IsEnum,
  IsIn,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  Matches,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { PageQueryDto } from '../../core/http/page-query.dto';

const SLUG = /^[\p{L}\p{N}]+(?:-[\p{L}\p{N}]+)*$/u;
export const ATTRIBUTE_KEY = /^[a-z][a-z0-9_]{1,40}$/;
export const VALUE_CODE = /^[a-z0-9][a-z0-9_.-]{0,63}$/;
const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);
const MONEY_MAX = 100_000_000; // 1,000,000 SAR in halalas

class LocalizedSeoFields {
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(70) @Transform(trim) seoTitleAr?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(70) @Transform(trim) seoTitleEn?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(170) @Transform(trim) seoDescriptionAr?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(170) @Transform(trim) seoDescriptionEn?: string;
}

// ───────────── Categories ─────────────

export class CategoryDto extends LocalizedSeoFields {
  @ApiPropertyOptional() @IsOptional() @IsUUID() parentId?: string | null;
  @ApiProperty({ enum: Vertical }) @IsEnum(Vertical) vertical: Vertical;
  @ApiProperty() @IsString() @Length(2, 120) @Transform(trim) nameAr: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @Length(2, 120) @Transform(trim) nameEn?: string;
  @ApiPropertyOptional() @IsOptional() @Matches(SLUG) @MaxLength(120) slugAr?: string;
  @ApiPropertyOptional() @IsOptional() @Matches(/^[a-z0-9]+(?:-[a-z0-9]+)*$/) @MaxLength(120) slugEn?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(5000) descriptionAr?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(5000) descriptionEn?: string;
  @ApiPropertyOptional() @IsOptional() @IsUUID() imageId?: string | null;
  @ApiPropertyOptional() @IsOptional() @IsUUID() sizeGuideId?: string | null;
  @ApiPropertyOptional() @IsOptional() @IsInt() @Min(0) @Max(10_000) sortOrder?: number;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() isActive?: boolean;
}

export class UpdateCategoryDto extends PartialType(CategoryDto) {}

export class CategoryAttributeItemDto {
  @ApiProperty() @IsUUID() attributeId: string;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() isFacet?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() isVariantAxis?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() isRequired?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsInt() @Min(0) sortOrder?: number;
}

export class CategoryAttributesDto {
  @ApiProperty({ type: [CategoryAttributeItemDto] })
  @IsArray()
  @ArrayMaxSize(60)
  @ValidateNested({ each: true })
  @Type(() => CategoryAttributeItemDto)
  items: CategoryAttributeItemDto[];
}

// ───────────── Attributes ─────────────

export class AttributeDto {
  @ApiProperty({ example: 'heading_style' }) @Matches(ATTRIBUTE_KEY) key: string;
  @ApiProperty() @IsString() @Length(1, 80) @Transform(trim) nameAr: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @Length(1, 80) @Transform(trim) nameEn?: string;
  @ApiPropertyOptional({ enum: AttributeType }) @IsOptional() @IsEnum(AttributeType) type?: AttributeType;
  @ApiPropertyOptional({ example: 'cm' }) @IsOptional() @IsString() @MaxLength(16) unit?: string;
  @ApiPropertyOptional() @IsOptional() @IsInt() @Min(0) sortOrder?: number;
}

export class UpdateAttributeDto extends PartialType(AttributeDto) {}

export class AttributeValueDto {
  @ApiProperty({ example: 'wave' }) @Matches(VALUE_CODE) code: string;
  @ApiProperty() @IsString() @Length(1, 80) @Transform(trim) labelAr: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @Length(1, 80) @Transform(trim) labelEn?: string;
  @ApiPropertyOptional({ example: '#1F2937' }) @IsOptional() @Matches(/^#[0-9a-fA-F]{6}$/) swatchHex?: string;
  @ApiPropertyOptional() @IsOptional() @IsNumber() numericValue?: number;
  @ApiPropertyOptional() @IsOptional() @IsInt() @Min(0) sortOrder?: number;
}

export class UpdateAttributeValueDto extends PartialType(AttributeValueDto) {}

// ───────────── Brands, size guides, collections ─────────────

export class BrandDto {
  @ApiProperty() @IsString() @Length(1, 80) @Transform(trim) nameAr: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @Length(1, 80) @Transform(trim) nameEn?: string;
  @ApiPropertyOptional() @IsOptional() @Matches(/^[a-z0-9]+(?:-[a-z0-9]+)*$/) slug?: string;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() isActive?: boolean;
}

export class UpdateBrandDto extends PartialType(BrandDto) {}

export class SizeGuideColumnDto {
  @ApiProperty() @IsString() @Length(1, 60) ar: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @Length(1, 60) en?: string;
}

export class SizeGuideDto {
  @ApiProperty() @Matches(ATTRIBUTE_KEY) key: string;
  @ApiProperty() @IsString() @Length(2, 120) titleAr: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @Length(2, 120) titleEn?: string;
  @ApiProperty({ type: [SizeGuideColumnDto] })
  @IsArray()
  @ArrayMaxSize(20)
  @ValidateNested({ each: true })
  @Type(() => SizeGuideColumnDto)
  columns: SizeGuideColumnDto[];
  @ApiProperty({ type: 'array', items: { type: 'array', items: { type: 'string' } } })
  @IsArray()
  @ArrayMaxSize(100)
  rows: Array<Array<string | number>>;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(5000) howToMeasureAr?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(5000) howToMeasureEn?: string;
}

export class UpdateSizeGuideDto extends PartialType(SizeGuideDto) {}

export class CollectionDto {
  @ApiPropertyOptional({ enum: CollectionType }) @IsOptional() @IsEnum(CollectionType) type?: CollectionType;
  @ApiProperty() @IsString() @Length(2, 120) @Transform(trim) nameAr: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @Length(2, 120) @Transform(trim) nameEn?: string;
  @ApiPropertyOptional() @IsOptional() @Matches(SLUG) slugAr?: string;
  @ApiPropertyOptional() @IsOptional() @Matches(/^[a-z0-9]+(?:-[a-z0-9]+)*$/) slugEn?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(5000) descriptionAr?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(5000) descriptionEn?: string;
  @ApiPropertyOptional() @IsOptional() @IsUUID() imageId?: string | null;
  @ApiPropertyOptional() @IsOptional() @IsDateString() startsAt?: string | null;
  @ApiPropertyOptional() @IsOptional() @IsDateString() endsAt?: string | null;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() isActive?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsInt() @Min(0) sortOrder?: number;
}

export class UpdateCollectionDto extends PartialType(CollectionDto) {}

export class CollectionProductsDto {
  @ApiProperty({ type: [String] }) @IsArray() @ArrayMaxSize(500) @IsUUID('all', { each: true }) productIds: string[];
}

// ───────────── Products ─────────────

export class ProductDto extends LocalizedSeoFields {
  @ApiProperty() @IsUUID() categoryId: string;
  @ApiPropertyOptional() @IsOptional() @IsUUID() brandId?: string | null;
  @ApiPropertyOptional({ example: 'CUR-0001' }) @IsOptional() @Matches(/^[A-Z0-9][A-Z0-9-]{1,23}$/) skuPrefix?: string;
  @ApiProperty() @IsString() @Length(2, 160) @Transform(trim) nameAr: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @Length(2, 160) @Transform(trim) nameEn?: string;
  @ApiPropertyOptional() @IsOptional() @Matches(SLUG) @MaxLength(120) slugAr?: string;
  @ApiPropertyOptional() @IsOptional() @Matches(/^[a-z0-9]+(?:-[a-z0-9]+)*$/) @MaxLength(120) slugEn?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(10_000) descriptionAr?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(10_000) descriptionEn?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(3000) careAr?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(3000) careEn?: string;
  @ApiPropertyOptional({ enum: PricingMode }) @IsOptional() @IsEnum(PricingMode) pricingMode?: PricingMode;
  @ApiProperty({ description: 'Halalas' }) @IsInt() @Min(0) @Max(MONEY_MAX) basePrice: number;
  @ApiPropertyOptional() @IsOptional() @IsInt() @Min(0) @Max(MONEY_MAX) compareAtPrice?: number | null;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() vatInclusive?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() isMadeToMeasure?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() sampleAvailable?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsInt() @Min(0) @Max(MONEY_MAX) samplePrice?: number | null;
  @ApiPropertyOptional({ enum: PhotoStyle }) @IsOptional() @IsEnum(PhotoStyle) photoStyle?: PhotoStyle | null;
  @ApiPropertyOptional() @IsOptional() @IsUUID() sizeGuideId?: string | null;
  @ApiPropertyOptional({ description: 'Made-to-measure configurator template' }) @IsOptional() @IsUUID() configuratorTemplateId?: string | null;
  @ApiPropertyOptional({ type: [String], description: 'Product-level (non-variant) attribute value ids' })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(100)
  @IsUUID('all', { each: true })
  attributeValueIds?: string[];
}

export class UpdateProductDto extends PartialType(ProductDto) {}

export class VariantAxisDto {
  @ApiProperty({ example: 'color' }) @Matches(ATTRIBUTE_KEY) attributeKey: string;
  @ApiProperty({ type: [String] }) @IsArray() @ArrayMaxSize(100) @Matches(VALUE_CODE, { each: true }) valueCodes: string[];
}

export class GenerateVariantsDto {
  @ApiProperty({ type: [VariantAxisDto] })
  @IsArray()
  @ArrayMaxSize(4)
  @ValidateNested({ each: true })
  @Type(() => VariantAxisDto)
  axes: VariantAxisDto[];
  @ApiPropertyOptional({ description: 'Price (halalas) for newly created variants; defaults to the product base price' })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(MONEY_MAX)
  price?: number;
}

export class UpdateVariantDto {
  @ApiPropertyOptional() @IsOptional() @Matches(/^[A-Z0-9][A-Z0-9-]{1,63}$/) sku?: string;
  @ApiPropertyOptional() @IsOptional() @Matches(/^[0-9A-Za-z-]{4,32}$/) barcode?: string | null;
  @ApiPropertyOptional() @IsOptional() @IsInt() @Min(0) @Max(MONEY_MAX) price?: number | null;
  @ApiPropertyOptional() @IsOptional() @IsInt() @Min(0) @Max(MONEY_MAX) compareAtPrice?: number | null;
  @ApiPropertyOptional() @IsOptional() @IsInt() @Min(0) @Max(200_000) weightGrams?: number | null;
  @ApiPropertyOptional() @IsOptional() @IsInt() @Min(100) @Max(6000) fabricWidthMm?: number | null;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() isActive?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() isDefault?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsInt() @Min(0) sortOrder?: number;
}

export class ProductMediaItemDto {
  @ApiProperty() @IsUUID() mediaId: string;
  @ApiPropertyOptional() @IsOptional() @IsUUID() variantId?: string | null;
}

export class ProductMediaDto {
  @ApiProperty({ type: [ProductMediaItemDto] })
  @IsArray()
  @ArrayMaxSize(40)
  @ValidateNested({ each: true })
  @Type(() => ProductMediaItemDto)
  items: ProductMediaItemDto[];
}

export class ProductRelationItemDto {
  @ApiProperty() @IsUUID() relatedId: string;
  @ApiProperty({ enum: RelationType }) @IsEnum(RelationType) type: RelationType;
}

export class ProductRelationsDto {
  @ApiProperty({ type: [ProductRelationItemDto] })
  @IsArray()
  @ArrayMaxSize(40)
  @ValidateNested({ each: true })
  @Type(() => ProductRelationItemDto)
  items: ProductRelationItemDto[];
}

export class AdminProductQueryDto extends PageQueryDto {
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(100) q?: string;
  @ApiPropertyOptional({ enum: ProductStatus }) @IsOptional() @IsEnum(ProductStatus) status?: ProductStatus;
  @ApiPropertyOptional() @IsOptional() @IsUUID() categoryId?: string;
}

// ───────────── Inventory ─────────────

export class LocationDto {
  @ApiProperty() @Matches(/^[A-Z0-9-]{2,20}$/) code: string;
  @ApiProperty({ enum: ['WAREHOUSE', 'BRANCH', 'WORKSHOP'] }) @IsIn(['WAREHOUSE', 'BRANCH', 'WORKSHOP']) type: 'WAREHOUSE' | 'BRANCH' | 'WORKSHOP';
  @ApiProperty() @IsString() @Length(2, 120) nameAr: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @Length(2, 120) nameEn?: string;
  @ApiPropertyOptional() @IsOptional() @IsUUID() cityId?: string;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() isPickupPoint?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() isActive?: boolean;
}

export class UpdateLocationDto extends PartialType(LocationDto) {}

export class SetStockDto {
  @ApiProperty() @IsUUID() locationId: string;
  @ApiProperty({ description: 'New on-hand quantity (units, or cm for fabric)' }) @IsInt() @Min(0) @Max(10_000_000) onHand: number;
  @ApiPropertyOptional() @IsOptional() @IsInt() @Min(0) @Max(100_000) lowStockThreshold?: number;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(300) note?: string;
}

// ───────────── Public listing ─────────────

export const SORT_KEYS = ['relevance', 'newest', 'price_asc', 'price_desc', 'rating', 'discount'] as const;

export class PublicProductQueryDto extends PageQueryDto {
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(200) q?: string;
  @ApiPropertyOptional({ description: 'Category slug (Arabic or English)' }) @IsOptional() @IsString() @MaxLength(120) category?: string;
  @ApiPropertyOptional({ description: 'Collection slug' }) @IsOptional() @IsString() @MaxLength(120) collection?: string;
  @ApiPropertyOptional({ enum: SORT_KEYS }) @IsOptional() @IsIn(SORT_KEYS) sort?: (typeof SORT_KEYS)[number];
  @ApiPropertyOptional() @IsOptional() @Type(() => Number) @IsInt() @Min(0) priceMin?: number;
  @ApiPropertyOptional() @IsOptional() @Type(() => Number) @IsInt() @Min(0) priceMax?: number;
  @ApiPropertyOptional() @IsOptional() @Transform(({ value }) => value === 'true' || value === true) @IsBoolean() inStock?: boolean;
}
