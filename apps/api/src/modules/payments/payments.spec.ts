import { createHmac } from 'node:crypto';
import { hashInputFromSignedXml } from '../invoicing/invoicing.service';
import { certificateSignature } from '../invoicing/zatca-keys.service';
import { MoyasarGateway } from './gateways/moyasar.gateway';
import { TabbyGateway } from './gateways/tabby.gateway';
import { TamaraGateway, verifyHs256 } from './gateways/tamara.gateway';
import { GatewayError, halalas, sar, type PaymentSessionInput } from './payment-gateway.port';

/** Self-signed secp256k1 test certificate (issuer mimics ZATCA's sandbox CA). */
const TEST_CERT =
  'MIICFzCCAb6gAwIBAgIUaUhEJ39DUu3E6cFghr5uYPAWScEwCgYIKoZIzj0EAwIwYzEcMBoGA1UEAwwTVFNaRUlOVk9JQ0UtU3ViQ0EtMTEXMBUGCgmSJomT8ixkARkWB2V4dGdhenQxEzARBgoJkiaJk/IsZAEZFgNnb3YxFTATBgoJkiaJk/IsZAEZFgVsb2NhbDAeFw0yNjEwMTUyMDExMDRaFw0zNjEwMTIyMDExMDRaMGMxHDAaBgNVBAMME1RTWkVJTlZPSUNFLVN1YkNBLTExFzAVBgoJkiaJk/IsZAEZFgdleHRnYXp0MRMwEQYKCZImiZPyLGQBGRYDZ292MRUwEwYKCZImiZPyLGQBGRYFbG9jYWwwVjAQBgcqhkjOPQIBBgUrgQQACgNCAATM1h+eeUN4O8uLQT9jlbtDQdBjfMaSna18XXNw2Vmoiy7wbWS4zvbWDTNTbta282HDT7yKXh/fmpnQ5WF47Rfoo1MwUTAdBgNVHQ4EFgQUFYrAeyNwbu8Zh02BQhXJc2LoAbUwHwYDVR0jBBgwFoAUFYrAeyNwbu8Zh02BQhXJc2LoAbUwDwYDVR0TAQH/BAUwAwEB/zAKBggqhkjOPQQDAgNHADBEAiBDz7KopVKfmIq1YNza4zp79yAOvLMXNmqTgP1IkLMtawIgcfnzwh59sX22s5usCVqB1gHGGTvWrAugrSp+LGmzils=';
/** Signature value as printed by `openssl x509 -text`. */
const TEST_CERT_SIGNATURE = '3044022043cfb2a8a5529f988ab560dcdae33a7bf7200ebcb317366a9380fd4890b32d6b022071f9f3c21e7db17db6b39bac095a81d601c6193bd6ac0ba0ad2a7e2c69b38a5b';

const session = (over: Partial<PaymentSessionInput> = {}): PaymentSessionInput => ({
  paymentId: 'pay-1',
  method: 'CARD',
  amount: 33400,
  order: {
    id: 'order-1',
    number: 'HD-2026-000001',
    locale: 'ar',
    net: 29043,
    vat: 4357,
    shippingTotal: 3500,
    discount: 0,
    contactName: 'Sara Ahmed Ali',
    contactPhoneE164: '+966551234567',
    contactEmail: 'sara@example.com',
    placedAt: new Date('2026-10-16T10:00:00Z'),
    expiresAt: new Date('2026-10-16T10:30:00Z'),
    address: { line1: '1234, Tahlia', city: 'Jeddah', postalCode: '23434' },
    items: [{ sku: 'ABY-1', name: 'عباية', quantity: 1, unitPrice: 29900, total: 29900, vat: 3900, discount: 0 }],
  },
  returnUrl: 'https://shop.example.sa/ar/checkout/return?order=order-1',
  notificationUrl: 'https://api.example.sa/api/v1/payments/webhooks/moyasar',
  ...over,
});

function mockFetch(...responses: Array<{ status?: number; body: unknown }>) {
  const calls: Array<{ url: string; init: RequestInit }> = [];
  const queue = [...responses];
  jest.spyOn(global, 'fetch').mockImplementation(async (url, init) => {
    calls.push({ url: String(url), init: init ?? {} });
    const next = queue.shift() ?? { status: 500, body: { error: 'unexpected call' } };
    return new Response(JSON.stringify(next.body), { status: next.status ?? 200, headers: { 'Content-Type': 'application/json' } });
  });
  return calls;
}

