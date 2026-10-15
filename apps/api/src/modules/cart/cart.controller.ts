import { Body, Controller, Delete, Get, Headers, HttpCode, Param, ParseUUIDPipe, Patch, Post, Req } from '@nestjs/common';
import { ApiHeader, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import type { Request } from 'express';
import { AppError } from '../../core/errors/app-error';
import type { AuthUser } from '../auth/auth.types';
import { CurrentUser, Public } from '../auth/interface/decorators';
import { AddCartItemDto, MergeCartDto, UpdateCartItemDto } from './cart.dto';
import { CartService, type CartOwner } from './cart.service';

const TOKEN = /^[\w-]{20,100}$/;

/**
 * Cart for guests (opaque `X-Cart-Token`, returned once as `cartToken` when the cart is created)
 * and for signed-in customers (resolved from the access token).
 */
@ApiTags('cart')
@ApiHeader({ name: 'X-Cart-Token', required: false, description: 'Guest cart token' })
@Public()
@Controller('cart')
export class CartController {
  constructor(private readonly carts: CartService) {}

  private owner(req: Request, token?: string): CartOwner {
    if (req.user) return { userId: req.user.id };
    return token && TOKEN.test(token) ? { guestToken: token } : {};
  }

  @Get()
  view(@Req() req: Request, @Headers('x-cart-token') token?: string) {
    return this.carts.view(this.owner(req, token));
  }

  @Get('count')
  async count(@Req() req: Request, @Headers('x-cart-token') token?: string) {
    return { count: await this.carts.count(this.owner(req, token)) };
  }

  @Post('items')
  @Throttle({ default: { limit: 60, ttl: 60_000 } })
  add(@Req() req: Request, @Body() dto: AddCartItemDto, @Headers('x-cart-token') token?: string) {
    return this.carts.addItem(this.owner(req, token), dto);
  }

  @Patch('items/:id')
  update(@Req() req: Request, @Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateCartItemDto, @Headers('x-cart-token') token?: string) {
    return this.carts.updateItem(this.owner(req, token), id, dto);
  }

  @Delete('items/:id')
  @HttpCode(200)
  remove(@Req() req: Request, @Param('id', ParseUUIDPipe) id: string, @Headers('x-cart-token') token?: string) {
    return this.carts.removeItem(this.owner(req, token), id);
  }

  /** Called right after sign-in with the guest cart token the client was holding. */
  @Post('merge')
  @HttpCode(200)
  merge(@CurrentUser() user: AuthUser | undefined, @Body() dto: MergeCartDto) {
    if (!user) throw AppError.unauthorized();
    if (!TOKEN.test(dto.guestToken)) throw AppError.badRequest('validation', { field: 'guestToken' });
    return this.carts.merge(user.id, dto.guestToken);
  }
}
