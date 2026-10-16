import { Module } from '@nestjs/common';
import { AdminConfiguratorController, ConfiguratorController, MeasurementProfilesController } from './configurator.controller';
import { ConfiguratorService } from './configurator.service';

@Module({
  controllers: [ConfiguratorController, MeasurementProfilesController, AdminConfiguratorController],
  providers: [ConfiguratorService],
  exports: [ConfiguratorService],
})
export class ConfiguratorModule {}
