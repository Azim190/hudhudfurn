import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { BOOKING_STATUSES, BOOKING_TYPES, type BookingStatus, type BookingType } from '@hudhud/domain';
import { PaymentMethod } from '@prisma/client';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsEnum,
  IsIn,
  IsInt,
  IsISO8601,
  IsLatitude,
  IsLongitude,
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
import { CheckoutAddressDto } from '../checkout/checkout.dto';
import { ConfigurationInputsDto } from '../configurator/configurator.dto';
import { PageQueryDto } from '../../core/http/page-query.dto';

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;

export class AvailabilityQueryDto {
  @ApiProperty({ example: 'RUH' }) @Matches(/^[A-Z]{3}$/) cityCode: string;
  @ApiPropertyOptional() @IsOptional() @IsUUID() districtId?: string;
  @ApiProperty({ enum: BOOKING_TYPES }) @IsIn(BOOKING_TYPES) type: BookingType;
  @ApiPropertyOptional({ description: 'Installation of this order' }) @IsOptional() @IsUUID() orderId?: string;
}

export class BookingDto {
  @ApiProperty({ enum: BOOKING_TYPES }) @IsIn(BOOKING_TYPES) type: BookingType;
  @ApiProperty() @IsUUID() slotId: string;
  @ApiPropertyOptional() @IsOptional() @IsUUID() addressId?: string;
  @ApiPropertyOptional({ type: CheckoutAddressDto }) @IsOptional() @ValidateNested() @Type(() => CheckoutAddressDto) address?: CheckoutAddressDto;
  @ApiPropertyOptional() @IsOptional() @IsLatitude() lat?: number;
  @ApiPropertyOptional() @IsOptional() @IsLongitude() lng?: number;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(1000) notes?: string;
  @ApiPropertyOptional({ description: 'Product the customer is interested in' }) @IsOptional() @IsUUID() productId?: string;
  @ApiPropertyOptional({ description: 'Installation visits: the order to install' }) @IsOptional() @IsUUID() orderId?: string;
  @ApiPropertyOptional({ enum: PaymentMethod, description: 'For a visit fee' }) @IsOptional() @IsEnum(PaymentMethod) paymentMethod?: PaymentMethod;
  @ApiPropertyOptional({ enum: ['ar', 'en'] }) @IsOptional() @IsIn(['ar', 'en']) locale?: 'ar' | 'en';
}

export class RescheduleDto {
  @ApiProperty() @IsUUID() slotId: string;
}

export class CancelBookingDto {
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(500) reason?: string;
}

export class AcceptQuotationDto {
  @ApiProperty({ enum: PaymentMethod }) @IsEnum(PaymentMethod) paymentMethod: PaymentMethod;
}

// ───── Admin ─────

export class ServiceAreaDto {
  @ApiProperty({ example: 'RIYADH_NORTH' }) @Matches(/^[A-Z0-9_]{2,40}$/) code: string;
  @ApiProperty() @IsString() @Length(2, 80) nameAr: string;
  @ApiProperty() @IsString() @Length(2, 80) nameEn: string;
  @ApiProperty({ example: 'RUH' }) @Matches(/^[A-Z]{3}$/) cityCode: string;
  @ApiPropertyOptional({ description: 'Empty: the whole city' }) @IsOptional() @IsArray() @ArrayMaxSize(200) @IsUUID('4', { each: true }) districtIds?: string[];
  @ApiProperty({ enum: BOOKING_TYPES, isArray: true }) @IsArray() @ArrayMinSize(1) @IsIn(BOOKING_TYPES, { each: true }) types: BookingType[];
  @ApiProperty({ description: 'Halalas' }) @IsInt() @Min(0) @Max(10_000_000) measurementFee: number;
  @ApiProperty({ description: 'Halalas' }) @IsInt() @Min(0) @Max(10_000_000) installationFee: number;
  @ApiPropertyOptional({ description: 'Installation is free from this order total (halalas)' }) @IsOptional() @IsInt() @Min(0) @Max(100_000_000) freeInstallationAbove?: number | null;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() isActive?: boolean;
}

export class UpdateServiceAreaDto extends PartialType(ServiceAreaDto) {}

export class SlotWindowDto {
  @ApiProperty({ example: '09:00' }) @Matches(HHMM) start: string;
  @ApiProperty({ example: '12:00' }) @Matches(HHMM) end: string;
}

