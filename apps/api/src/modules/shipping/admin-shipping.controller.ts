import { Body, Controller, Delete, Get, HttpCode, Param, ParseUUIDPipe, Patch, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Audit } from '../audit/audit.interceptor';
import { RequirePermissions } from '../auth/interface/decorators';
import { ShippingRateDto, ShippingZoneDto, UpdateShippingRateDto, UpdateShippingZoneDto } from './shipping.dto';
import { ShippingService } from './shipping.service';

@ApiTags('admin: shipping')
@ApiBearerAuth()
@Controller('admin/shipping')
export class AdminShippingController {
  constructor(private readonly shipping: ShippingService) {}

  @Get('zones')
  @RequirePermissions('settings.read')
  zones() {
    return this.shipping.listZones();
  }

  @Post('zones')
  @RequirePermissions('settings.write')
  @Audit('shipping.zone.create', { entityType: 'shippingZone' })
  createZone(@Body() dto: ShippingZoneDto) {
    return this.shipping.createZone(dto);
  }

  @Patch('zones/:id')
  @RequirePermissions('settings.write')
  @Audit('shipping.zone.update', { entityType: 'shippingZone', idParam: 'id' })
  updateZone(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateShippingZoneDto) {
    return this.shipping.updateZone(id, dto);
  }

  @Delete('zones/:id')
  @HttpCode(204)
  @RequirePermissions('settings.write')
  @Audit('shipping.zone.delete', { entityType: 'shippingZone', idParam: 'id' })
  deleteZone(@Param('id', ParseUUIDPipe) id: string) {
    return this.shipping.deleteZone(id);
  }

  @Post('zones/:id/rates')
  @RequirePermissions('settings.write')
  @Audit('shipping.rate.create', { entityType: 'shippingRate' })
  createRate(@Param('id', ParseUUIDPipe) zoneId: string, @Body() dto: ShippingRateDto) {
    return this.shipping.createRate(zoneId, dto);
  }

  @Patch('rates/:id')
  @RequirePermissions('settings.write')
  @Audit('shipping.rate.update', { entityType: 'shippingRate', idParam: 'id' })
  updateRate(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateShippingRateDto) {
    return this.shipping.updateRate(id, dto);
  }

  @Delete('rates/:id')
  @HttpCode(204)
  @RequirePermissions('settings.write')
  @Audit('shipping.rate.delete', { entityType: 'shippingRate', idParam: 'id' })
  deleteRate(@Param('id', ParseUUIDPipe) id: string) {
    return this.shipping.deleteRate(id);
  }
}
