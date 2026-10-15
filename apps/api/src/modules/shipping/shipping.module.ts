import { Module } from '@nestjs/common';
import { AdminShippingController } from './admin-shipping.controller';
import { ShippingService } from './shipping.service';

@Module({
  controllers: [AdminShippingController],
  providers: [ShippingService],
  exports: [ShippingService],
})
export class ShippingModule {}
