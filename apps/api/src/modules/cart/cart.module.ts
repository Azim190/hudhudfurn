import { Module } from '@nestjs/common';
import { ConfiguratorModule } from '../configurator/configurator.module';
import { MediaModule } from '../media/media.module';
import { CartController } from './cart.controller';
import { CartService } from './cart.service';

@Module({
  imports: [MediaModule, ConfiguratorModule],
  controllers: [CartController],
  providers: [CartService],
  exports: [CartService],
})
export class CartModule {}