const jsonBody = (init: RequestInit) => JSON.parse(String(init.body)) as Record<string, any>;

afterEach(() => jest.restoreAllMocks());

describe('amount helpers', () => {
  it('converts between halalas and SAR strings', () => {
    expect(sar(33400)).toBe('334.00');
    expect(sar(5)).toBe('0.05');
    expect(halalas('334.00')).toBe(33400);
    expect(halalas(0.1 + 0.2)).toBe(30);
  });
});

describe('MoyasarGateway', () => {
  const gw = new MoyasarGateway({ secretKey: 'sk_test_123', webhookSecret: 'whsec_abc', baseUrl: 'https://api.moyasar.com' });

  it('creates a hosted invoice in halalas with basic auth', async () => {
    const calls = mockFetch({ body: { id: 'inv_1', status: 'initiated', amount: 33400, url: 'https://checkout.moyasar.com/invoices/inv_1' } });
    const s = await gw.createSession(session());
    expect(s).toMatchObject({ providerRef: 'inv_1', redirectUrl: 'https://checkout.moyasar.com/invoices/inv_1' });
    expect(calls[0]!.url).toBe('https://api.moyasar.com/v1/invoices');
    expect((calls[0]!.init.headers as Record<string, string>).Authorization).toBe(`Basic ${Buffer.from('sk_test_123:').toString('base64')}`);
    expect(jsonBody(calls[0]!.init)).toMatchObject({ amount: 33400, currency: 'SAR', success_url: session().returnUrl, metadata: { order_id: 'order-1' } });
  });

  it('maps invoice status and reports the paid card', async () => {
    mockFetch({ body: { id: 'inv_1', status: 'paid', amount: 33400, url: '', payments: [{ id: 'pay_9', status: 'paid', amount: 33400, source: { company: 'mada', number: '4201-32XX-XXXX-1234' } }] } });
    expect(await gw.verify('inv_1')).toMatchObject({ status: 'CAPTURED', amount: 33400, sourceSummary: 'mada 1234' });
    mockFetch({ body: { id: 'inv_1', status: 'initiated', amount: 33400, url: '', payments: [{ id: 'p', status: 'failed', amount: 33400, source: { message: 'INSUFFICIENT_FUNDS' } }] } });
    expect(await gw.verify('inv_1')).toMatchObject({ status: 'PENDING', failureReason: 'INSUFFICIENT_FUNDS' });
    mockFetch({ body: { id: 'inv_1', status: 'expired', amount: 33400, url: '' } });
    expect((await gw.verify('inv_1')).status).toBe('EXPIRED');
  });

  it('refunds the captured payment of the invoice', async () => {
    const calls = mockFetch(
      { body: { id: 'inv_1', status: 'paid', amount: 33400, url: '', payments: [{ id: 'pay_9', status: 'paid', amount: 33400 }] } },
      { body: { id: 'pay_9', status: 'refunded', amount: 33400 } },
    );
    await gw.refund('inv_1', 1000);
    expect(calls[1]!.url).toBe('https://api.moyasar.com/v1/payments/pay_9/refund');
    expect(jsonBody(calls[1]!.init)).toEqual({ amount: 1000 });
    mockFetch({ body: { id: 'inv_1', status: 'initiated', amount: 33400, url: '', payments: [] } });
    await expect(gw.refund('inv_1', 1000)).rejects.toThrow(GatewayError);
  });

  it('turns HTTP errors into gateway errors', async () => {
    mockFetch({ status: 401, body: { type: 'authentication_error' } });
    await expect(gw.verify('inv_1')).rejects.toMatchObject({ provider: 'MOYASAR', status: 401 });
  });

  it('authenticates webhooks by the shared secret token', () => {
    const body = { id: 'evt_1', type: 'payment_paid', secret_token: 'whsec_abc', data: { id: 'pay_9', invoice_id: 'inv_1' } };
    expect(gw.parseWebhook({ headers: {}, query: {}, body })).toEqual({ eventId: 'evt_1', type: 'payment_paid', providerRef: 'inv_1' });
    expect(() => gw.parseWebhook({ headers: {}, query: {}, body: { ...body, secret_token: 'whsec_abd' } })).toThrow(GatewayError);
    expect(() => gw.parseWebhook({ headers: {}, query: {}, body: { ...body, secret_token: undefined } })).toThrow(GatewayError);
    expect(gw.parseWebhook({ headers: {}, query: {}, body: { secret_token: 'whsec_abc' } })).toBeNull();
  });
});

