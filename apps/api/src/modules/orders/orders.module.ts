import { Module } from '@nestjs/common';
import { ConfiguratorModule } from '../configurator/configurator.module';
import { InvoicingModule } from '../invoicing/invoicing.module';
import { PaymentsModule } from '../payments/payments.module';
import { PromotionsModule } from '../promotions/promotions.module';
import { SearchModule } from '../search/search.module';
import { AdminOrdersController } from './admin-orders.controller';
import { OrderPaymentsService } from './order-payments.service';
import { MyOrdersController, OrdersController } from './orders.controller';
import { OrdersProcessor } from './orders.processor';
import { OrdersService } from './orders.service';
import { PaymentsController } from './payments.controller';
import { StockLedger } from './stock-ledger';

const workersEnabled = process.env.WORKERS_ENABLED !== 'false';

@Module({
  imports: [ConfiguratorModule, InvoicingModule, PaymentsModule, PromotionsModule, SearchModule],
  controllers: [OrdersController, MyOrdersController, PaymentsController, AdminOrdersController],
  providers: [OrdersService, OrderPaymentsService, StockLedger, ...(workersEnabled ? [OrdersProcessor] : [])],
  exports: [OrdersService, OrderPaymentsService, StockLedger],
})
export class OrdersModule {}
