import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { ArrayMaxSize, IsArray, IsBoolean, IsInt, IsOptional, IsString, Length, Matches, Max, Min } from 'class-validator';

export class ShippingZoneDto {
  @ApiProperty({ example: 'RIYADH' }) @Matches(/^[A-Za-z0-9_-]{2,32}$/) code: string;
  @ApiProperty() @IsString() @Length(2, 80) nameAr: string;
  @ApiProperty() @IsString() @Length(2, 80) nameEn: string;
  @ApiProperty({ description: 'City codes; "*" covers every city not listed in another zone', example: ['RUH'] })
  @IsArray()
  @ArrayMaxSize(500)
  @Matches(/^([A-Z]{3}|\*)$/, { each: true })
  cityCodes: string[];
  @ApiPropertyOptional() @IsOptional() @IsBoolean() isActive?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsInt() @Min(0) @Max(1000) sortOrder?: number;
}

export class UpdateShippingZoneDto extends PartialType(ShippingZoneDto) {}

export class ShippingRateDto {
  @ApiProperty({ example: 'OWN_FLEET', description: 'OWN_FLEET, SMSA, ARAMEX, SPL' }) @Matches(/^[A-Za-z_]{2,20}$/) carrier: string;
  @ApiProperty({ example: 'STANDARD', description: 'STANDARD, EXPRESS, SAME_DAY' }) @Matches(/^[A-Za-z_]{2,20}$/) method: string;
  @ApiProperty() @IsString() @Length(2, 80) nameAr: string;
  @ApiProperty() @IsString() @Length(2, 80) nameEn: string;
  @ApiPropertyOptional({ default: 0 }) @IsOptional() @IsInt() @Min(0) @Max(1_000_000) minWeightG?: number;
  @ApiPropertyOptional() @IsOptional() @IsInt() @Min(0) @Max(1_000_000) maxWeightG?: number | null;
  @ApiProperty({ description: 'Halalas' }) @IsInt() @Min(0) @Max(10_000_000) price: number;
  @ApiPropertyOptional({ description: 'Free from this goods total (halalas)' }) @IsOptional() @IsInt() @Min(0) @Max(100_000_000) freeAbove?: number | null;
  @ApiProperty() @IsInt() @Min(0) @Max(60) etaMinDays: number;
  @ApiProperty() @IsInt() @Min(0) @Max(90) etaMaxDays: number;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() isActive?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsInt() @Min(0) @Max(1000) sortOrder?: number;
}

export class UpdateShippingRateDto extends PartialType(ShippingRateDto) {}
