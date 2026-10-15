import { OnWorkerEvent, Processor, WorkerHost } from '@nestjs/bullmq';
import type { Job } from 'bullmq';
import { QUEUES } from '../../core/queue/queue.module';
import { MediaService } from './media.service';

@Processor(QUEUES.media, { concurrency: 2 })
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
