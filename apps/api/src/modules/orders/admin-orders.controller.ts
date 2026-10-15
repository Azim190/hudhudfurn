import { Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Audit } from '../audit/audit.interceptor';
import type { AuthUser } from '../auth/auth.types';
import { CurrentUser, RequirePermissions } from '../auth/interface/decorators';
import { OrderPaymentsService } from './order-payments.service';
import { AdminOrderQueryDto, CancelOrderDto, OrderTransitionDto } from './orders.dto';
import { OrdersService } from './orders.service';

@ApiTags('admin: orders')
@ApiBearerAuth()
@Controller('admin/orders')
export class AdminOrdersController {
  constructor(
    private readonly orders: OrdersService,
    private readonly payments: OrderPaymentsService,
  ) {}

  @Get()
  @RequirePermissions('orders.read')
  list(@Query() q: AdminOrderQueryDto) {
    return this.orders.adminList(q);
  }

  @Get(':id')
  @RequirePermissions('orders.read')
  get(@Param('id', ParseUUIDPipe) id: string) {
    return this.orders.adminGet(id);
  }

  @Post(':id/status')
  @HttpCode(200)
  @RequirePermissions('orders.update')
  @Audit('order.status', { entityType: 'order', idParam: 'id' })
  async transition(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body() dto: OrderTransitionDto) {
    await this.orders.transition(id, dto.status, user.id, dto.note);
    return this.orders.adminGet(id);
  }

  /** Cancels the order, releases or restocks inventory, refunds the payment and issues a credit note. */
  @Post(':id/cancel')
  @HttpCode(200)
  @RequirePermissions('orders.cancel', 'orders.refund')
  @Audit('order.cancel', { entityType: 'order', idParam: 'id' })
  async cancel(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body() dto: CancelOrderDto) {
    await this.orders.cancel(id, { reason: dto.reason, actorId: user.id });
    return this.orders.adminGet(id);
  }

  /** Re-check the payment with the gateway (e.g. after a delayed webhook). */
  @Post(':id/payment/sync')
  @HttpCode(200)
  @RequirePermissions('orders.update')
  async sync(@Param('id', ParseUUIDPipe) id: string) {
    await this.payments.syncOrder(id);
    return this.orders.adminGet(id);
  }
}
