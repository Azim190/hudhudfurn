import { Module } from '@nestjs/common';
import { AdminInvoicesController } from './admin-invoices.controller';
import { InvoicingProcessor } from './invoicing.processor';
import { InvoicingService } from './invoicing.service';
import { ZatcaClient } from './zatca-client';
import { ZatcaKeys } from './zatca-keys.service';

const workersEnabled = process.env.WORKERS_ENABLED !== 'false';

@Module({
  controllers: [AdminInvoicesController],
  providers: [InvoicingService, ZatcaKeys, ZatcaClient, ...(workersEnabled ? [InvoicingProcessor] : [])],
  exports: [InvoicingService],
})
export class InvoicingModule {}
