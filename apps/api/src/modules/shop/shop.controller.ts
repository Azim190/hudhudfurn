import { BadRequestException, Body, Controller, Delete, Get, Header, Param, ParseUUIDPipe, Post, Put, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import type { Locale } from '@hudhud/i18n';
import { ArrayMaxSize, IsArray, IsUUID } from 'class-validator';
import { PageQueryDto } from '../../core/http/page-query.dto';
import { RequestLocale } from '../../core/i18n/request-locale';
import type { AuthUser } from '../auth/auth.types';
import { CurrentUser, Public } from '../auth/interface/decorators';
import { ShopService } from './shop.service';

class WishlistDto {
  @IsArray() @ArrayMaxSize(100) @IsUUID('all', { each: true }) productIds: string[];
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

@ApiTags('shop')
@Controller()
export class ShopController {
  constructor(private readonly shop: ShopService) {}

  @Public()
  @Get('products-cards')
  @Header('Cache-Control', 'public, max-age=60, s-maxage=300')
  cards(@Query('ids') ids = '') {
    const list = String(ids).split(',').filter(Boolean);
    if (list.length > 24 || list.some((id) => !UUID.test(id))) throw new BadRequestException({ message: ['ids must be up to 24 uuids'] });
    return this.shop.cards(list);
  }

  @Public()
  @Get('delivery-estimate')
  estimate(@Query('city') city = '', @Query('productId') productId?: string) {
    if (!/^[\w-]{2,36}$/.test(String(city))) throw new BadRequestException({ message: ['city is required'] });
    if (productId && !UUID.test(productId)) throw new BadRequestException({ message: ['invalid productId'] });
    return this.shop.deliveryEstimate(String(city), productId);
  }

  @Public()
  @Get('products/:id/reviews')
  @Header('Cache-Control', 'public, max-age=60, s-maxage=300')
  reviews(@Param('id', ParseUUIDPipe) id: string, @Query() q: PageQueryDto) {
    return this.shop.reviews(id, q.page, Math.min(q.limit, 20));
  }

  @ApiBearerAuth()
  @Post('variants/:id/notify-me')
  notify(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string, @RequestLocale() locale: Locale) {
    return this.shop.notifyWhenAvailable(user.id, id, locale);
  }

  @ApiBearerAuth()
  @Get('me/wishlist')
  wishlist(@CurrentUser() user: AuthUser) {
    return this.shop.wishlist(user.id);
  }

  @ApiBearerAuth()
  @Get('me/wishlist/ids')
  wishlistIds(@CurrentUser() user: AuthUser) {
    return this.shop.wishlistIds(user.id);
  }

  /** Add one or more products (also used to merge a guest's local wishlist after sign-in). */
  @ApiBearerAuth()
  @Put('me/wishlist')
  add(@CurrentUser() user: AuthUser, @Body() dto: WishlistDto) {
    return this.shop.addToWishlist(user.id, dto.productIds);
  }

  @ApiBearerAuth()
  @Delete('me/wishlist/:productId')
  remove(@CurrentUser() user: AuthUser, @Param('productId', ParseUUIDPipe) productId: string) {
    return this.shop.removeFromWishlist(user.id, productId);
  }
}
