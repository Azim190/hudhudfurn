import { InjectQueue, Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger, type OnApplicationBootstrap } from '@nestjs/common';
import type { Job, Queue } from 'bullmq';
import { QUEUES } from '../../core/queue/queue.module';
import { ConfiguratorService } from '../configurator/configurator.service';
import { OrderPaymentsService } from './order-payments.service';
import { OrdersService } from './orders.service';

/**
 * Every minute: cancel prepaid orders whose payment window has passed and release their stock.
 * Every hour: delete customer photos that were uploaded but never attached to a configuration.
 */
@Processor(QUEUES.orders, { concurrency: 1 })
export class OrdersProcessor extends WorkerHost implements OnApplicationBootstrap {
  private readonly logger = new Logger(OrdersProcessor.name);

  constructor(
    private readonly orders: OrdersService,
    private readonly payments: OrderPaymentsService,
    private readonly configurator: ConfiguratorService,
    @InjectQueue(QUEUES.orders) private readonly queue: Queue,
  ) {
    super();
  }

  async onApplicationBootstrap() {
    // Tests drive expiry directly instead of on a timer.
    if (process.env.NODE_ENV === 'test') return;
    await this.queue.upsertJobScheduler('expire-unpaid', { every: 60_000 }, { name: 'expire-unpaid', opts: { attempts: 1, removeOnComplete: 100, removeOnFail: 100 } });
    await this.queue.upsertJobScheduler('purge-uploads', { every: 3_600_000 }, { name: 'purge-uploads', opts: { attempts: 1, removeOnComplete: 20, removeOnFail: 20 } });
  }

  async process(job: Job): Promise<void> {
    if (job.name === 'purge-uploads') {
      const purged = await this.configurator.purgeStaleUploads();
      if (purged) this.logger.log(`Purged ${purged} unattached upload(s)`);
      return;
    }
    if (job.name !== 'expire-unpaid') return;
    const count = await this.orders.expireUnpaid((orderId) => this.payments.syncOrder(orderId));
    if (count) this.logger.log(`Expired ${count} unpaid order(s)`);
  }
}
