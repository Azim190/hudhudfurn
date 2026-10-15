import { Injectable } from '@nestjs/common';
import type { PaymentMethod, PaymentProvider } from '@prisma/client';
import { AppConfig } from '../../core/config/app-config.service';
import type Redis from 'ioredis';
import { InjectRedis } from '../../core/redis/redis.provider';
import { MoyasarGateway } from './gateways/moyasar.gateway';
import { SimulatorGateway } from './gateways/simulator.gateway';
import { TabbyGateway } from './gateways/tabby.gateway';
import { TamaraGateway } from './gateways/tamara.gateway';
import type { PaymentGateway } from './payment-gateway.port';

/**
 * Picks the gateway for each payment method from configuration: a real provider when its
 * credentials are present, otherwise the simulator when it is enabled (never in production).
 * Cash on delivery needs no gateway.
 */
@Injectable()
export class PaymentGateways {
  private readonly byMethod = new Map<PaymentMethod, PaymentGateway>();
  private readonly byProvider = new Map<PaymentProvider, PaymentGateway>();
  readonly simulator?: SimulatorGateway;

  constructor(config: AppConfig, @InjectRedis() redis: Redis) {
    const real: PaymentGateway[] = [];
    const moyasarKey = config.get('MOYASAR_SECRET_KEY');
    if (moyasarKey) real.push(new MoyasarGateway({ secretKey: moyasarKey, webhookSecret: config.get('MOYASAR_WEBHOOK_SECRET')!, baseUrl: config.get('MOYASAR_BASE_URL') }));
    const tabbyKey = config.get('TABBY_SECRET_KEY');
    if (tabbyKey) real.push(new TabbyGateway({ secretKey: tabbyKey, merchantCode: config.get('TABBY_MERCHANT_CODE')!, webhookSecret: config.get('TABBY_WEBHOOK_SECRET')!, baseUrl: config.get('TABBY_BASE_URL') }));
    const tamaraToken = config.get('TAMARA_API_TOKEN');
    if (tamaraToken) real.push(new TamaraGateway({ apiToken: tamaraToken, notificationToken: config.get('TAMARA_NOTIFICATION_TOKEN')!, baseUrl: config.get('TAMARA_BASE_URL') }));

    for (const g of real) {
      this.byProvider.set(g.provider, g);
      for (const m of g.methods) this.byMethod.set(m, g);
    }
    if (config.get('PAYMENTS_SIMULATOR') && !config.isProduction) {
      const uncovered = (['CARD', 'TABBY', 'TAMARA'] as const).filter((m) => !this.byMethod.has(m));
      this.simulator = new SimulatorGateway(redis, config.get('API_PUBLIC_URL'), uncovered);
      this.byProvider.set('SIMULATOR', this.simulator);
      for (const m of uncovered) this.byMethod.set(m, this.simulator);
    }
  }

  forMethod(method: PaymentMethod): PaymentGateway | undefined {
    return this.byMethod.get(method);
  }

  get(provider: PaymentProvider): PaymentGateway | undefined {
    return this.byProvider.get(provider);
  }
}
