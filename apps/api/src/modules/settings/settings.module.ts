import { Controller, Get, Global, Module } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Public } from '../auth/interface/decorators';
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

@Global()
@Module({
  controllers: [StoreInfoController],
  providers: [SettingsService],
  exports: [SettingsService],
})
export class SettingsModule {}
