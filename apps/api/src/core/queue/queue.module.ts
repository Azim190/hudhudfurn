import { BullModule } from '@nestjs/bullmq';
import { Global, Module } from '@nestjs/common';
import { AppConfig } from '../config/app-config.service';

export const QUEUES = {
  media: 'media',
  search: 'search',
  catalogImport: 'catalog-import',
  orders: 'orders',
  invoicing: 'invoicing',
} as const;

/** Redis-backed job queues (BullMQ). Workers run in-process when WORKERS_ENABLED=true. */
@Global()
@Module({
  imports: [
    BullModule.forRootAsync({
      inject: [AppConfig],
      useFactory: (config: AppConfig) => {
        const url = new URL(config.get('REDIS_URL'));
        return {
          connection: {
            host: url.hostname,
            port: Number(url.port || 6379),
            password: url.password || undefined,
            db: url.pathname.length > 1 ? Number(url.pathname.slice(1)) : 0,
            maxRetriesPerRequest: null,
          },
          prefix: 'hd',
          defaultJobOptions: {
            attempts: 5,
            backoff: { type: 'exponential', delay: 2_000 },
            removeOnComplete: 1000,
            removeOnFail: 5000,
          },
        };
      },
    }),
    BullModule.registerQueue({ name: QUEUES.media }, { name: QUEUES.search }, { name: QUEUES.catalogImport }, { name: QUEUES.orders }, { name: QUEUES.invoicing }),
  ],
  exports: [BullModule],
})
export class QueueModule {}
