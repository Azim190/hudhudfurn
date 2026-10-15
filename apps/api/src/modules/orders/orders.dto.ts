import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ORDER_STATUSES, type OrderStatus } from '@hudhud/domain';
import { OrderPaymentState, PaymentMethod } from '@prisma/client';
import { IsEnum, IsIn, IsISO8601, IsOptional, IsString, Length, MaxLength } from 'class-validator';
import { PageQueryDto } from '../../core/http/page-query.dto';

export class AdminOrderQueryDto extends PageQueryDto {
  @ApiPropertyOptional({ description: 'Order number, phone or customer name' }) @IsOptional() @IsString() @MaxLength(80) q?: string;
  @ApiPropertyOptional({ enum: ORDER_STATUSES }) @IsOptional() @IsIn(ORDER_STATUSES) status?: OrderStatus;
  @ApiPropertyOptional({ enum: PaymentMethod }) @IsOptional() @IsEnum(PaymentMethod) paymentMethod?: PaymentMethod;
  @ApiPropertyOptional({ enum: OrderPaymentState }) @IsOptional() @IsEnum(OrderPaymentState) paymentState?: OrderPaymentState;
  @ApiPropertyOptional() @IsOptional() @IsISO8601() from?: string;
  @ApiPropertyOptional() @IsOptional() @IsISO8601() to?: string;
}

export class OrderTransitionDto {
  @ApiProperty({ enum: ORDER_STATUSES }) @IsIn(ORDER_STATUSES) status: OrderStatus;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(500) note?: string;
}

export class CancelOrderDto {
  @ApiProperty() @IsString() @Length(2, 500) reason: string;
}

export class CustomerCancelDto {
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(500) reason?: string;
}
