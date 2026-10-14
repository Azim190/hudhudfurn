import { Module } from '@nestjs/common';
import { GeoController } from './geo.controller';
import { MeController } from './me.controller';
import { UsersService } from './users.service';

@Module({
  controllers: [MeController, GeoController],
  providers: [UsersService],
  exports: [UsersService],
})
export class UsersModule {}
