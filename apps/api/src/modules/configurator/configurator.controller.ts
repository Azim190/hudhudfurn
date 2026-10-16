import { Body, Controller, Delete, Get, HttpCode, Param, ParseUUIDPipe, Patch, Post, Req, Res, UploadedFile, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiConsumes, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import type { Request, Response } from 'express';
import { AppError } from '../../core/errors/app-error';
import { Audit } from '../audit/audit.interceptor';
import type { AuthUser } from '../auth/auth.types';
import { CurrentUser, Public, RequirePermissions } from '../auth/interface/decorators';
import {
  HeadingStyleDto,
  MeasurementProfileDto,
  OptionDto,
  QuoteDto,
  SimulateDto,
  TemplateDto,
  UpdateHeadingStyleDto,
  UpdateMeasurementProfileDto,
  UpdateOptionDto,
  UpdateTemplateDto,
} from './configurator.dto';
import type { UploadedImage } from '../media/media.service';
import { ConfiguratorService } from './configurator.service';

@ApiTags('configurator')
@Public()
@Controller('configurator')
export class ConfiguratorController {
  constructor(private readonly configurator: ConfiguratorService) {}

  @Get('products/:productId')
  forProduct(@Param('productId', ParseUUIDPipe) productId: string) {
    return this.configurator.forProduct(productId);
  }

  /** Live price for the configurator; nothing is stored. */
  @Post('quote')
  @HttpCode(200)
  @Throttle({ default: { limit: 120, ttl: 60_000 } })
  quote(@Body() dto: QuoteDto) {
    return this.configurator.quote(dto.productId, dto.variantId, dto.inputs);
  }

  /** Customer photos (sofa covers). Stored privately; only staff can view them. */
  @Post('uploads')
  @ApiConsumes('multipart/form-data')
  @Throttle({ default: { limit: 20, ttl: 600_000 } })
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 12 * 1024 * 1024, files: 1 } }))
  upload(@UploadedFile() file: UploadedImage | undefined, @Req() req: Request) {
    return this.configurator.upload(file, req.user?.kind === 'CUSTOMER' ? req.user.id : undefined);
  }
}

@ApiTags('me')
@ApiBearerAuth()
@Controller('me/measurement-profiles')
export class MeasurementProfilesController {
  constructor(private readonly configurator: ConfiguratorService) {}

  private customer(user: AuthUser) {
    if (user.kind !== 'CUSTOMER') throw AppError.forbidden();
    return user.id;
  }

  @Get()
  list(@CurrentUser() user: AuthUser) {
    return this.configurator.listProfiles(this.customer(user));
  }

  @Post()
  create(@CurrentUser() user: AuthUser, @Body() dto: MeasurementProfileDto) {
    return this.configurator.createProfile(this.customer(user), dto);
  }

  @Patch(':id')
  update(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateMeasurementProfileDto) {
    return this.configurator.updateProfile(this.customer(user), id, dto);
  }

  @Delete(':id')
  @HttpCode(204)
  remove(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.configurator.deleteProfile(this.customer(user), id);
  }
}

@ApiTags('admin: configurator')
@ApiBearerAuth()
@Controller('admin/configurator')
export class AdminConfiguratorController {
  constructor(private readonly configurator: ConfiguratorService) {}

  @Get('templates')
  @RequirePermissions('settings.read')
  list() {
    return this.configurator.listTemplates();
  }

  @Get('templates/:id')
  @RequirePermissions('settings.read')
  get(@Param('id', ParseUUIDPipe) id: string) {
    return this.configurator.getTemplate(id);
  }

  @Post('templates')
  @RequirePermissions('settings.configurator')
  @Audit('configurator.template.create', { entityType: 'configuratorTemplate' })
  create(@Body() dto: TemplateDto) {
    return this.configurator.createTemplate(dto);
  }

  @Patch('templates/:id')
  @RequirePermissions('settings.configurator')
  @Audit('configurator.template.update', { entityType: 'configuratorTemplate', idParam: 'id' })
  update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateTemplateDto) {
    return this.configurator.updateTemplate(id, dto);
  }

  @Post('templates/:id/heading-styles')
  @RequirePermissions('settings.configurator')
  @Audit('configurator.heading.create', { entityType: 'configuratorTemplate', idParam: 'id' })
  addHeading(@Param('id', ParseUUIDPipe) id: string, @Body() dto: HeadingStyleDto) {
    return this.configurator.addHeadingStyle(id, dto);
  }

  @Patch('heading-styles/:id')
  @RequirePermissions('settings.configurator')
  @Audit('configurator.heading.update', { entityType: 'headingStyle', idParam: 'id' })
  updateHeading(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateHeadingStyleDto) {
    return this.configurator.updateHeadingStyle(id, dto);
  }

  @Post('templates/:id/options')
  @RequirePermissions('settings.configurator')
  @Audit('configurator.option.create', { entityType: 'configuratorTemplate', idParam: 'id' })
  addOption(@Param('id', ParseUUIDPipe) id: string, @Body() dto: OptionDto) {
    return this.configurator.addOption(id, dto);
  }

  @Patch('options/:id')
  @RequirePermissions('settings.configurator')
  @Audit('configurator.option.update', { entityType: 'configuratorOption', idParam: 'id' })
  updateOption(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateOptionDto) {
    return this.configurator.updateOption(id, dto);
  }

  @Post('templates/:id/simulate')
  @HttpCode(200)
  @RequirePermissions('settings.read')
  simulate(@Param('id', ParseUUIDPipe) id: string, @Body() dto: SimulateDto) {
    return this.configurator.simulate(id, dto.inputs, dto.basePrice, dto.fabricWidthMm);
  }

  /** Customer photo attached to a configuration (workshop reference). */
  @Get('uploads/:id')
  @RequirePermissions('orders.read')
  async uploadContent(@Param('id', ParseUUIDPipe) id: string, @Res() res: Response) {
    const { body, contentType } = await this.configurator.uploadContent(id);
    res.setHeader('Content-Type', contentType);
    res.setHeader('Cache-Control', 'private, no-store');
    res.send(body);
  }
}
