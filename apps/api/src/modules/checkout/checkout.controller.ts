import { Body, Controller, Get, Headers, HttpCode, Post, Req } from '@nestjs/common';
import { ApiHeader, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import type { Request } from 'express';
import { createHash } from 'node:crypto';
import { AppError } from '../../core/errors/app-error';
import { IdempotencyService } from '../../core/http/idempotency.service';
import { Public } from '../auth/interface/decorators';
import type { CartOwner } from '../cart/cart.service';
import type { Shopper } from '../promotions/promotions.service';
import { CheckoutQuoteDto, PlaceOrderDto } from './checkout.dto';
import { CheckoutService } from './checkout.service';

const CART_TOKEN = /^[\w-]{20,100}$/;

@ApiTags('checkout')
@ApiHeader({ name: 'X-Cart-Token', required: false, description: 'Guest cart token' })
@Public()
@Controller('checkout')
export class CheckoutController {
  constructor(
    private readonly checkout: CheckoutService,
    private readonly idempotency: IdempotencyService,
  ) {}

  private who(req: Request, token?: string): { owner: CartOwner; shopper: Shopper } {
    if (req.user) {
      if (req.user.kind !== 'CUSTOMER') throw AppError.forbidden();
      return { owner: { userId: req.user.id }, shopper: { userId: req.user.id } };
    }
    return { owner: token && CART_TOKEN.test(token) ? { guestToken: token } : {}, shopper: {} };
  }

  /** Branches where orders can be collected. */
  @Get('pickup-locations')
  pickupLocations() {
    return this.checkout.pickupLocations();
  }

  /** Price the cart for an address or pickup branch: shipping options, payment methods, promotions and totals. */
  @Post('quote')
  @HttpCode(200)
  @Throttle({ default: { limit: 60, ttl: 60_000 } })
  quote(@Req() req: Request, @Body() dto: CheckoutQuoteDto, @Headers('x-cart-token') token?: string) {
    const { owner, shopper } = this.who(req, token);
    return this.checkout.quote(owner, dto, shopper);
  }

  /** Place the order. Requires an `Idempotency-Key` so a retried request never creates a second order. */
  @Post('orders')
  @ApiHeader({ name: 'Idempotency-Key', required: true })
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  place(@Req() req: Request, @Body() dto: PlaceOrderDto, @Headers('idempotency-key') key?: string, @Headers('x-cart-token') token?: string) {
    if (!key) throw AppError.badRequest('validation', { field: 'Idempotency-Key' });
    const { owner, shopper } = this.who(req, token);
    const scope = owner.userId ? `checkout:user:${owner.userId}` : `checkout:guest:${createHash('sha256').update(owner.guestToken ?? 'none').digest('hex')}`;
    return this.idempotency.run(scope, key, dto, () => this.checkout.place(owner, dto, shopper));
  }
}
