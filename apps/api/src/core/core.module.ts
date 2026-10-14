import { Global, Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AppConfig } from './config/app-config.service';
import { validateEnv } from './config/env';
import { CryptoService } from './crypto/crypto.service';
import { HealthController } from './health/health.controller';
import { PrismaService } from './prisma/prisma.service';
import { redisProvider, RedisShutdown, REDIS } from './redis/redis.provider';
import { RedisThrottlerStorage } from './throttler/redis-throttler.storage';

@Global()
@Module({
  imports: [ConfigModule.forRoot({ isGlobal: true, cache: true, validate: validateEnv })],
  controllers: [HealthController],
  providers: [AppConfig, PrismaService, redisProvider, RedisShutdown, CryptoService, RedisThrottlerStorage],
  exports: [AppConfig, PrismaService, REDIS, CryptoService, RedisThrottlerStorage],
})
export class CoreModule {}
