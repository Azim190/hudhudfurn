import { Module } from '@nestjs/common';
import { MediaModule } from '../media/media.module';
import { SearchModule } from '../search/search.module';
import { AdminCatalogController } from './admin-catalog.controller';
import { AdminProductsController } from './admin-products.controller';
import { AttributeService } from './attribute.service';
import { CatalogPublicService } from './catalog-public.service';
import { CategoryService } from './category.service';
import { ImportExportService, ImportProcessor } from './import-export.service';
import { InventoryService } from './inventory.service';
import { MerchandisingService } from './merchandising.service';
import { ProductService } from './product.service';
import { PublicCatalogController } from './public-catalog.controller';

const workersEnabled = process.env.WORKERS_ENABLED !== 'false';

@Module({
  imports: [MediaModule, SearchModule],
  controllers: [PublicCatalogController, AdminCatalogController, AdminProductsController],
  providers: [
    CategoryService,
    AttributeService,
    ProductService,
    InventoryService,
    MerchandisingService,
    CatalogPublicService,
    ImportExportService,
    ...(workersEnabled ? [ImportProcessor] : []),
  ],
  exports: [ProductService, CategoryService, InventoryService],
})
export class CatalogModule {}
