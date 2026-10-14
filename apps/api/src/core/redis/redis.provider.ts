import { Inject, Injectable, type OnModuleDestroy } from '@nestjs/common';
import Redis from 'ioredis';
import { AppConfig } from '../config/app-config.service';

export const REDIS = Symbol('REDIS');
export const InjectRedis = () => Inject(REDIS);

export const redisProvider = {
  provide: REDIS,
  inject: [AppConfig],
  useFactory: (config: AppConfig) =>
    new Redis(config.get('REDIS_URL'), { maxRetriesPerRequest: 3, enableReadyCheck: true }),
};

@Injectable()
export class RedisShutdown implements OnModuleDestroy {
  constructor(@InjectRedis() private readonly redis: Redis) {}

  async onModuleDestroy(): Promise<void> {
    await this.redis.quit().catch(() => this.redis.disconnect());
  }
}
