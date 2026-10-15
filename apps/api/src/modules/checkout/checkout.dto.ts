import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { FulfillmentType, PaymentMethod } from '@prisma/client';
import { Type } from 'class-transformer';
import { IsEmail, IsEnum, IsIn, IsInt, IsOptional, IsString, IsUUID, Length, Matches, Max, MaxLength, Min, ValidateNested } from 'class-validator';

export class CheckoutAddressDto {
  @ApiProperty() @IsString() @Length(2, 120) recipientName: string;
  @ApiProperty({ example: '0512345678' }) @IsString() @MaxLength(32) phone: string;
  @ApiProperty({ example: 'RUH' }) @Matches(/^[A-Z]{3}$/) cityCode: string;
  @ApiPropertyOptional() @IsOptional() @IsUUID() districtId?: string;
  @ApiPropertyOptional({ description: 'Free-text district when not in the list' }) @IsOptional() @IsString() @MaxLength(80) district?: string;
  @ApiProperty() @IsString() @Length(3, 200) street: string;
  @ApiPropertyOptional() @IsOptional() @Matches(/^\d{4}$/) buildingNo?: string;
  @ApiPropertyOptional() @IsOptional() @Matches(/^\d{4}$/) additionalNo?: string;
  @ApiPropertyOptional() @IsOptional() @Matches(/^\d{5}$/) postalCode?: string;
  @ApiPropertyOptional({ example: 'RRRD2929' }) @IsOptional() @Matches(/^[A-Za-z]{4}\d{4}$/) shortAddress?: string;
}

export class CheckoutBaseDto {
  @ApiProperty({ enum: FulfillmentType }) @IsEnum(FulfillmentType) fulfillment: FulfillmentType;
  @ApiPropertyOptional({ description: 'Saved address (signed-in customers)' }) @IsOptional() @IsUUID() addressId?: string;
  @ApiPropertyOptional({ type: CheckoutAddressDto }) @IsOptional() @ValidateNested() @Type(() => CheckoutAddressDto) address?: CheckoutAddressDto;
  @ApiPropertyOptional({ description: 'City only, while the address is still being entered (quote shows delivery options)' })
  @IsOptional()
  @Matches(/^[A-Z]{3}$/)
  cityCode?: string;
  @ApiPropertyOptional() @IsOptional() @IsUUID() pickupLocationId?: string;
  @ApiPropertyOptional() @IsOptional() @IsUUID() shippingRateId?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(32) couponCode?: string;
}

export class CheckoutQuoteDto extends CheckoutBaseDto {
  @ApiPropertyOptional({ enum: PaymentMethod }) @IsOptional() @IsEnum(PaymentMethod) paymentMethod?: PaymentMethod;
}

export class CheckoutContactDto {
  @ApiProperty() @IsString() @Length(2, 120) name: string;
  @ApiProperty({ example: '0512345678' }) @IsString() @MaxLength(32) phone: string;
  @ApiPropertyOptional() @IsOptional() @IsEmail() @MaxLength(254) email?: string;
}

export class PlaceOrderDto extends CheckoutBaseDto {
  @ApiProperty({ enum: PaymentMethod }) @IsEnum(PaymentMethod) paymentMethod: PaymentMethod;
  @ApiPropertyOptional({ type: CheckoutContactDto, description: 'Required for guests; defaults to the profile for customers' })
  @IsOptional()
  @ValidateNested()
  @Type(() => CheckoutContactDto)
  contact?: CheckoutContactDto;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(500) customerNote?: string;
  @ApiPropertyOptional({ enum: ['ar', 'en'] }) @IsOptional() @IsIn(['ar', 'en']) locale?: 'ar' | 'en';
  @ApiPropertyOptional({ description: 'Total the customer saw; the order is refused if it changed' })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(1_000_000_000)
  expectedTotal?: number;
}
