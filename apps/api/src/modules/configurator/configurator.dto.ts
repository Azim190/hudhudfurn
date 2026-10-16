import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { CONFIGURATOR_KINDS, PRICE_BASES, type ConfiguratorKind, type PriceBasis } from '@hudhud/domain';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsNumber,
  IsObject,
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

const CODE = /^[A-Z0-9_]{2,32}$/;
const MM = { min: 0, max: 20_000 };

export class PieceInputDto {
  @ApiProperty() @Matches(CODE) code: string;
  @ApiProperty() @IsInt() @Min(1) @Max(50) quantity: number;
  @ApiPropertyOptional() @IsOptional() @IsInt() @Min(MM.min) @Max(MM.max) widthMm?: number;
  @ApiPropertyOptional() @IsOptional() @IsInt() @Min(MM.min) @Max(MM.max) depthMm?: number;
  @ApiPropertyOptional() @IsOptional() @IsInt() @Min(MM.min) @Max(MM.max) heightMm?: number;
}

/** Customer inputs. Shape is checked here; business ranges are checked by the template. */
export class ConfigurationInputsDto {
  @ApiPropertyOptional() @IsOptional() @IsInt() @Min(MM.min) @Max(MM.max) widthMm?: number;
  @ApiPropertyOptional() @IsOptional() @IsInt() @Min(MM.min) @Max(MM.max) heightMm?: number;
  @ApiPropertyOptional() @IsOptional() @IsInt() @Min(1) @Max(20) panels?: number;
  @ApiPropertyOptional() @IsOptional() @Matches(CODE) headingStyle?: string;
  @ApiPropertyOptional() @IsOptional() @IsNumber({ maxDecimalPlaces: 2 }) @Min(0) @Max(5) fullness?: number;
  @ApiPropertyOptional({ description: 'Option group → option code' }) @IsOptional() @IsObject() choices?: Record<string, string>;
  @ApiPropertyOptional() @IsOptional() @IsArray() @ArrayMaxSize(20) @Matches(CODE, { each: true }) extras?: string[];
  @ApiPropertyOptional({ description: 'Abaya measurements in mm: length, chest, shoulder, sleeve' }) @IsOptional() @IsObject() measurements?: Record<string, number>;
  @ApiPropertyOptional({ type: [PieceInputDto] }) @IsOptional() @IsArray() @ArrayMaxSize(30) @ValidateNested({ each: true }) @Type(() => PieceInputDto) pieces?: PieceInputDto[];
  @ApiPropertyOptional() @IsOptional() @IsArray() @ArrayMaxSize(10) @IsUUID('4', { each: true }) photoIds?: string[];
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(1000) notes?: string;
}

export class QuoteDto {
  @ApiProperty() @IsUUID() productId: string;
  @ApiProperty() @IsUUID() variantId: string;
  @ApiProperty({ type: ConfigurationInputsDto }) @ValidateNested() @Type(() => ConfigurationInputsDto) inputs: ConfigurationInputsDto;
}

export class MeasurementProfileDto {
  @ApiProperty() @IsString() @Length(1, 60) label: string;
  @ApiProperty({ description: 'mm: length, chest, shoulder, sleeve' }) @IsObject() measurements: Record<string, number>;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(500) notes?: string;
}

export class UpdateMeasurementProfileDto extends PartialType(MeasurementProfileDto) {}

// ───── Admin ─────

export class TemplateDto {
  @ApiProperty({ example: 'CUSTOM_CURTAINS' }) @Matches(/^[A-Z0-9_]{3,40}$/) code: string;
  @ApiProperty({ enum: CONFIGURATOR_KINDS }) @IsIn(CONFIGURATOR_KINDS) kind: ConfiguratorKind;
  @ApiProperty() @IsString() @Length(2, 120) nameAr: string;
  @ApiProperty() @IsString() @Length(2, 120) nameEn: string;
  @ApiPropertyOptional({ description: 'Named numbers used by formulas (mm)' }) @IsOptional() @IsObject() constants?: Record<string, number>;
  @ApiPropertyOptional({ description: 'Formula overrides by result name' }) @IsOptional() @IsObject() formulas?: Record<string, string>;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() isActive?: boolean;
}

export class UpdateTemplateDto extends PartialType(TemplateDto) {}

export class HeadingStyleDto {
  @ApiProperty({ example: 'WAVE' }) @Matches(CODE) code: string;
  @ApiProperty() @IsString() @Length(2, 60) nameAr: string;
  @ApiProperty() @IsString() @Length(2, 60) nameEn: string;
  @ApiProperty({ description: 'Hundredths: 200 = 2.0×' }) @IsInt() @Min(50) @Max(500) fullnessMin: number;
  @ApiProperty() @IsInt() @Min(50) @Max(500) fullnessMax: number;
  @ApiProperty() @IsInt() @Min(50) @Max(500) fullnessDefault: number;
  @ApiProperty({ description: 'Halalas per metre of rail' }) @IsInt() @Min(0) @Max(10_000_000) makingCostPerM: number;
  @ApiPropertyOptional() @IsOptional() @IsInt() @Min(0) @Max(1000) sortOrder?: number;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() isActive?: boolean;
}

export class UpdateHeadingStyleDto extends PartialType(HeadingStyleDto) {}

export class OptionDto {
  @ApiProperty({ example: 'LINING' }) @Matches(CODE) group: string;
  @ApiProperty({ example: 'BLACKOUT' }) @Matches(CODE) code: string;
  @ApiProperty() @IsString() @Length(2, 80) nameAr: string;
  @ApiProperty() @IsString() @Length(2, 80) nameEn: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(300) descriptionAr?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(300) descriptionEn?: string;
  @ApiProperty({ enum: PRICE_BASES }) @IsIn(PRICE_BASES) priceBasis: PriceBasis;
  @ApiProperty({ description: 'Halalas per unit of the basis' }) @IsInt() @Min(0) @Max(100_000_000) price: number;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() isDefault?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsInt() @Min(0) @Max(1000) sortOrder?: number;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() isActive?: boolean;
}

export class UpdateOptionDto extends PartialType(OptionDto) {}

export class SimulateDto {
  @ApiProperty({ type: ConfigurationInputsDto }) @ValidateNested() @Type(() => ConfigurationInputsDto) inputs: ConfigurationInputsDto;
  @ApiProperty({ description: 'Fabric/garment price in halalas' }) @IsInt() @Min(0) @Max(100_000_000) basePrice: number;
  @ApiPropertyOptional() @IsOptional() @IsInt() @Min(100) @Max(5000) fabricWidthMm?: number;
}
