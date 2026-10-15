import { Module } from '@nestjs/common';
import { MediaController } from './media.controller';
import { MediaProcessor } from './media.processor';
import { MediaService } from './media.service';

const workersEnabled = process.env.WORKERS_ENABLED !== 'false';

@Module({
  controllers: [MediaController],
  providers: [MediaService, ...(workersEnabled ? [MediaProcessor] : [])],
  exports: [MediaService],
})
export class MediaModule {}