export class GenerateSlotsDto {
  @ApiProperty() @Matches(DATE) from: string;
  @ApiProperty() @Matches(DATE) to: string;
  @ApiProperty({ description: '0 = Sunday … 6 = Saturday', example: [0, 1, 2, 3, 4] }) @IsArray() @ArrayMinSize(1) @IsInt({ each: true }) @Min(0, { each: true }) @Max(6, { each: true }) weekdays: number[];
  @ApiProperty({ type: [SlotWindowDto] }) @IsArray() @ArrayMinSize(1) @ArrayMaxSize(8) @ValidateNested({ each: true }) @Type(() => SlotWindowDto) windows: SlotWindowDto[];
  @ApiProperty() @IsInt() @Min(1) @Max(100) capacity: number;
}

export class SlotQueryDto {
  @ApiProperty() @Matches(DATE) from: string;
  @ApiProperty() @Matches(DATE) to: string;
}

export class UpdateSlotDto {
  @ApiPropertyOptional() @IsOptional() @IsInt() @Min(1) @Max(100) capacity?: number;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() isActive?: boolean;
}

export class AdminBookingQueryDto extends PageQueryDto {
  @ApiPropertyOptional() @IsOptional() @Matches(DATE) from?: string;
  @ApiPropertyOptional() @IsOptional() @Matches(DATE) to?: string;
  @ApiPropertyOptional({ enum: BOOKING_STATUSES }) @IsOptional() @IsIn(BOOKING_STATUSES) status?: BookingStatus;
  @ApiPropertyOptional() @IsOptional() @IsUUID() areaId?: string;
  @ApiPropertyOptional() @IsOptional() @IsUUID() technicianId?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(60) q?: string;
}

export class AssignDto {
  @ApiPropertyOptional({ description: 'Technician user id; null unassigns' }) @IsOptional() @IsUUID() technicianId?: string | null;
}

export class TechnicianDto {
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(32) phone?: string;
  @ApiProperty() @IsArray() @ArrayMaxSize(50) @IsUUID('4', { each: true }) areaIds: string[];
  @ApiPropertyOptional() @IsOptional() @IsBoolean() isActive?: boolean;
}

// ───── Technician ─────

export class JobsQueryDto {
  @ApiPropertyOptional({ description: 'Riyadh date, default today' }) @IsOptional() @Matches(DATE) date?: string;
}

export class TechnicianStatusDto {
  @ApiProperty({ enum: ['EN_ROUTE', 'IN_PROGRESS', 'COMPLETED', 'NO_SHOW'] }) @IsIn(['EN_ROUTE', 'IN_PROGRESS', 'COMPLETED', 'NO_SHOW']) status: 'EN_ROUTE' | 'IN_PROGRESS' | 'COMPLETED' | 'NO_SHOW';
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(500) note?: string;
}

export class MeasurementDto {
  @ApiProperty({ example: 'Living room – left window' }) @IsString() @Length(1, 80) roomLabel: string;
  @ApiProperty() @IsInt() @Min(100) @Max(20_000) widthMm: number;
  @ApiProperty() @IsInt() @Min(100) @Max(20_000) heightMm: number;
  @ApiProperty({ enum: ['WALL', 'CEILING', 'RECESS'] }) @IsIn(['WALL', 'CEILING', 'RECESS']) mounting: 'WALL' | 'CEILING' | 'RECESS';
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(500) notes?: string;
  @ApiPropertyOptional() @IsOptional() @IsArray() @ArrayMaxSize(10) @IsUUID('4', { each: true }) photoIds?: string[];
}

export class UpdateMeasurementDto extends PartialType(MeasurementDto) {}

export class SignatureDto {
  @ApiProperty({ description: 'data:image/png;base64,…' }) @IsString() @MaxLength(2_000_000) @Matches(/^data:image\/(png|jpeg);base64,[A-Za-z0-9+/=]+$/) dataUrl: string;
}

export class QuotationLineDto {
  @ApiPropertyOptional() @IsOptional() @IsUUID() measurementId?: string;
  @ApiProperty() @IsUUID() productId: string;
  @ApiProperty() @IsUUID() variantId: string;
  @ApiProperty() @IsInt() @Min(1) @Max(50) quantity: number;
  @ApiProperty({ type: ConfigurationInputsDto }) @ValidateNested() @Type(() => ConfigurationInputsDto) inputs: ConfigurationInputsDto;
}

export class QuotationDto {
  @ApiProperty({ type: [QuotationLineDto] }) @IsArray() @ArrayMinSize(1) @ArrayMaxSize(40) @ValidateNested({ each: true }) @Type(() => QuotationLineDto) lines: QuotationLineDto[];
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(1000) notes?: string;
}

export class DateParamDto {
  @ApiProperty() @IsISO8601() date: string;
}
