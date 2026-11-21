import { Body, Controller, Get, Global, Module, Patch } from '@nestjs/common';
import { ApiBearerAuth, ApiPropertyOptional, ApiTags } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsBoolean, IsEmail, IsOptional, Matches, MaxLength, ValidateIf } from 'class-validator';
import { Audit } from '../audit/audit.interceptor';
import { Public, RequirePermissions, StaffOnly } from '../auth/interface/decorators';
import { StorefrontRevalidator } from '../content/storefront-revalidator';
import { SettingsService } from './settings.service';

@ApiTags('store')
@Public()
@Controller('store')
export class StoreInfoController {
  constructor(private readonly settings: SettingsService) {}

  /** Store identity for the footer and invoices: names, CR and VAT numbers, contact, social links, enabled modules. */
  @Get('info')
  info() {
    return this.settings.publicStoreInfo();
  }
}

const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);

export class UpdateStorefrontSettingsDto {
  @ApiPropertyOptional({ description: 'false hides prices, the cart and checkout; products are ordered through WhatsApp.' })
  @IsOptional()
  @IsBoolean()
  showPrices?: boolean;

  @ApiPropertyOptional({ description: 'WhatsApp number in international format, e.g. +966500000000. Empty to remove.' })
  @IsOptional()
  @Transform(trim)
  @Matches(/^(\+?[0-9][0-9 ]{6,19})?$/, { message: 'whatsapp must be an international phone number, e.g. +966500000000' })
  whatsapp?: string;

  @ApiPropertyOptional({ description: 'Customer service phone shown in the footer. Empty to remove.' })
  @IsOptional()
  @Transform(trim)
  @Matches(/^(\+?[0-9][0-9 ]{6,19})?$/, { message: 'phone must be a phone number, e.g. +966500000000' })
  phone?: string;

  @ApiPropertyOptional({ description: 'Customer service email shown in the footer. Empty to remove.' })
  @IsOptional()
  @Transform(trim)
  @ValidateIf((_, v) => v !== '')
  @IsEmail()
  @MaxLength(254)
  email?: string;
}

/** Storefront presentation and contact settings, edited from the admin dashboard (Settings page). */
@ApiTags('admin')
@ApiBearerAuth()
@StaffOnly()
@Controller('admin/settings')
export class AdminSettingsController {
  constructor(
    private readonly settings: SettingsService,
    private readonly revalidator: StorefrontRevalidator,
  ) {}

  @Get('storefront')
  @RequirePermissions('settings.read')
  async storefront() {
    const [display, contact] = await Promise.all([this.settings.get('storefront.display'), this.settings.get('store.contact')]);
    return { showPrices: display.showPrices, whatsapp: contact.whatsapp, phone: contact.phone, email: contact.email };
  }

  @Patch('storefront')
  @RequirePermissions('settings.write')
  @Audit('settings.storefront.update', { entityType: 'setting' })
  async updateStorefront(@Body() dto: UpdateStorefrontSettingsDto) {
    if (dto.showPrices !== undefined) await this.settings.set('storefront.display', { showPrices: dto.showPrices });
    const contact: { whatsapp?: string; phone?: string; email?: string } = {};
    if (dto.whatsapp !== undefined) contact.whatsapp = dto.whatsapp.replace(/ /g, '');
    if (dto.phone !== undefined) contact.phone = dto.phone.replace(/ /g, '');
    if (dto.email !== undefined) contact.email = dto.email;
    if (Object.keys(contact).length) await this.settings.set('store.contact', contact);
    // The storefront caches store info, and every page that renders it: refresh them now.
    await this.revalidator.tags(['store-info']);
    return this.storefront();
  }
}

@Global()
@Module({
  controllers: [StoreInfoController, AdminSettingsController],
  providers: [SettingsService],
  exports: [SettingsService],
})
export class SettingsModule {}