describe('TabbyGateway', () => {
  const gw = new TabbyGateway({ secretKey: 'sk_tabby', merchantCode: 'HUDHUD_SA', webhookSecret: 'hook-secret', baseUrl: 'https://api.tabby.ai' });

  it('opens a checkout session with buyer and order details in SAR', async () => {
    const calls = mockFetch({ body: { id: 'sess_1', status: 'created', payment: { id: 'tp_1', status: 'CREATED', amount: '334.00' }, configuration: { available_products: { installments: [{ web_url: 'https://checkout.tabby.ai/sess_1' }] } } } });
    const s = await gw.createSession(session({ method: 'TABBY' }));
    expect(s).toMatchObject({ providerRef: 'tp_1', redirectUrl: 'https://checkout.tabby.ai/sess_1' });
    const body = jsonBody(calls[0]!.init);
    expect(body).toMatchObject({ lang: 'ar', merchant_code: 'HUDHUD_SA', payment: { amount: '334.00', currency: 'SAR', buyer: { phone: '+966551234567', email: 'sara@example.com' }, order: { reference_id: 'HD-2026-000001', shipping_amount: '35.00' } } });
    expect(body.payment.order.items[0]).toMatchObject({ unit_price: '299.00', quantity: 1 });
  });

  it('reports a pre-scoring rejection as a rejected session', async () => {
    mockFetch({ body: { id: 'sess_1', status: 'rejected', payment: { id: 'tp_1', status: 'CREATED', amount: '334.00' }, configuration: { products: { installments: { rejection_reason: 'not_available' } } } } });
    await expect(gw.createSession(session({ method: 'TABBY' }))).rejects.toMatchObject({ body: { rejected: true } });
  });

  it('verifies, captures and refunds', async () => {
    mockFetch({ body: { id: 'tp_1', status: 'AUTHORIZED', amount: '334.00' } });
    expect(await gw.verify('tp_1')).toMatchObject({ status: 'AUTHORIZED', amount: 33400 });
    const calls = mockFetch({ body: { id: 'tp_1', status: 'CLOSED', amount: '334.00' } }, { body: { id: 'tp_1', status: 'CLOSED', amount: '334.00', refunds: [{ id: 'rf_1' }] } });
    expect((await gw.capture('tp_1', 33400)).status).toBe('CAPTURED');
    expect(jsonBody(calls[0]!.init)).toMatchObject({ amount: '334.00' });
    expect(await gw.refund('tp_1', 33400, 'cancelled')).toEqual({ providerRef: 'rf_1' });
  });

  it('closes an authorised payment on cancel', async () => {
    const calls = mockFetch({ body: { id: 'tp_1', status: 'AUTHORIZED', amount: '334.00' } }, { body: {} });
    await gw.cancel('tp_1');
    expect(calls[1]!.url).toBe('https://api.tabby.ai/api/v2/payments/tp_1/close');
  });

  it('authenticates webhooks by the registered header', () => {
    expect(gw.parseWebhook({ headers: { 'x-webhook-secret': 'hook-secret' }, query: {}, body: { id: 'tp_1', status: 'AUTHORIZED' } })).toEqual({ eventId: 'tp_1:authorized', type: 'authorized', providerRef: 'tp_1' });
    expect(() => gw.parseWebhook({ headers: { 'x-webhook-secret': 'nope' }, query: {}, body: { id: 'tp_1' } })).toThrow(GatewayError);
    expect(gw.parseWebhook({ headers: { 'x-webhook-secret': ['hook-secret'] }, query: {}, body: {} })).toBeNull();
  });
});

