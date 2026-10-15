import { Injectable, Logger } from '@nestjs/common';
import { AppConfig } from '../../core/config/app-config.service';

/**
 * Tells the storefront to drop cached (ISR) pages after catalog or content changes, so edits show
 * up within seconds instead of after the revalidation window. Best effort: pages still expire
 * on their own if the storefront is unreachable.
 */
@Injectable()
export class StorefrontRevalidator {
  private readonly logger = new Logger(StorefrontRevalidator.name);

  constructor(private readonly config: AppConfig) {}

  async tags(tags: string[]): Promise<void> {
    const url = this.config.get('STOREFRONT_REVALIDATE_URL');
    const secret = this.config.get('REVALIDATE_SECRET');
    if (!url || !secret) return;
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${secret}` },
        body: JSON.stringify({ tags }),
        signal: AbortSignal.timeout(5_000),
      });
      if (!res.ok) this.logger.warn(`Storefront revalidation returned ${res.status}`);
    } catch (err) {
      this.logger.warn(`Storefront revalidation failed: ${(err as Error).message}`);
    }
  }
}
