import { Injectable } from '@nestjs/common';
import { AppConfig } from '../../core/config/app-config.service';

const BASE_URLS = {
  sandbox: 'https://gw-fatoora.zatca.gov.sa/e-invoicing/developer-portal',
  simulation: 'https://gw-fatoora.zatca.gov.sa/e-invoicing/simulation',
  production: 'https://gw-fatoora.zatca.gov.sa/e-invoicing/core',
} as const;

export interface ReportingResult {
  status: 'REPORTED' | 'REPORTED_WITH_WARNINGS' | 'REJECTED';
  httpStatus: number;
  body: unknown;
}

/**
 * ZATCA Fatoora reporting API for simplified invoices (reporting within 24 hours of issue).
 * Authenticates with the production CSID (binarySecurityToken + secret).
 */
@Injectable()
export class ZatcaClient {
  constructor(private readonly config: AppConfig) {}

  get enabled(): boolean {
    return this.config.get('ZATCA_MODE') !== 'off';
  }

  async report(input: { xml: string; hash: string; uuid: string }): Promise<ReportingResult> {
    const mode = this.config.get('ZATCA_MODE');
    if (mode === 'off') throw new Error('ZATCA reporting is disabled');
    const auth = Buffer.from(`${this.config.get('ZATCA_CSID_TOKEN')}:${this.config.get('ZATCA_CSID_SECRET')}`).toString('base64');
    const res = await fetch(`${BASE_URLS[mode]}/invoices/reporting/single`, {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Accept-Language': 'en',
        'Accept-Version': 'V2',
        'Clearance-Status': '0',
        'Content-Type': 'application/json',
        Authorization: `Basic ${auth}`,
      },
      body: JSON.stringify({ invoiceHash: input.hash, uuid: input.uuid, invoice: Buffer.from(input.xml, 'utf8').toString('base64') }),
      signal: AbortSignal.timeout(20_000),
    });
    const text = await res.text();
    let body: unknown = text;
    try {
      body = JSON.parse(text);
    } catch {
      // keep the raw text
    }
    if (res.status === 200) return { status: 'REPORTED', httpStatus: 200, body };
    if (res.status === 202) return { status: 'REPORTED_WITH_WARNINGS', httpStatus: 202, body };
    if (res.status === 400) return { status: 'REJECTED', httpStatus: 400, body };
    // 401/429/5xx and anything else are transient or configuration problems: let the job retry.
    throw new Error(`ZATCA reporting failed with HTTP ${res.status}: ${text.slice(0, 500)}`);
  }
}
