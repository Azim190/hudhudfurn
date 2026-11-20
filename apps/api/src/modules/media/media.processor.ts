import { OnWorkerEvent, Processor, WorkerHost } from '@nestjs/bullmq';
import type { Job } from 'bullmq';
import { QUEUES } from '../../core/queue/queue.module';
import { MediaService } from './media.service';

// Images processed in parallel. 1 on a single-vCPU server keeps the site responsive during bulk uploads.
const MEDIA_CONCURRENCY = Math.min(8, Math.max(1, Number.parseInt(process.env.MEDIA_CONCURRENCY ?? '', 10) || 2));

@Processor(QUEUES.media, { concurrency: MEDIA_CONCURRENCY })
export class MediaProcessor extends WorkerHost {
  constructor(private readonly media: MediaService) {
    super();
  }

  async process(job: Job<{ mediaId: string }>): Promise<void> {
    await this.media.generateRenditions(job.data.mediaId);
  }

  @OnWorkerEvent('failed')
  async onFailed(job: Job<{ mediaId: string }> | undefined, err: Error) {
    if (job && job.attemptsMade >= (job.opts.attempts ?? 1)) await this.media.markFailed(job.data.mediaId, err.message);
  }
}
