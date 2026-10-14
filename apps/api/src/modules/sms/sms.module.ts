import { Module } from '@nestjs/common';
import { AppConfig } from '../../core/config/app-config.service';
import { ConsoleSmsProvider, UnifonicSmsProvider } from './providers';
import { SMS_PROVIDER } from './sms.port';

@Module({
  providers: [
    ConsoleSmsProvider,
    UnifonicSmsProvider,
    {
      provide: SMS_PROVIDER,
      inject: [AppConfig, ConsoleSmsProvider, UnifonicSmsProvider],
      useFactory: (config: AppConfig, console: ConsoleSmsProvider, unifonic: UnifonicSmsProvider) =>
        config.get('SMS_PROVIDER') === 'unifonic' ? unifonic : console,
    },
  ],
  exports: [SMS_PROVIDER],
})
export class SmsModule {}
