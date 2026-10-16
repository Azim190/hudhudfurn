import { Module } from '@nestjs/common';
import { IdempotencyService } from '../../core/http/idempotency.service';
import { CartModule } from '../cart/cart.module';
import { ConfiguratorModule } from '../configurator/configurator.module';
import { OrdersModule } from '../orders/orders.module';
import { PaymentsModule } from '../payments/payments.module';
import { PromotionsModule } from '../promotions/promotions.module';
import { SearchModule } from '../search/search.module';
import { ShippingModule } from '../shipping/shipping.module';
import { CheckoutController } from './checkout.controller';
import { CheckoutService } from './checkout.service';

@Module({
  imports: [CartModule, ConfiguratorModule, OrdersModule, PaymentsModule, PromotionsModule, ShippingModule, SearchModule],
  controllers: [CheckoutController],
  providers: [CheckoutService, IdempotencyService],
})
export class CheckoutModule {}
