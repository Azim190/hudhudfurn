import { Module } from '@nestjs/common';
import { MediaModule } from '../media/media.module';
import { CartController } from './cart.controller';
import { CartService } from './cart.service';

@Module({
  imports: [MediaModule],
  controllers: [CartController],
  providers: [CartService],
  exports: [CartService],
})
export class CartModule {}
