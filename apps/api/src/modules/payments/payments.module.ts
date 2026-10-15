import { Module } from '@nestjs/common';
import { PaymentGateways } from './payment-gateways';

@Module({
  providers: [PaymentGateways],
  exports: [PaymentGateways],
})
export class PaymentsModule {}
