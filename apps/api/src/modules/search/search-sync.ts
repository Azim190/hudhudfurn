import { InjectQueue, Processor, WorkerHost } from '@nestjs/bullmq';
import { Injectable, Logger } from '@nestjs/common';
import type { Job, Queue } from 'bullmq';
import { PrismaService } from '../../core/prisma/prisma.service';
import { QUEUES } from '../../core/queue/queue.module';
import { SearchService } from './search.service';

/** Producers call this after any catalog write; indexing happens asynchronously and is retried. */
@Injectable()
export class SearchSync {
  private readonly logger = new Logger(SearchSync.name);

  constructor(
    @InjectQueue(QUEUES.search) private readonly queue: Queue,
    private readonly prisma: PrismaService,
  ) {}

  async products(ids: string[]): Promise<void> {
    const unique = [...new Set(ids)];
    if (unique.length === 0) return;
    try {
      // Collapse bursts of edits to the same product into one indexing job.
      await this.queue.addBulk(
        unique.map((id) => ({
          name: 'sync',
          data: { ids: [id] },
          opts: { deduplication: { id: `product:${id}`, ttl: 1_000 }, delay: 300 },
        })),
      );
    } catch (err) {
      this.logger.error({ err }, 'Could not enqueue search sync');
    }
  }

  async category(categoryId: string): Promise<void> {
    const ids = await this.prisma.product.findMany({ where: { categoryId }, select: { id: true } });
    await this.products(ids.map((p) => p.id));
  }

  async attributeValue(attributeValueIds: string[]): Promise<void> {
    const rows = await this.prisma.product.findMany({
      where: {
        OR: [
          { attributes: { some: { attributeValueId: { in: attributeValueIds } } } },
          { variants: { some: { options: { some: { attributeValueId: { in: attributeValueIds } } } } } },
        ],
      },
      select: { id: true },
    });
    await this.products(rows.map((r) => r.id));
  }
}

@Processor(QUEUES.search, { concurrency: 1 })
export class SearchProcessor extends WorkerHost {
  constructor(private readonly search: SearchService) {
    super();
  }

  async process(job: Job<{ ids?: string[]; all?: boolean }>) {
    if (job.data.all) return this.search.reindexAll();
    return this.search.syncProducts(job.data.ids ?? []);
  }
}
