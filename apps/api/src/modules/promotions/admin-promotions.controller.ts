import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Audit } from '../audit/audit.interceptor';
import { RequirePermissions } from '../auth/interface/decorators';
import { CouponDto, CouponStateDto, PromotionDto, PromotionListQueryDto, UpdatePromotionDto } from './promotions.dto';
import { PromotionsService } from './promotions.service';

@ApiTags('admin: promotions')
@ApiBearerAuth()
@Controller('admin/promotions')
export class AdminPromotionsController {
  constructor(private readonly promotions: PromotionsService) {}

  @Get()
  @RequirePermissions('marketing.read')
  list(@Query() q: PromotionListQueryDto) {
    return this.promotions.list(q);
  }

  @Get(':id')
  @RequirePermissions('marketing.read')
  get(@Param('id', ParseUUIDPipe) id: string) {
    return this.promotions.get(id);
  }

  @Post()
  @RequirePermissions('marketing.write')
  @Audit('promotion.create', { entityType: 'promotion' })
  create(@Body() dto: PromotionDto) {
    return this.promotions.create(dto);
  }

  @Patch(':id')
  @RequirePermissions('marketing.write')
  @Audit('promotion.update', { entityType: 'promotion', idParam: 'id' })
  update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdatePromotionDto) {
    return this.promotions.update(id, dto);
  }

  @Post(':id/coupons')
  @RequirePermissions('marketing.write')
  @Audit('coupon.create', { entityType: 'promotion', idParam: 'id' })
  addCoupon(@Param('id', ParseUUIDPipe) id: string, @Body() dto: CouponDto) {
    return this.promotions.addCoupon(id, dto);
  }

  @Patch('coupons/:id')
  @RequirePermissions('marketing.write')
  @Audit('coupon.update', { entityType: 'coupon', idParam: 'id' })
  setCoupon(@Param('id', ParseUUIDPipe) id: string, @Body() dto: CouponStateDto) {
    return this.promotions.setCouponActive(id, dto.isActive);
  }
}
