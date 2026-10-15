import { Body, Controller, Get, Headers, HttpCode, Param, ParseUUIDPipe, Post, Query, Req } from '@nestjs/common';
import { ApiBearerAuth, ApiHeader, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import type { Request } from 'express';
import { AppError } from '../../core/errors/app-error';
import { PageQueryDto } from '../../core/http/page-query.dto';
import type { AuthUser } from '../auth/auth.types';
import { CurrentUser, Public } from '../auth/interface/decorators';
import { InvoicingService } from '../invoicing/invoicing.service';
import { OrderPaymentsService } from './order-payments.service';
import { CustomerCancelDto } from './orders.dto';
import { OrdersService, type OrderViewer } from './orders.service';

/**
 * Order pages for the customer who placed the order: signed-in customers by account, guests by
 * the `X-Order-Token` returned at checkout.
 */
@ApiTags('orders')
@ApiHeader({ name: 'X-Order-Token', required: false, description: 'Guest order access token' })
@Public()
@Controller('orders')
export class OrdersController {
  constructor(
    private readonly orders: OrdersService,
    private readonly payments: OrderPaymentsService,
    private readonly invoicing: InvoicingService,
  ) {}

  private viewer(req: Request, token?: string): OrderViewer {
    return { userId: req.user?.kind === 'CUSTOMER' ? req.user.id : undefined, accessToken: token && token.length <= 100 ? token : undefined };
  }

  @Get(':id')
  async get(@Req() req: Request, @Param('id', ParseUUIDPipe) id: string, @Headers('x-order-token') token?: string) {
    return this.orders.present(await this.orders.findForViewer(id, this.viewer(req, token)));
  }

  /** Called from the payment return page: verifies the payment with the gateway, then returns the order. */
  @Post(':id/verify')
  @HttpCode(200)
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  async verify(@Req() req: Request, @Param('id', ParseUUIDPipe) id: string, @Headers('x-order-token') token?: string) {
    const viewer = this.viewer(req, token);
    await this.orders.findForViewer(id, viewer);
    await this.payments.syncOrder(id);
    return this.orders.present(await this.orders.findForViewer(id, viewer));
  }

  /** Open a new payment session for an unpaid order (after a failed or abandoned attempt). */
  @Post(':id/pay')
  @HttpCode(200)
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  async pay(@Req() req: Request, @Param('id', ParseUUIDPipe) id: string, @Headers('x-order-token') token?: string) {
    await this.orders.findForViewer(id, this.viewer(req, token));
    const { redirectUrl } = await this.payments.start(id);
    return { redirectUrl };
  }

  @Post(':id/cancel')
  @HttpCode(200)
  async cancel(@Req() req: Request, @Param('id', ParseUUIDPipe) id: string, @Body() dto: CustomerCancelDto, @Headers('x-order-token') token?: string) {
    const viewer = this.viewer(req, token);
    await this.orders.findForViewer(id, viewer);
    await this.orders.cancel(id, { reason: dto.reason?.trim() || 'Cancelled by customer', byCustomer: true });
    return this.orders.present(await this.orders.findForViewer(id, viewer));
  }

  @Get(':id/invoices/:invoiceId')
  async invoice(@Req() req: Request, @Param('id', ParseUUIDPipe) id: string, @Param('invoiceId', ParseUUIDPipe) invoiceId: string, @Headers('x-order-token') token?: string) {
    await this.orders.findForViewer(id, this.viewer(req, token));
    const inv = await this.invoicing.get(invoiceId);
    if (inv.orderId !== id) throw AppError.notFound({ entity: 'invoice' });
    return this.invoicing.present(inv);
  }
}

@ApiTags('me')
@ApiBearerAuth()
@Controller('me/orders')
export class MyOrdersController {
  constructor(private readonly orders: OrdersService) {}

  @Get()
  list(@CurrentUser() user: AuthUser, @Query() q: PageQueryDto) {
    if (user.kind !== 'CUSTOMER') throw AppError.forbidden();
    return this.orders.listForCustomer(user.id, q.page, q.limit);
  }
}
