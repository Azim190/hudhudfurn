import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsInt, IsOptional, IsString, IsUUID, Max, MaxLength, Min } from 'class-validator';

export class AddCartItemDto {
  @ApiProperty() @IsUUID() variantId: string;
  @ApiProperty({ minimum: 1, maximum: 20 }) @IsInt() @Min(1) @Max(20) quantity: number;
  @ApiPropertyOptional({ description: 'Order a fabric swatch sample of this variant' }) @IsOptional() @IsBoolean() isSample?: boolean;
  @ApiPropertyOptional({ description: 'PER_METER products: length in cm' }) @IsOptional() @IsInt() @Min(1) @Max(100_000) lengthCm?: number;
  @ApiPropertyOptional({ description: 'PER_SQM products: width in mm' }) @IsOptional() @IsInt() @Min(1) @Max(100_000) widthMm?: number;
  @ApiPropertyOptional({ description: 'PER_SQM products: height in mm' }) @IsOptional() @IsInt() @Min(1) @Max(100_000) heightMm?: number;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() giftWrap?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(250) giftMessage?: string;
}

export class UpdateCartItemDto {
  @ApiPropertyOptional() @IsOptional() @IsInt() @Min(1) @Max(20) quantity?: number;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() giftWrap?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(250) giftMessage?: string;
}

export class MergeCartDto {
  @ApiProperty() @IsString() @MaxLength(100) guestToken: string;
}
