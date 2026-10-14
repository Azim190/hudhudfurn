import { Controller, Get, HttpCode, ServiceUnavailableException } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { SkipThrottle } from '@nestjs/throttler';
import type Redis from 'ioredis';
import { Public } from '../../modules/auth/interface/decorators';
import { PrismaService } from '../prisma/prisma.service';
import { InjectRedis } from '../redis/redis.provider';

@ApiTags('health')
@Public()
@SkipThrottle()
@Controller('health')
export class HealthController {
  constructor(
    private readonly prisma: PrismaService,
    @InjectRedis() private readonly redis: Redis,
  ) {}

  @Get('live')
  @HttpCode(200)
  live() {
    return { status: 'ok' };
  }

  @Get('ready')
  async ready() {
    const checks = await Promise.allSettled([
      this.prisma.$queryRaw`SELECT 1`,
      this.redis.ping(),
    ]);
    const [db, redis] = checks.map((c) => (c.status === 'fulfilled' ? 'up' : 'down'));
    const result = { status: db === 'up' && redis === 'up' ? 'ok' : 'degraded', db, redis };
    if (result.status !== 'ok') throw new ServiceUnavailableException(result);
    return result;
  }
}
