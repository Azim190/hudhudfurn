import { Body, Controller, Delete, Get, Global, Header, HttpCode, Module, Param, ParseUUIDPipe, Patch, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Audit } from '../audit/audit.interceptor';
import { Public, RequirePermissions } from '../auth/interface/decorators';
import { CatalogModule } from '../catalog/catalog.module';
import { MediaModule } from '../media/media.module';
import { BannerDto, UpdateBannerDto } from './content.dto';
import { ContentService } from './content.service';
import { StorefrontRevalidator } from './storefront-revalidator';

@ApiTags('content')
@Controller()
export class ContentController {
  constructor(private readonly content: ContentService) {}

  @Public()
  @Get('content/home')
  @Header('Cache-Control', 'public, max-age=60, s-maxage=300')
  home() {
    return this.content.home();
  }

  @ApiBearerAuth()
  @Get('admin/banners')
  @RequirePermissions('marketing.read')
  list() {
    return this.content.list();
  }

  @ApiBearerAuth()
  @Post('admin/banners')
  @RequirePermissions('marketing.write')
  @Audit('banner.create', { entityType: 'banner' })
  create(@Body() dto: BannerDto) {
    return this.content.create(dto);
  }

  @ApiBearerAuth()
  @Patch('admin/banners/:id')
  @RequirePermissions('marketing.write')
  @Audit('banner.update', { entityType: 'banner', idParam: 'id' })
  update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateBannerDto) {
    return this.content.update(id, dto);
  }

  @ApiBearerAuth()
  @Delete('admin/banners/:id')
  @HttpCode(204)
  @RequirePermissions('marketing.write')
  @Audit('banner.delete', { entityType: 'banner', idParam: 'id' })
  remove(@Param('id', ParseUUIDPipe) id: string) {
    return this.content.remove(id);
  }
}

@Global()
@Module({ providers: [StorefrontRevalidator], exports: [StorefrontRevalidator] })
export class RevalidationModule {}

@Module({
  imports: [MediaModule, CatalogModule],
  controllers: [ContentController],
  providers: [ContentService],
})
export class ContentModule {}
