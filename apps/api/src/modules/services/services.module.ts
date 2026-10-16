import { Module } from '@nestjs/common';
import { IdempotencyService } from '../../core/http/idempotency.service';
import { ConfiguratorModule } from '../configurator/configurator.module';
import { OrdersModule } from '../orders/orders.module';
import { SmsModule } from '../sms/sms.module';
import { QuotationsService } from './quotations.service';
import { AdminServicesController, QuotationsController, ServicesController, TechnicianController } from './services.controller';
import { ServicesService } from './services.service';
import { TechnicianService } from './technician.service';

@Module({
  imports: [OrdersModule, ConfiguratorModule, SmsModule],
  controllers: [ServicesController, QuotationsController, TechnicianController, AdminServicesController],
  providers: [ServicesService, TechnicianService, QuotationsService, IdempotencyService],
  exports: [ServicesService],
})
export class ServicesModule {}
