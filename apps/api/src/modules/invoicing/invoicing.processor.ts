import { OnWorkerEvent, Processor, WorkerHost } from '@nestjs/bullmq';
import type { Job } from 'bullmq';
import { QUEUES } from '../../core/queue/queue.module';
import { InvoicingService } from './invoicing.service';

type InvoicingJob = Job<{ invoiceId?: string; orderId?: string; reason?: string }>;

/** `issue` retries invoice issuance after payment; `report` sends a document to ZATCA. */
@Processor(QUEUES.invoicing, { concurrency: 1 })
export class InvoicingProcessor extends WorkerHost {
  constructor(private readonly invoicing: InvoicingService) {
    super();
  }

  async process(job: InvoicingJob): Promise<void> {
    if (job.name === 'issue' && job.data.orderId) await this.invoicing.issueForOrder(job.data.orderId);
    else if (job.name === 'credit' && job.data.orderId) await this.invoicing.issueCreditNote(job.data.orderId, job.data.reason ?? 'Order cancelled');
    else if (job.name === 'report' && job.data.invoiceId) await this.invoicing.report(job.data.invoiceId);
  }

  @OnWorkerEvent('failed')
  async onFailed(job: InvoicingJob | undefined, err: Error) {
    if (job?.name === 'report' && job.data.invoiceId && job.attemptsMade >= (job.opts.attempts ?? 1)) await this.invoicing.markReportFailed(job.data.invoiceId, err.message);
  }
}
