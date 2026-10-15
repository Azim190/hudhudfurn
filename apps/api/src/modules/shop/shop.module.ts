import { Module } from '@nestjs/common';
import { MediaModule } from '../media/media.module';
import { ShopController } from './shop.controller';
import { ShopService } from './shop.service';

@Module({
  imports: [MediaModule],
  controllers: [ShopController],
  providers: [ShopService],
})
export class ShopModule {}
