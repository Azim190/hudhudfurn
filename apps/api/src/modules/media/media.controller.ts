import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiBody, ApiConsumes, ApiTags } from '@nestjs/swagger';
import { IsOptional, IsString, MaxLength } from 'class-validator';
import { PageQueryDto } from '../../core/http/page-query.dto';
import { Audit } from '../audit/audit.interceptor';
import type { AuthUser } from '../auth/auth.types';
import { CurrentUser, RequirePermissions } from '../auth/interface/decorators';
import { MediaService, type UploadedImage } from './media.service';

export class MediaAltDto {
  @IsOptional() @IsString() @MaxLength(200) altAr?: string;
  @IsOptional() @IsString() @MaxLength(200) altEn?: string;
}

/** Hard cap at the HTTP layer; the configurable MAX_UPLOAD_MB is enforced by the service. */
const UPLOAD_HARD_LIMIT_BYTES = 50 * 1024 * 1024;

@ApiTags('admin: media')
@ApiBearerAuth()
@Controller('admin/media')
export class MediaController {
  constructor(private readonly media: MediaService) {}

  @Post()
  @RequirePermissions('catalog.media.write')
  @ApiConsumes('multipart/form-data')
  @ApiBody({ schema: { type: 'object', properties: { file: { type: 'string', format: 'binary' }, altAr: { type: 'string' }, altEn: { type: 'string' } } } })
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: UPLOAD_HARD_LIMIT_BYTES, files: 1 } }))
  @Audit('media.upload', { entityType: 'media' })
  upload(@UploadedFile() file: UploadedImage, @Body() alt: MediaAltDto, @CurrentUser() user: AuthUser) {
    return this.media.upload(file, user.id, alt);
  }

  @Get()
  @RequirePermissions('catalog.product.read')
  list(@Query() q: PageQueryDto) {
    return this.media.list(q.page, q.limit);
  }

  @Patch(':id')
  @RequirePermissions('catalog.media.write')
  updateAlt(@Param('id', ParseUUIDPipe) id: string, @Body() dto: MediaAltDto) {
    return this.media.updateAlt(id, dto);
  }

  @Delete(':id')
  @HttpCode(204)
  @RequirePermissions('catalog.media.write')
  @Audit('media.delete', { entityType: 'media', idParam: 'id' })
  remove(@Param('id', ParseUUIDPipe) id: string) {
    return this.media.remove(id);
  }
}
