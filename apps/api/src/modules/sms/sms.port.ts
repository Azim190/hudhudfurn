/** Outbound SMS port. Adapters: console (dev/test), Unifonic (production). */
export interface SmsMessage {
  to: string; // E.164
  body: string;
}

export interface SmsSendResult {
  providerRef?: string;
}

export interface SmsProvider {
  readonly name: string;
  send(message: SmsMessage): Promise<SmsSendResult>;
}

export const SMS_PROVIDER = Symbol('SMS_PROVIDER');