describe('TamaraGateway', () => {
  const gw = new TamaraGateway({ apiToken: 'tamara-token', notificationToken: 'notify-key', baseUrl: 'https://api-sandbox.tamara.co' });
  const jwt = (payload: object, key = 'notify-key', alg = 'HS256') => {
    const h = Buffer.from(JSON.stringify({ alg, typ: 'JWT' })).toString('base64url');
    const p = Buffer.from(JSON.stringify(payload)).toString('base64url');
    return `${h}.${p}.${createHmac('sha256', key).update(`${h}.${p}`).digest('base64url')}`;
  };

  it('verifies HS256 notification tokens', () => {
    expect(verifyHs256(jwt({ iss: 'Tamara', exp: 2_000_000_000 }), 'notify-key')).toMatchObject({ iss: 'Tamara' });
    expect(() => verifyHs256(jwt({}), 'other-key')).toThrow(/signature/);
    expect(() => verifyHs256(jwt({ exp: 10 }), 'notify-key')).toThrow(/expired/);
    expect(() => verifyHs256(jwt({}, 'notify-key', 'none'), 'notify-key')).toThrow(/algorithm/);
    expect(() => verifyHs256('a.b', 'notify-key')).toThrow(/malformed/);
  });

  it('opens a checkout with consumer and instalment details', async () => {
    const calls = mockFetch({ body: { order_id: 'tm_1', checkout_id: 'co_1', checkout_url: 'https://checkout-sandbox.tamara.co/co_1' } });
    const s = await gw.createSession(session({ method: 'TAMARA' }));
    expect(s).toMatchObject({ providerRef: 'tm_1', redirectUrl: 'https://checkout-sandbox.tamara.co/co_1' });
    expect(jsonBody(calls[0]!.init)).toMatchObject({
      order_reference_id: 'order-1',
      total_amount: { amount: 334, currency: 'SAR' },
      locale: 'ar_SA',
      consumer: { first_name: 'Sara', last_name: 'Ahmed Ali', phone_number: '+966551234567' },
      merchant_url: { notification: session().notificationUrl },
    });
  });

  it('authorises approved orders while verifying', async () => {
    const calls = mockFetch({ body: { order_id: 'tm_1', status: 'approved', total_amount: { amount: 334, currency: 'SAR' } } }, { body: { status: 'authorised' } }, { body: { order_id: 'tm_1', status: 'authorised', total_amount: { amount: 334, currency: 'SAR' } } });
    expect(await gw.verify('tm_1')).toMatchObject({ status: 'AUTHORIZED', amount: 33400 });
    expect(calls[1]!.url).toBe('https://api-sandbox.tamara.co/orders/tm_1/authorise');
  });

  it('captures and refunds', async () => {
    const calls = mockFetch({ body: {} }, { body: { order_id: 'tm_1', status: 'fully_captured', total_amount: { amount: '334.00', currency: 'SAR' } } }, { body: { refund_id: 'rf_9' } });
    expect((await gw.capture('tm_1', 33400)).status).toBe('CAPTURED');
    expect(jsonBody(calls[0]!.init)).toMatchObject({ order_id: 'tm_1', total_amount: { amount: 334 } });
    expect(await gw.refund('tm_1', 33400, 'cancelled')).toEqual({ providerRef: 'rf_9' });
  });

  it('authenticates webhooks by bearer token or tamaraToken query', () => {
    const body = { order_id: 'tm_1', order_status: 'approved', event_type: 'order_approved' };
    expect(gw.parseWebhook({ headers: { authorization: `Bearer ${jwt({})}` }, query: {}, body })).toEqual({ eventId: 'tm_1:order_approved', type: 'order_approved', providerRef: 'tm_1' });
    expect(gw.parseWebhook({ headers: {}, query: { tamaraToken: jwt({}) }, body })?.providerRef).toBe('tm_1');
    expect(() => gw.parseWebhook({ headers: {}, query: {}, body })).toThrow(GatewayError);
    expect(() => gw.parseWebhook({ headers: { authorization: `Bearer ${jwt({}, 'forged')}` }, query: {}, body })).toThrow(GatewayError);
  });
});

describe('ZATCA helpers', () => {
  it('extracts the certificate signature (QR tag 9)', () => {
    expect(certificateSignature(Buffer.from(TEST_CERT, 'base64')).toString('hex')).toBe(TEST_CERT_SIGNATURE);
  });

  it('rebuilds the hash input from a stored signed document', () => {
    const signed =
      '<?xml version="1.0" encoding="UTF-8"?>\n<Invoice><ext:UBLExtensions><ext:UBLExtension>sig</ext:UBLExtension></ext:UBLExtensions><cbc:ID>1</cbc:ID>' +
      '<cac:AdditionalDocumentReference><cbc:ID>PIH</cbc:ID></cac:AdditionalDocumentReference>' +
      '<cac:AdditionalDocumentReference><cbc:ID>QR</cbc:ID><cac:Attachment>q</cac:Attachment></cac:AdditionalDocumentReference>' +
      '<cac:Signature><cbc:ID>s</cbc:ID></cac:Signature><cac:AccountingSupplierParty/></Invoice>';
    expect(hashInputFromSignedXml(signed)).toBe('<Invoice><cbc:ID>1</cbc:ID><cac:AdditionalDocumentReference><cbc:ID>PIH</cbc:ID></cac:AdditionalDocumentReference><cac:AccountingSupplierParty/></Invoice>');
  });
});
