import { Global, Injectable, Module } from '@nestjs/common';
import { S3StorageAdapter } from './s3-storage.adapter';
import { MALWARE_SCANNER, STORAGE, type MalwareScanner } from './storage.port';

/** Default scanner: relies on strict server-side type validation (images are fully re-encoded). */
@Injectable()
export class PassThroughScanner implements MalwareScanner {
  async scan() {
    return { clean: true };
  }
}

@Global()
@Module({
  providers: [
    S3StorageAdapter,
    { provide: STORAGE, useExisting: S3StorageAdapter },
    { provide: MALWARE_SCANNER, useClass: PassThroughScanner },
  ],
  exports: [STORAGE, MALWARE_SCANNER],
})
export class StorageModule {}
