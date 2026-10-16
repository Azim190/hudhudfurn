import { Controller, Get, Query } from '@nestjs/common';
import { ApiExcludeController } from '@nestjs/swagger';
import { normalizeSaudiMobile } from '@hudhud/domain';
import type Redis from 'ioredis';
import { AppConfig } from '../../core/config/app-config.service';
import { AppError } from '../../core/errors/app-error';
import { InjectRedis } from '../../core/redis/redis.provider';
import { Public } from '../auth/interface/decorators';
import { DEV_OUTBOX_KEY } from './providers';

/**
 * Local SMS outbox for development and end-to-end tests (OTP codes, booking messages). Only
 * answers when the console SMS provider is active outside production; otherwise it is a 404.
 */
@ApiExcludeController()
@Public()
@Controller('dev/sms')
export class DevOutboxController {
  constructor(
    private readonly config: AppConfig,
    @InjectRedis() private readonly redis: Redis,
  ) {}

  /** `?to=05…` returns that number's last messages; without it, the latest messages to every number. */
  @Get()
  async latest(@Query('to') to?: string) {
    if (this.config.isProduction || this.config.get('SMS_PROVIDER') !== 'console') throw AppError.notFound();
    if (!to) return this.all();
    const phone = normalizeSaudiMobile(to);
    if (!phone) throw AppError.badRequest('phoneInvalid');
    const items = await this.redis.lrange(DEV_OUTBOX_KEY(phone), 0, 9);
    return items.map((i) => JSON.parse(i) as { body: string; at: string });
  }

  private async all() {
    const keys: string[] = [];
    let cursor = '0';
    do {
      const [next, batch] = await this.redis.scan(cursor, 'MATCH', DEV_OUTBOX_KEY('*'), 'COUNT', 200);
      cursor = next;
      keys.push(...batch);
    } while (cursor !== '0' && keys.length < 500);
    const messages = await Promise.all(
      keys.map(async (key) => (await this.redis.lrange(key, 0, 9)).map((i) => ({ to: key.slice(DEV_OUTBOX_KEY('').length), ...(JSON.parse(i) as { body: string; at: string }) }))),
    );
    return messages
      .flat()
      .sort((a, b) => b.at.localeCompare(a.at))
      .slice(0, 50);
  }
}
