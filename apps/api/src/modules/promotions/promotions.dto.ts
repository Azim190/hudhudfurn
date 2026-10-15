import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { PROMOTION_TYPES, type PromotionType } from '@hudhud/domain';
import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsISO8601,
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
import { Vertical } from '@prisma/client';
import { PageQueryDto } from '../../core/http/page-query.dto';

const VERTICALS = Object.values(Vertical);
const CODE = /^[A-Za-z0-9_-]{3,32}$/;

export class PromotionConditionsDto {
  @ApiPropertyOptional({ description: 'Halalas of eligible goods' }) @IsOptional() @IsInt() @Min(0) @Max(100_000_000) minSubtotal?: number;
  @ApiPropertyOptional() @IsOptional() @IsArray() @ArrayMaxSize(200) @IsUUID('4', { each: true }) productIds?: string[];
  @ApiPropertyOptional() @IsOptional() @IsArray() @ArrayMaxSize(200) @IsUUID('4', { each: true }) categoryIds?: string[];
  @ApiPropertyOptional({ enum: VERTICALS, isArray: true }) @IsOptional() @IsArray() @IsIn(VERTICALS, { each: true }) verticals?: string[];
  @ApiPropertyOptional() @IsOptional() @IsBoolean() firstOrderOnly?: boolean;
}

export class PromotionBenefitDto {
  @ApiPropertyOptional() @IsOptional() @IsInt() @Min(1) @Max(100) percent?: number;
  @ApiPropertyOptional() @IsOptional() @IsInt() @Min(1) @Max(100_000_000) maxDiscount?: number;
  @ApiPropertyOptional() @IsOptional() @IsInt() @Min(1) @Max(100_000_000) amount?: number;
  @ApiPropertyOptional() @IsOptional() @IsInt() @Min(1) @Max(50) buyQuantity?: number;
  @ApiPropertyOptional() @IsOptional() @IsInt() @Min(1) @Max(50) getQuantity?: number;
  @ApiPropertyOptional() @IsOptional() @IsInt() @Min(1) @Max(100) getPercent?: number;
  @ApiPropertyOptional() @IsOptional() @IsInt() @Min(2) @Max(50) bundleQuantity?: number;
  @ApiPropertyOptional() @IsOptional() @IsInt() @Min(0) @Max(100_000_000) bundlePrice?: number;
}

export class PromotionDto {
  @ApiProperty() @IsString() @Length(2, 120) nameAr: string;
  @ApiProperty() @IsString() @Length(2, 120) nameEn: string;
  @ApiProperty({ enum: PROMOTION_TYPES }) @IsIn(PROMOTION_TYPES) type: PromotionType;
  @ApiPropertyOptional({ description: 'Applies without a code' }) @IsOptional() @IsBoolean() automatic?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsInt() @Min(-100) @Max(100) priority?: number;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() stackable?: boolean;
  @ApiProperty({ type: PromotionConditionsDto }) @ValidateNested() @Type(() => PromotionConditionsDto) conditions: PromotionConditionsDto;
  @ApiProperty({ type: PromotionBenefitDto }) @ValidateNested() @Type(() => PromotionBenefitDto) benefit: PromotionBenefitDto;
  @ApiPropertyOptional() @IsOptional() @IsISO8601() startsAt?: string;
  @ApiPropertyOptional() @IsOptional() @IsISO8601() endsAt?: string;
  @ApiPropertyOptional() @IsOptional() @IsInt() @Min(1) @Max(10_000_000) usageLimit?: number;
  @ApiPropertyOptional() @IsOptional() @IsInt() @Min(1) @Max(1000) perCustomerLimit?: number;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() isActive?: boolean;
  @ApiPropertyOptional({ description: 'Coupon codes to create with the promotion' })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(50)
  @Matches(CODE, { each: true })
  couponCodes?: string[];
}

export class UpdatePromotionDto extends PartialType(PromotionDto) {}

export class CouponDto {
  @ApiProperty({ example: 'WELCOME10' }) @Matches(CODE) code: string;
  @ApiPropertyOptional() @IsOptional() @IsInt() @Min(1) @Max(10_000_000) usageLimit?: number;
}

export class CouponStateDto {
  @ApiProperty() @IsBoolean() isActive: boolean;
}

export class PromotionListQueryDto extends PageQueryDto {
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(80) q?: string;
  @ApiPropertyOptional()
  @IsOptional()
  @Transform(({ value }) => (value === 'true' ? true : value === 'false' ? false : value))
  @IsBoolean()
  active?: boolean;
}
