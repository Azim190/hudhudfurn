import { Module } from '@nestjs/common';
import { APP_FILTER, APP_GUARD } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { LoggerModule } from 'nestjs-pino';
import { randomUUID } from 'node:crypto';
import { AppConfig } from './core/config/app-config.service';
import { CoreModule } from './core/core.module';
import { AllExceptionsFilter } from './core/errors/all-exceptions.filter';
import { RedisThrottlerStorage } from './core/throttler/redis-throttler.storage';
import { AdminModule } from './modules/admin/admin.module';
import { AuditModule } from './modules/audit/audit.module';
import { AuthModule } from './modules/auth/auth.module';
import { SettingsModule } from './modules/settings/settings.module';
import { UsersModule } from './modules/users/users.module';

@Module({
  imports: [
    CoreModule,
    LoggerModule.forRootAsync({
      inject: [AppConfig],
      useFactory: (config: AppConfig) => ({
        pinoHttp: {
          level: config.get('LOG_LEVEL'),
          genReqId: (req, res) => {
            const id = (req.headers['x-request-id'] as string | undefined) ?? randomUUID();
            res.setHeader('x-request-id', id);
            return id;
          },
          redact: {
            paths: ['req.headers.authorization', 'req.headers.cookie', 'res.headers["set-cookie"]'],
            remove: true,
          },
          autoLogging: { ignore: (req) => req.url?.startsWith('/api/v1/health') ?? false },
          transport: config.isProduction ? undefined : { target: 'pino-pretty', options: { singleLine: true } },
        },
      }),
    }),
    ThrottlerModule.forRootAsync({
      inject: [RedisThrottlerStorage],
      useFactory: (storage: RedisThrottlerStorage) => ({
        throttlers: [{ name: 'default', ttl: 60_000, limit: 300 }],
        storage,
      }),
    }),
    AuditModule,
    SettingsModule,
    AuthModule,
    UsersModule,
    AdminModule,
  ],
  providers: [
    // Order matters: throttle first, then authenticate (AuthModule), then authorise.
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_FILTER, useClass: AllExceptionsFilter },
  ],
})
export class AppModule {}
