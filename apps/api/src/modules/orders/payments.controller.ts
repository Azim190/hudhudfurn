import { Body, Controller, Get, HttpCode, Param, Post, Query, Req, Res } from '@nestjs/common';
import { ApiExcludeEndpoint, ApiTags } from '@nestjs/swagger';
import { SkipThrottle } from '@nestjs/throttler';
import type { PaymentProvider } from '@prisma/client';
import type { Request, Response } from 'express';
import { AppConfig } from '../../core/config/app-config.service';
import { AppError } from '../../core/errors/app-error';
import { Public } from '../auth/interface/decorators';
import { PaymentGateways } from '../payments/payment-gateways';
import { OrderPaymentsService } from './order-payments.service';

const PROVIDERS: Record<string, PaymentProvider> = { moyasar: 'MOYASAR', tabby: 'TABBY', tamara: 'TAMARA' };

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

@ApiTags('payments')
@Public()
@Controller('payments')
export class PaymentsController {
  constructor(
    private readonly payments: OrderPaymentsService,
    private readonly gateways: PaymentGateways,
    private readonly config: AppConfig,
  ) {}

  /** Gateway notifications (Moyasar, Tabby, Tamara). Authenticated per gateway, deduplicated by event id. */
  @Post('webhooks/:provider')
  @HttpCode(200)
  @SkipThrottle()
  webhook(@Param('provider') provider: string, @Req() req: Request, @Body() body: unknown, @Query() query: Record<string, unknown>) {
    const p = PROVIDERS[provider];
    if (!p) throw AppError.notFound();
    return this.payments.handleWebhook(p, { headers: req.headers, query, body });
  }

  /** Hosted page of the development payment simulator. */
  @Get('simulator/:ref')
  @ApiExcludeEndpoint()
  async simulatorPage(@Param('ref') ref: string, @Res() res: Response) {
    const sim = this.gateways.simulator;
    const p = sim && /^sim_[a-f0-9]{24}$/.test(ref) ? await sim.get(ref) : null;
    if (!p) throw AppError.notFound();
    const ar = p.locale === 'ar';
    const t = ar
      ? { title: 'محاكي الدفع', note: 'بيئة تطوير — لا يتم تحصيل أي مبلغ', order: 'الطلب', amount: 'المبلغ', pay: 'ادفع الآن', decline: 'رفض البطاقة', cancel: 'إلغاء والعودة', method: 'الطريقة' }
      : { title: 'Payment simulator', note: 'Development only — no money is charged', order: 'Order', amount: 'Amount', pay: 'Pay now', decline: 'Decline card', cancel: 'Cancel and return', method: 'Method' };
    const amount = `${(p.amount / 100).toFixed(2)} SAR`;
    const done = p.status !== 'PENDING';
    res.setHeader('Content-Security-Policy', `default-src 'none'; style-src 'unsafe-inline'; form-action 'self' ${new URL(this.config.get('STOREFRONT_URL')).origin}`);
    res.type('html').send(`<!doctype html><html lang="${p.locale}" dir="${ar ? 'rtl' : 'ltr'}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${t.title}</title>
<style>body{font-family:system-ui,sans-serif;background:#f6f4ef;margin:0;padding:24px;color:#1f2933}main{max-width:420px;margin:0 auto;background:#fff;border-radius:12px;padding:24px;box-shadow:0 1px 3px #0002}h1{font-size:20px;margin:0 0 4px}p.note{color:#8a5a00;font-size:13px;margin:0 0 16px}dl{display:grid;grid-template-columns:auto 1fr;gap:6px 12px}dt{color:#667}button{display:block;inline-size:100%;margin-block-start:10px;padding:12px;border-radius:8px;border:1px solid #1f2933;font-size:15px;cursor:pointer;background:#fff}button.primary{background:#1f2933;color:#fff}</style></head>
<body><main><h1>${t.title}</h1><p class="note">${t.note}</p><dl><dt>${t.order}</dt><dd>${esc(p.orderNumber)}</dd><dt>${t.amount}</dt><dd dir="ltr">${amount}</dd><dt>${t.method}</dt><dd>${p.method}</dd></dl>
<form method="post">${done ? '' : `<button class="primary" name="outcome" value="pay">${t.pay}</button><button name="outcome" value="decline">${t.decline}</button>`}<button name="outcome" value="cancel">${t.cancel}</button></form></main></body></html>`);
  }

  @Post('simulator/:ref')
  @ApiExcludeEndpoint()
  async simulatorComplete(@Param('ref') ref: string, @Body() body: { outcome?: string }, @Res() res: Response) {
    const sim = this.gateways.simulator;
    if (!sim || !/^sim_[a-f0-9]{24}$/.test(ref)) throw AppError.notFound();
    const outcome = body.outcome === 'pay' || body.outcome === 'decline' ? body.outcome : 'cancel';
    const p = await sim.complete(ref, outcome);
    res.redirect(303, p.returnUrl);
  }
}
