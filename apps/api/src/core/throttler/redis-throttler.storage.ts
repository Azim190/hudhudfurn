import { Injectable } from '@nestjs/common';
import type { ThrottlerStorage } from '@nestjs/throttler';
import type Redis from 'ioredis';
import { InjectRedis } from '../redis/redis.provider';

interface ThrottlerStorageRecord {
  totalHits: number;
  timeToExpire: number;
  isBlocked: boolean;
  timeToBlockExpire: number;
}

/**
 * Atomic fixed-window counter with optional block period, shared by all API instances.
 * Returns [hits, ttlMs, blockTtlMs].
 */
const SCRIPT = `
local hitsKey = KEYS[1]
local blockKey = KEYS[2]
local ttl = tonumber(ARGV[1])
local limit = tonumber(ARGV[2])
local blockDuration = tonumber(ARGV[3])
local blockTtl = redis.call('PTTL', blockKey)
if blockTtl > 0 then
  return { limit + 1, redis.call('PTTL', hitsKey), blockTtl }
end
local hits = redis.call('INCR', hitsKey)
if hits == 1 then redis.call('PEXPIRE', hitsKey, ttl) end
local hitsTtl = redis.call('PTTL', hitsKey)
if hits > limit and blockDuration > 0 then
  redis.call('SET', blockKey, '1', 'PX', blockDuration)
  return { hits, hitsTtl, blockDuration }
end
return { hits, hitsTtl, 0 }
`;

@Injectable()
export class RedisThrottlerStorage implements ThrottlerStorage {
  constructor(@InjectRedis() private readonly redis: Redis) {}

  async increment(
    key: string,
    ttl: number,
    limit: number,
    blockDuration: number,
    throttlerName: string,
  ): Promise<ThrottlerStorageRecord> {
    const base = `throttle:${throttlerName}:${key}`;
    const [hits, hitsTtl, blockTtl] = (await this.redis.eval(
      SCRIPT,
      2,
      `${base}:hits`,
      `${base}:block`,
      ttl,
      limit,
      blockDuration,
    )) as [number, number, number];
    const isBlocked = hits > limit;
    return {
      totalHits: hits,
      timeToExpire: Math.max(0, Math.ceil(hitsTtl / 1000)),
      isBlocked,
      timeToBlockExpire: isBlocked ? Math.max(1, Math.ceil((blockTtl || hitsTtl) / 1000)) : 0,
    };
  }
}
