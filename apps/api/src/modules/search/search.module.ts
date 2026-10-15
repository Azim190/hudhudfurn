import { Module } from '@nestjs/common';
import { MediaModule } from '../media/media.module';
import { SearchProcessor, SearchSync } from './search-sync';
import { SearchService } from './search.service';

const workersEnabled = process.env.WORKERS_ENABLED !== 'false';

@Module({
  imports: [MediaModule],
  providers: [SearchService, SearchSync, ...(workersEnabled ? [SearchProcessor] : [])],
  exports: [SearchService, SearchSync],
})
export class SearchModule {}
