import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { ConsentPurpose, DataRequestType } from '@prisma/client';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsEmail,
  IsEnum,
  IsIn,
  IsLatitude,
  IsLongitude,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  Matches,
  MaxLength,
  ValidateNested,
} from 'class-validator';

export class UpdateMeDto {
  @ApiPropertyOptional() @IsOptional() @IsString() @Length(2, 120) fullName?: string;
  @ApiPropertyOptional() @IsOptional() @IsEmail() @MaxLength(254) email?: string;
  @ApiPropertyOptional({ enum: ['ar', 'en'] }) @IsOptional() @IsIn(['ar', 'en']) locale?: 'ar' | 'en';
  @ApiPropertyOptional({ enum: ['western', 'arabic_indic'] })
  @IsOptional()
  @IsIn(['western', 'arabic_indic'])
  digits?: 'western' | 'arabic_indic';
  @ApiPropertyOptional({ enum: ['gregory', 'islamic_umalqura'] })
  @IsOptional()
  @IsIn(['gregory', 'islamic_umalqura'])
  calendar?: 'gregory' | 'islamic_umalqura';
}

export class AddressDto {
  @ApiPropertyOptional({ example: 'المنزل' }) @IsOptional() @IsString() @MaxLength(40) label?: string;
  @ApiProperty() @IsString() @Length(2, 120) recipientName: string;
  @ApiProperty({ example: '0512345678' }) @IsString() @MaxLength(32) phone: string;
  @ApiProperty() @IsUUID() cityId: string;
  @ApiPropertyOptional() @IsOptional() @IsUUID() districtId?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(200) street?: string;
  @ApiPropertyOptional() @IsOptional() @Matches(/^\d{4}$/) buildingNo?: string;
  @ApiPropertyOptional() @IsOptional() @Matches(/^\d{4}$/) additionalNo?: string;
  @ApiPropertyOptional() @IsOptional() @Matches(/^\d{5}$/) postalCode?: string;
  @ApiPropertyOptional({ example: 'RRRD2929', description: 'Saudi National Address short code' })
  @IsOptional()
  @Matches(/^[A-Za-z]{4}\d{4}$/)
  shortAddress?: string;
  @ApiPropertyOptional() @IsOptional() @IsLatitude() lat?: number;
  @ApiPropertyOptional() @IsOptional() @IsLongitude() lng?: number;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() isDefault?: boolean;
}

export class UpdateAddressDto extends PartialType(AddressDto) {}

export class ConsentItemDto {
  @ApiProperty({ enum: ConsentPurpose }) @IsEnum(ConsentPurpose) purpose: ConsentPurpose;
  @ApiProperty() @IsBoolean() granted: boolean;
}

export class UpdateConsentsDto {
  @ApiProperty({ type: [ConsentItemDto] })
  @IsArray()
  @ArrayMaxSize(20)
  @ValidateNested({ each: true })
  @Type(() => ConsentItemDto)
  items: ConsentItemDto[];
}

export class DataRequestDto {
  @ApiProperty({ enum: DataRequestType }) @IsEnum(DataRequestType) type: DataRequestType;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(1000) note?: string;
}
