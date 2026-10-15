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
  Put,
  Query,
  Res,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiBody, ApiConsumes, ApiQuery, ApiTags } from '@nestjs/swagger';
import type { Queue } from 'bullmq';
import type { Response } from 'express';
import { QUEUES } from '../../core/queue/queue.module';
import { Audit } from '../audit/audit.interceptor';
import type { AuthUser } from '../auth/auth.types';
import { CurrentUser, RequirePermissions } from '../auth/interface/decorators';
import {
  AdminProductQueryDto,
  GenerateVariantsDto,
  LocationDto,
  ProductDto,
  ProductMediaDto,
  ProductRelationsDto,
  SetStockDto,
  UpdateLocationDto,
  UpdateProductDto,
  UpdateVariantDto,
} from './catalog.dto';
import { ImportExportService } from './import-export.service';
import { InventoryService } from './inventory.service';
import { ProductService } from './product.service';

@ApiTags('admin: products & inventory')
@ApiBearerAuth()
@Controller('admin')
export class AdminProductsController {
  constructor(
    private readonly products: ProductService,
    private readonly inventory: InventoryService,
    private readonly io: ImportExportService,
    @InjectQueue(QUEUES.search) private readonly searchQueue: Queue,
  ) {}

  @Get('products')
  @RequirePermissions('catalog.product.read')
  list(@Query() q: AdminProductQueryDto) {
    return this.products.list(q);
  }

  @Get('products/export')
  @RequirePermissions('catalog.product.import')
  @ApiQuery({ name: 'format', enum: ['xlsx', 'csv'], required: false })
  async export(@Query('format') format: string, @Res() res: Response) {
    const fmt = format === 'csv' ? 'csv' : 'xlsx';
    const body = await this.io.export(fmt);
    const stamp = new Date().toISOString().slice(0, 10);
    res.setHeader('Content-Type', fmt === 'csv' ? 'text/csv; charset=utf-8' : 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="products-${stamp}.${fmt}"`);
    res.send(body);
  }

  @Post('products/import')
  @RequirePermissions('catalog.product.import')
  @ApiConsumes('multipart/form-data')
  @ApiBody({ schema: { type: 'object', properties: { file: { type: 'string', format: 'binary' } } } })
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 20 * 1024 * 1024, files: 1 } }))
  @Audit('product.import', { entityType: 'job' })
  import(@UploadedFile() file: { buffer: Buffer; originalname: string }, @CurrentUser() user: AuthUser) {
    return this.io.enqueueImport(file, user.id);
  }

  @Get('jobs/:id')
  @RequirePermissions('catalog.product.import')
  job(@Param('id', ParseUUIDPipe) id: string) {
    return this.io.getJob(id);
  }

  @Post('search/reindex')
  @RequirePermissions('settings.write')
  @Audit('search.reindex')
  async reindex() {
    const job = await this.searchQueue.add('reindex', { all: true }, { jobId: `reindex-${Date.now()}` });
    return { queued: true, jobId: job.id };
  }

  @Get('products/:id')
  @RequirePermissions('catalog.product.read')
  get(@Param('id', ParseUUIDPipe) id: string) {
    return this.products.get(id);
  }

  @Post('products')
  @RequirePermissions('catalog.product.write')
  @Audit('product.create', { entityType: 'product' })
  create(@Body() dto: ProductDto) {
    return this.products.create(dto);
  }

  @Patch('products/:id')
  @RequirePermissions('catalog.product.write')
  @Audit('product.update', { entityType: 'product', idParam: 'id' })
  update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateProductDto) {
    return this.products.update(id, dto);
  }

  @Post('products/:id/publish')
  @RequirePermissions('catalog.product.publish')
  @Audit('product.publish', { entityType: 'product', idParam: 'id' })
  publish(@Param('id', ParseUUIDPipe) id: string) {
    return this.products.publish(id);
  }

  @Post('products/:id/unpublish')
  @RequirePermissions('catalog.product.publish')
  @Audit('product.unpublish', { entityType: 'product', idParam: 'id' })
  unpublish(@Param('id', ParseUUIDPipe) id: string) {
    return this.products.unpublish(id, 'DRAFT');
  }

  @Post('products/:id/archive')
  @RequirePermissions('catalog.product.publish')
  @Audit('product.archive', { entityType: 'product', idParam: 'id' })
  archive(@Param('id', ParseUUIDPipe) id: string) {
    return this.products.unpublish(id, 'ARCHIVED');
  }

  @Delete('products/:id')
  @HttpCode(204)
  @RequirePermissions('catalog.product.write')
  @Audit('product.delete', { entityType: 'product', idParam: 'id' })
  remove(@Param('id', ParseUUIDPipe) id: string) {
    return this.products.remove(id);
  }

  @Post('products/:id/variants/generate')
  @RequirePermissions('catalog.product.write')
  @Audit('product.variants.generate', { entityType: 'product', idParam: 'id' })
  generate(@Param('id', ParseUUIDPipe) id: string, @Body() dto: GenerateVariantsDto) {
    return this.products.generateVariants(id, dto);
  }

  @Patch('variants/:id')
  @RequirePermissions('catalog.product.write')
  @Audit('variant.update', { entityType: 'variant', idParam: 'id' })
  updateVariant(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateVariantDto) {
    return this.products.updateVariant(id, dto);
  }

  @Put('products/:id/media')
  @RequirePermissions('catalog.media.write')
  @Audit('product.media', { entityType: 'product', idParam: 'id' })
  setMedia(@Param('id', ParseUUIDPipe) id: string, @Body() dto: ProductMediaDto) {
    return this.products.setMedia(id, dto);
  }

  @Put('products/:id/relations')
  @RequirePermissions('catalog.product.write')
  @Audit('product.relations', { entityType: 'product', idParam: 'id' })
  setRelations(@Param('id', ParseUUIDPipe) id: string, @Body() dto: ProductRelationsDto) {
    return this.products.setRelations(id, dto);
  }

  // ───── Inventory ─────
  @Get('locations')
  @RequirePermissions('inventory.read')
  locations() {
    return this.inventory.locations();
  }

  @Post('locations')
  @RequirePermissions('inventory.adjust')
  @Audit('location.create', { entityType: 'location' })
  createLocation(@Body() dto: LocationDto) {
    return this.inventory.createLocation(dto);
  }

  @Patch('locations/:id')
  @RequirePermissions('inventory.adjust')
  @Audit('location.update', { entityType: 'location', idParam: 'id' })
  updateLocation(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateLocationDto) {
    return this.inventory.updateLocation(id, dto);
  }

  @Put('variants/:id/stock')
  @RequirePermissions('inventory.adjust')
  @Audit('stock.set', { entityType: 'variant', idParam: 'id' })
  setStock(@Param('id', ParseUUIDPipe) id: string, @Body() dto: SetStockDto, @CurrentUser() user: AuthUser) {
    return this.inventory.setStock(id, dto, user.id);
  }

  @Get('variants/:id/movements')
  @RequirePermissions('inventory.read')
  movements(@Param('id', ParseUUIDPipe) id: string) {
    return this.inventory.movements(id);
  }
}
