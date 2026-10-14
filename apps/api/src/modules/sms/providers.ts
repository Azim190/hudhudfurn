import { Injectable, Logger } from '@nestjs/common';
import { maskPhone } from '@hudhud/domain';
import { AppConfig } from '../../core/config/app-config.service';
import type { SmsMessage, SmsProvider, SmsSendResult } from './sms.port';

/** Development adapter: prints messages to the log instead of sending them. Refused in production. */
@Injectable()
export class ConsoleSmsProvider implements SmsProvider {
  readonly name = 'console';
  private readonly logger = new Logger('SMS');

  async send(message: SmsMessage): Promise<SmsSendResult> {
    this.logger.log(`[dev SMS] to ${message.to}: ${message.body}`);
    return {};
  }
}

/** Unifonic REST adapter (https://docs.unifonic.com). */
@Injectable()
export class UnifonicSmsProvider implements SmsProvider {
  readonly name = 'unifonic';
  private readonly logger = new Logger('UnifonicSms');

  constructor(private readonly config: AppConfig) {}

  async send(message: SmsMessage): Promise<SmsSendResult> {
    const body = new URLSearchParams({
      AppSid: this.config.get('UNIFONIC_APP_SID') ?? '',
      SenderID: this.config.get('UNIFONIC_SENDER_ID') ?? '',
      Recipient: message.to.replace(/^\+/, ''),
      Body: message.body,
      responseType: 'JSON',
    });
    const res = await fetch(`${this.config.get('UNIFONIC_BASE_URL')}/rest/SMS/messages`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body,
      signal: AbortSignal.timeout(10_000),
    });
    const json = (await res.json().catch(() => ({}))) as {
      success?: boolean | string;
      data?: { MessageID?: string | number };
      message?: string;
    };
    if (!res.ok || String(json.success) !== 'true') {
      this.logger.error(`Unifonic send failed to ${maskPhone(message.to)}: ${res.status} ${json.message ?? ''}`);
      throw new Error(`SMS delivery failed (${res.status})`);
    }
    return { providerRef: json.data?.MessageID === undefined ? undefined : String(json.data.MessageID) };
  }
}
