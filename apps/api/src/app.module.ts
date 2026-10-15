import { Module } from '@nestjs/common';
import { APP_FILTER, APP_GUARD } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { LoggerModule } from 'nestjs-pino';
import { randomUUID } from 'node:crypto';
import { AppConfig } from './core/config/app-config.service';
import { CoreModule } from './core/core.module';
import { QueueModule } from './core/queue/queue.module';
import { AllExceptionsFilter } from './core/errors/all-exceptions.filter';
import { RedisThrottlerStorage } from './core/throttler/redis-throttler.storage';
import { AdminModule } from './modules/admin/admin.module';
import { AuditModule } from './modules/audit/audit.module';
import { AuthModule } from './modules/auth/auth.module';
import { CartModule } from './modules/cart/cart.module';
import { CatalogModule } from './modules/catalog/catalog.module';
import { CheckoutModule } from './modules/checkout/checkout.module';
import { ContentModule, RevalidationModule } from './modules/content/content.module';
import { ShopModule } from './modules/shop/shop.module';
import { InvoicingModule } from './modules/invoicing/invoicing.module';
import { MediaModule } from './modules/media/media.module';
import { OrdersModule } from './modules/orders/orders.module';
import { PaymentsModule } from './modules/payments/payments.module';
import { PromotionsModule } from './modules/promotions/promotions.module';
import { SearchModule } from './modules/search/search.module';
import { StorageModule } from './modules/storage/storage.module';
import { SettingsModule } from './modules/settings/settings.module';
import { ShippingModule } from './modules/shipping/shipping.module';
import { UsersModule } from './modules/users/users.module';

@Module({
  imports: [
    CoreModule,
    QueueModule,
    StorageModule,
    RevalidationModule,
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
    MediaModule,
    SearchModule,
    CatalogModule,
    CartModule,
    ShopModule,
    ContentModule,
    ShippingModule,
    PromotionsModule,
    PaymentsModule,
    InvoicingModule,
    OrdersModule,
    CheckoutModule,
  ],
  providers: [
    // Order matters: throttle first, then authenticate (AuthModule), then authorise.
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_FILTER, useClass: AllExceptionsFilter },
  ],
})
export class AppModule {}
