import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { BannerPlacement } from '@prisma/client';
import { IsBoolean, IsDateString, IsEnum, IsInt, IsOptional, IsString, IsUUID, Length, Matches, MaxLength, Min } from 'class-validator';

export class BannerDto {
  @ApiPropertyOptional({ enum: BannerPlacement }) @IsOptional() @IsEnum(BannerPlacement) placement?: BannerPlacement;
  @ApiProperty() @IsString() @Length(2, 120) titleAr: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @Length(2, 120) titleEn?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(240) subtitleAr?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(240) subtitleEn?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(40) ctaAr?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(40) ctaEn?: string;
  /** Internal, locale-less storefront path only (no external or javascript: URLs). */
  @ApiPropertyOptional({ example: '/c/abayas' }) @IsOptional() @Matches(/^\/(?!\/)[\w\-/%?=&.؀-ۿ]*$/) @MaxLength(300) link?: string | null;
  @ApiPropertyOptional() @IsOptional() @IsUUID() imageArId?: string | null;
  @ApiPropertyOptional() @IsOptional() @IsUUID() imageEnId?: string | null;
  @ApiPropertyOptional() @IsOptional() @IsUUID() categoryId?: string | null;
  @ApiPropertyOptional() @IsOptional() @IsDateString() startsAt?: string | null;
  @ApiPropertyOptional() @IsOptional() @IsDateString() endsAt?: string | null;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() isActive?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsInt() @Min(0) sortOrder?: number;
}

export class UpdateBannerDto extends PartialType(BannerDto) {}
