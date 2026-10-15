import { Injectable, Logger } from '@nestjs/common';
import {
  codEligibility,
  computeCheckoutTotals,
  normalizeSaudiMobile,
  priceCartLineUnit,
  type CartLineInput,
  type CheckoutTotals,
  type PromotionLine,
  type ShippingOption,
} from '@hudhud/domain';
import type { City, District, Location, PaymentMethod, Prisma } from '@prisma/client';
import { AppError } from '../../core/errors/app-error';
import { nextCounter, riyadhYear, sequenceNumber } from '../../core/prisma/document-counter';
import { PrismaService } from '../../core/prisma/prisma.service';
import { CartService, type CartItemFull, type CartOwner, type LineIssue } from '../cart/cart.service';
import { OrderPaymentsService } from '../orders/order-payments.service';
import { OrdersService } from '../orders/orders.service';
import { StockLedger } from '../orders/stock-ledger';
import { PaymentGateways } from '../payments/payment-gateways';
import { PromotionsService, type PromotionEvaluation, type Shopper } from '../promotions/promotions.service';
import { SearchSync } from '../search/search-sync';
import { SettingsService } from '../settings/settings.service';
import { DEFAULT_ITEM_WEIGHT_G, ShippingService } from '../shipping/shipping.service';
import type { CheckoutBaseDto, PlaceOrderDto } from './checkout.dto';

const SAMPLE_WEIGHT_G = 50;
const METHODS: PaymentMethod[] = ['CARD', 'TABBY', 'TAMARA', 'COD'];

export type Blocker = 'cartIssues' | 'address' | 'shippingUnavailable' | 'pickupLocation' | 'pickupUnavailable' | 'paymentMethod';

interface AddressSnapshot {
  recipientName: string;
  phoneE164: string;
  cityCode: string;
  cityNameAr: string;
  cityNameEn: string;
  district: string | null;
  districtEn: string | null;
  street: string | null;
  buildingNo: string | null;
  additionalNo: string | null;
  postalCode: string | null;
  shortAddress: string | null;
}

interface PreparedQuote {
  cartId: string;
  items: Array<{ item: CartItemFull; issue: { issue: LineIssue; available?: number } | null }>;
  lines: CartLineInput[];
  promo: PromotionEvaluation;
  totals: CheckoutTotals;
  destination: { address?: AddressSnapshot; city?: City; pickup?: Location & { city: City | null } };
  shippingOptions: ShippingOption[];
  selectedRate?: ShippingOption;
  pickupEta?: { min: number; max: number };
  paymentMethods: Array<{ method: PaymentMethod; available: boolean; reason?: string; fee?: number }>;
  selectedMethod?: PaymentMethod;
  blockers: Blocker[];
  hasMadeToMeasure: boolean;
}

@Injectable()
export class CheckoutService {
  private readonly logger = new Logger(CheckoutService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly carts: CartService,
    private readonly settings: SettingsService,
    private readonly shipping: ShippingService,
    private readonly promotions: PromotionsService,
    private readonly gateways: PaymentGateways,
    private readonly stock: StockLedger,
    private readonly orders: OrdersService,
    private readonly payments: OrderPaymentsService,
    private readonly search: SearchSync,
  ) {}

  async pickupLocations() {
    const [pickup, locations] = await Promise.all([
      this.settings.get('checkout.pickup'),
      this.prisma.location.findMany({ where: { isPickupPoint: true, isActive: true }, orderBy: { code: 'asc' } }),
    ]);
    if (!pickup.enabled) return [];
    const cities = await this.prisma.city.findMany({ where: { id: { in: locations.map((l) => l.cityId).filter((id): id is string => Boolean(id)) } } });
    const byId = new Map(cities.map((c) => [c.id, c]));
    return locations.map((l) => {
      const city = l.cityId ? byId.get(l.cityId) : undefined;
      return { id: l.id, code: l.code, nameAr: l.nameAr, nameEn: l.nameEn, city: city ? { code: city.code, nameAr: city.nameAr, nameEn: city.nameEn } : null, readyMinDays: pickup.readyMinDays, readyMaxDays: pickup.readyMaxDays };
    });
  }

  async quote(owner: CartOwner, dto: CheckoutBaseDto & { paymentMethod?: PaymentMethod }, shopper: Shopper) {
    return this.view(await this.prepare(owner, dto, shopper));
  }

  private async prepare(owner: CartOwner, dto: CheckoutBaseDto & { paymentMethod?: PaymentMethod }, shopper: Shopper): Promise<PreparedQuote> {
    const loaded = await this.carts.loadForCheckout(owner);
    if (!loaded || loaded.items.length === 0) throw AppError.badRequest('cartEmpty');
    const [vat, wrap, modules, cod, pickup, methods, bnpl] = await Promise.all([
      this.settings.get('tax.vat'),
      this.settings.get('cart.giftWrap'),
      this.settings.get('modules.enabled'),
      this.settings.get('checkout.cod'),
      this.settings.get('checkout.pickup'),
      this.settings.get('payments.methods'),
      this.settings.get('payments.bnpl'),
    ]);
    const pricing = { vatRateBp: vat.rateBp, pricesIncludeVat: vat.pricesIncludeVat, giftWrapPrice: modules.giftWrapping ? wrap.priceHalalas : null };
    const blockers = new Set<Blocker>();

    const ok = loaded.items.filter((i) => !i.issue);
    if (ok.length !== loaded.items.length) blockers.add('cartIssues');
    const lines: CartLineInput[] = [];
    const promoLines: PromotionLine[] = [];
    const lineage = await this.promotions.categoryLineage();
    let weightG = 0;
    for (const { item } of ok) {
      const product = item.variant.product;
      const line: CartLineInput = {
        id: item.id,
        pricingMode: product.pricingMode,
        unitPrice: item.variant.price ?? product.basePrice,
        quantity: item.quantity,
        lengthCm: item.lengthCm,
        widthMm: item.widthMm,
        heightMm: item.heightMm,
        isSample: item.isSample,
        samplePrice: product.samplePrice,
        giftWrap: item.giftWrap,
      };
      let unitPrice: number;
      try {
        unitPrice = priceCartLineUnit(line).unitPrice;
      } catch {
        blockers.add('cartIssues');
        continue;
      }
      lines.push(line);
      promoLines.push({ id: item.id, productId: product.id, categoryIds: lineage(product.categoryId), vertical: product.category.vertical, unitPrice, quantity: item.quantity, excluded: item.isSample });
      weightG += (item.isSample ? SAMPLE_WEIGHT_G : (item.variant.weightGrams ?? DEFAULT_ITEM_WEIGHT_G)) * item.quantity;
    }
    const hasMadeToMeasure = ok.some(({ item }) => item.variant.product.isMadeToMeasure && !item.isSample);

    const promo = await this.promotions.evaluate(promoLines, dto.couponCode?.trim() || undefined, shopper);
    const goods = computeCheckoutTotals({ lines, lineDiscounts: promo.result.lineDiscounts, shipping: 0, codFee: 0, settings: pricing });
    const goodsTotal = goods.total;

    // Destination and delivery method.
    const destination: PreparedQuote['destination'] = {};
    let shippingOptions: ShippingOption[] = [];
    let selectedRate: ShippingOption | undefined;
    let pickupEta: PreparedQuote['pickupEta'];
    if (dto.fulfillment === 'DELIVERY') {
      const resolved = await this.resolveAddress(dto, shopper);
      if (resolved) {
        destination.address = resolved.snapshot;
        destination.city = resolved.city;
      } else {
        blockers.add('address');
        // Address still being typed: price delivery for the chosen city already.
        if (dto.cityCode) destination.city = (await this.prisma.city.findFirst({ where: { code: dto.cityCode, isActive: true } })) ?? undefined;
      }
      if (destination.city) {
        shippingOptions = await this.shipping.options({ cityCode: destination.city.code, weightG, goodsTotal: goods.subtotal - goods.discount, freeShipping: promo.result.freeShipping, madeToMeasure: hasMadeToMeasure });
        selectedRate = shippingOptions.find((o) => o.rateId === dto.shippingRateId) ?? shippingOptions[0];
        if (!selectedRate) blockers.add('shippingUnavailable');
      }
    } else {
      if (!pickup.enabled) blockers.add('pickupUnavailable');
      const location = dto.pickupLocationId ? await this.prisma.location.findFirst({ where: { id: dto.pickupLocationId, isPickupPoint: true, isActive: true } }) : null;
      if (!location) blockers.add('pickupLocation');
      else destination.pickup = { ...location, city: location.cityId ? await this.prisma.city.findUnique({ where: { id: location.cityId } }) : null };
      const production = await this.shipping.productionDays(hasMadeToMeasure);
      pickupEta = { min: pickup.readyMinDays + (production?.min ?? 0), max: pickup.readyMaxDays + (production?.max ?? 0) };
    }
    const shippingPrice = selectedRate?.price ?? 0;

    // Payment methods.
    const preCodTotal = goodsTotal + shippingPrice;
    const codCheck = codEligibility(
      { enabled: cod.enabled && methods.cod, fee: cod.feeHalalas, maxTotal: cod.maxTotalHalalas, allowMadeToMeasure: cod.allowMadeToMeasure },
      { cityCodAllowed: destination.city?.codAllowed ?? false, hasMadeToMeasure, total: preCodTotal, isPickup: dto.fulfillment === 'PICKUP' },
    );
    const paymentMethods = METHODS.map((method) => {
      if (method === 'COD') return codCheck.allowed ? { method, available: true, fee: codCheck.fee } : { method, available: false, reason: codCheck.reason };
      const enabled = method === 'CARD' ? methods.card : method === 'TABBY' ? methods.tabby : methods.tamara;
      if (!enabled || !this.gateways.forMethod(method)) return { method, available: false, reason: 'disabled' };
      if (method !== 'CARD' && (preCodTotal < bnpl.minTotalHalalas || preCodTotal > bnpl.maxTotalHalalas)) return { method, available: false, reason: 'amount' };
      return { method, available: true };
    });
    const selectedMethod = dto.paymentMethod && paymentMethods.find((m) => m.method === dto.paymentMethod && m.available) ? dto.paymentMethod : undefined;
    if (dto.paymentMethod && !selectedMethod) blockers.add('paymentMethod');
    const codFee = selectedMethod === 'COD' && codCheck.allowed ? codCheck.fee : 0;

    const totals = computeCheckoutTotals({ lines, lineDiscounts: promo.result.lineDiscounts, shipping: shippingPrice, codFee, settings: pricing });
    return { cartId: loaded.cart.id, items: loaded.items, lines, promo, totals, destination, shippingOptions, selectedRate, pickupEta, paymentMethods, selectedMethod, blockers: [...blockers], hasMadeToMeasure };
  }

  private async resolveAddress(dto: CheckoutBaseDto, shopper: Shopper): Promise<{ snapshot: AddressSnapshot; city: City } | null> {
    if (dto.addressId) {
      if (!shopper.userId) return null;
      const a = await this.prisma.address.findFirst({ where: { id: dto.addressId, userId: shopper.userId }, include: { city: true, district: true } });
      if (!a || !a.city.isActive) return null;
      return { city: a.city, snapshot: this.snapshot(a.city, a.district, { ...a, district: undefined }) };
    }
    if (!dto.address) return null;
    const city = await this.prisma.city.findFirst({ where: { code: dto.address.cityCode, isActive: true } });
    if (!city) throw AppError.badRequest('validation', { field: 'address.cityCode' });
    const phone = normalizeSaudiMobile(dto.address.phone);
    if (!phone) throw AppError.badRequest('phoneInvalid');
    const district = dto.address.districtId ? await this.prisma.district.findFirst({ where: { id: dto.address.districtId, cityId: city.id } }) : null;
    if (dto.address.districtId && !district) throw AppError.badRequest('validation', { field: 'address.districtId' });
    return { city, snapshot: this.snapshot(city, district, { ...dto.address, phoneE164: phone }) };
  }

  private snapshot(
    city: City,
    district: District | null,
    a: { recipientName: string; phoneE164: string; district?: string; street?: string | null; buildingNo?: string | null; additionalNo?: string | null; postalCode?: string | null; shortAddress?: string | null },
  ): AddressSnapshot {
    return {
      recipientName: a.recipientName.trim(),
      phoneE164: a.phoneE164,
      cityCode: city.code,
      cityNameAr: city.nameAr,
      cityNameEn: city.nameEn,
      district: district?.nameAr ?? (a.district?.trim() || null),
      districtEn: district?.nameEn ?? null,
      street: a.street?.trim() || null,
      buildingNo: a.buildingNo ?? null,
      additionalNo: a.additionalNo ?? null,
      postalCode: a.postalCode ?? null,
      shortAddress: a.shortAddress?.toUpperCase() ?? null,
    };
  }

  private view(q: PreparedQuote) {
    const pricedById = new Map(q.totals.cart.lines.map((l) => [l.id, l]));
    return {
      items: q.items.map(({ item, issue }) => {
        const card = this.carts.card(item);
        const p = pricedById.get(item.id);
        return {
          id: item.id,
          sku: item.variant.sku,
          nameAr: card.nameAr,
          nameEn: card.nameEn,
          image: card.image,
          options: this.options(item),
          quantity: item.quantity,
          isSample: item.isSample,
          lengthCm: item.lengthCm,
          widthMm: item.widthMm,
          heightMm: item.heightMm,
          giftWrap: item.giftWrap,
          unitPrice: p?.unitPrice ?? null,
          discount: p?.discount ?? 0,
          total: p?.total ?? null,
          issue: issue?.issue ?? null,
        };
      }),
      address: q.destination.address ?? null,
      shippingOptions: q.shippingOptions,
      selectedShippingRateId: q.selectedRate?.rateId ?? null,
      pickupLocation: q.destination.pickup ? { id: q.destination.pickup.id, nameAr: q.destination.pickup.nameAr, nameEn: q.destination.pickup.nameEn, city: q.destination.pickup.city ? { code: q.destination.pickup.city.code, nameAr: q.destination.pickup.city.nameAr, nameEn: q.destination.pickup.city.nameEn } : null } : null,
      eta: q.selectedRate ? { minDays: q.selectedRate.etaMinDays, maxDays: q.selectedRate.etaMaxDays } : q.pickupEta ? { minDays: q.pickupEta.min, maxDays: q.pickupEta.max } : null,
      paymentMethods: q.paymentMethods,
      selectedPaymentMethod: q.selectedMethod ?? null,
      promotions: q.promo.result.applied.map((a) => ({ id: a.promotionId, code: a.code ?? null, type: a.type, nameAr: q.promo.names.get(a.promotionId)?.nameAr ?? '', nameEn: q.promo.names.get(a.promotionId)?.nameEn ?? '', discount: a.discount, freeShipping: a.freeShipping })),
      coupon: q.promo.coupon || q.promo.couponProblem ? { code: q.promo.coupon?.code ?? null, applied: Boolean(q.promo.coupon) && !q.promo.couponProblem, problem: q.promo.couponProblem ?? null } : null,
      totals: {
        subtotal: q.totals.subtotal,
        discount: q.totals.discount,
        giftWrap: q.totals.giftWrap,
        shipping: q.totals.shippingTotal,
        codFee: q.totals.codFeeTotal,
        net: q.totals.net,
        vat: q.totals.vat,
        total: q.totals.total,
      },
      vatBreakdown: q.totals.vatBreakdown,
      hasMadeToMeasure: q.hasMadeToMeasure,
      blockers: q.blockers,
      canPlace: q.blockers.length === 0 && Boolean(q.selectedMethod),
    };
  }

  private options(item: CartItemFull) {
    return [...item.variant.options]
      .sort((a, b) => a.value.attribute.sortOrder - b.value.attribute.sortOrder)
      .map((o) => ({ attributeKey: o.value.attribute.key, nameAr: o.value.attribute.nameAr, nameEn: o.value.attribute.nameEn, labelAr: o.value.labelAr, labelEn: o.value.labelEn }));
  }

  /** Place the order: snapshot, reserve stock, redeem promotions and open the payment session. */
  async place(owner: CartOwner, dto: PlaceOrderDto, shopper: Shopper) {
    const contact = await this.contact(dto, shopper);
    if ((dto.paymentMethod === 'TABBY' || dto.paymentMethod === 'TAMARA') && !contact.email) throw AppError.badRequest('validation', { field: 'contact.email', reason: 'requiredForInstalments' });
    const promoShopper = { userId: shopper.userId, phoneE164: contact.phoneE164 };
    const q = await this.prepare(owner, dto, promoShopper);
    if (q.blockers.length || !q.selectedMethod) {
      if (q.blockers.includes('paymentMethod') || !q.selectedMethod) throw AppError.badRequest('paymentMethodUnavailable', { method: dto.paymentMethod });
      throw AppError.badRequest('cartNotReady', { blockers: q.blockers.join(',') });
    }
    if (dto.couponCode?.trim() && q.promo.couponProblem) throw AppError.badRequest('couponNotApplicable', { reason: q.promo.couponProblem });
    if (dto.expectedTotal !== undefined && dto.expectedTotal !== q.totals.total) throw AppError.conflict('cartNotReady', { reason: 'totalChanged', total: q.totals.total });

    const [vat, payment] = await Promise.all([this.settings.get('tax.vat'), this.settings.get('checkout.payment')]);
    const user = shopper.userId ? await this.prisma.user.findUnique({ where: { id: shopper.userId }, select: { locale: true } }) : null;
    const locale = dto.locale ?? user?.locale ?? 'ar';
    const isCod = q.selectedMethod === 'COD';
    const pricedById = new Map(q.totals.cart.lines.map((l) => [l.id, l]));
    const items = q.items.map((i) => i.item).filter((i) => pricedById.has(i.id));
    const productIds = items.map((i) => i.variant.productId);

    const order = await this.prisma.$transaction(
      async (tx) => {
        const year = riyadhYear();
        const number = sequenceNumber('HD', year, await nextCounter(tx, `order:${year}`));
        const created = await tx.order.create({
          data: {
            number,
            userId: shopper.userId,
            locale,
            contactName: contact.name,
            contactPhoneE164: contact.phoneE164,
            contactEmail: contact.email,
            status: 'NEW',
            paymentMethod: q.selectedMethod!,
            paymentState: isCod ? 'PAY_ON_DELIVERY' : 'UNPAID',
            fulfillment: dto.fulfillment,
            shippingAddress: (q.destination.address ?? undefined) as Prisma.InputJsonValue | undefined,
            cityCode: q.destination.city?.code ?? q.destination.pickup?.city?.code ?? null,
            shippingRateId: q.selectedRate?.rateId,
            shippingCarrier: q.selectedRate?.carrier,
            shippingMethod: q.selectedRate?.method,
            shippingNameAr: q.selectedRate?.nameAr,
            shippingNameEn: q.selectedRate?.nameEn,
            pickupLocationId: q.destination.pickup?.id,
            etaMinDays: q.selectedRate?.etaMinDays ?? q.pickupEta?.min,
            etaMaxDays: q.selectedRate?.etaMaxDays ?? q.pickupEta?.max,
            vatRateBp: vat.rateBp,
            pricesIncludeVat: vat.pricesIncludeVat,
            subtotal: q.totals.subtotal,
            discount: q.totals.discount,
            giftWrapTotal: q.totals.giftWrap,
            shippingTotal: q.totals.shippingTotal,
            codFee: q.totals.codFeeTotal,
            net: q.totals.net,
            vat: q.totals.vat,
            total: q.totals.total,
            couponCode: q.promo.coupon?.code,
            pricing: {
              promotions: q.promo.result.applied.map((a) => ({ id: a.promotionId, code: a.code, type: a.type, nameAr: q.promo.names.get(a.promotionId)?.nameAr, nameEn: q.promo.names.get(a.promotionId)?.nameEn, discount: a.discount, freeShipping: a.freeShipping })),
              vatBreakdown: q.totals.vatBreakdown,
              shipping: q.totals.shipping,
              codFee: q.totals.codFee,
            } as unknown as Prisma.InputJsonValue,
            customerNote: dto.customerNote?.trim() || null,
            cartId: q.cartId,
            expiresAt: isCod ? null : new Date(Date.now() + payment.unpaidTtlMinutes * 60_000),
            items: {
              create: items.map((item, sortOrder) => {
                const p = pricedById.get(item.id)!;
                const card = this.carts.card(item);
                return {
                  variantId: item.variantId,
                  productId: item.variant.productId,
                  sku: item.variant.sku,
                  nameAr: card.nameAr,
                  nameEn: card.nameEn,
                  options: this.options(item) as Prisma.InputJsonValue,
                  imageUrl: card.image?.thumbnailUrl ?? null,
                  pricingMode: item.variant.product.pricingMode,
                  isMadeToMeasure: item.variant.product.isMadeToMeasure,
                  isSample: item.isSample,
                  lengthCm: item.lengthCm,
                  widthMm: item.widthMm,
                  heightMm: item.heightMm,
                  billedMeasure: p.billedMeasure,
                  quantity: item.quantity,
                  unitPrice: p.unitPrice,
                  discount: p.discount,
                  giftWrap: item.giftWrap,
                  giftWrapTotal: p.giftWrap,
                  giftMessage: item.giftMessage,
                  net: p.vat.net,
                  vat: p.vat.vat,
                  vatRateBp: p.vat.rateBp,
                  total: p.total,
                  weightGrams: (item.isSample ? SAMPLE_WEIGHT_G : (item.variant.weightGrams ?? DEFAULT_ITEM_WEIGHT_G)) * item.quantity,
                  sortOrder,
                };
              }),
            },
            events: { create: { toStatus: 'NEW', note: 'placed' } },
          },
          include: { items: true },
        });

        // Stock items are reserved now; made-to-measure pieces and samples are produced or cut to order.
        const bySort = new Map(created.items.map((i) => [i.sortOrder, i]));
        await this.stock.reserve(
          tx,
          created.id,
          items.flatMap((item, idx) => (item.isSample || item.variant.product.isMadeToMeasure ? [] : [{ orderItemId: bySort.get(idx)!.id, variantId: item.variantId, sku: item.variant.sku, quantity: item.quantity }])),
        );
        await this.promotions.redeem(tx, created.id, q.promo.result.applied, q.promo.coupon, promoShopper);
        await tx.cart.update({ where: { id: q.cartId }, data: { status: 'CONVERTED' } });

        if (isCod) {
          await this.stock.commit(tx, created.id);
          await tx.payment.create({ data: { orderId: created.id, provider: 'COD', method: 'COD', amount: created.total } });
          await tx.order.update({ where: { id: created.id }, data: { status: 'CONFIRMED' } });
          await tx.orderStatusEvent.create({ data: { orderId: created.id, fromStatus: 'NEW', toStatus: 'CONFIRMED', note: 'cash on delivery' } });
        }
        return created;
      },
      { timeout: 20_000 },
    );

    await this.search.products(productIds);
    let redirectUrl: string | null = null;
    if (!isCod) {
      try {
        redirectUrl = (await this.payments.start(order.id)).redirectUrl;
      } catch (err) {
        // No session, no order: put everything back so the customer can try another method.
        await this.orders.cancel(order.id, { reason: 'Payment session could not be opened' }).catch((e) => this.logger.error({ err: e, orderId: order.id }, 'Rollback failed'));
        await this.reopenCart(q.cartId);
        throw err;
      }
    }
    return {
      order: { id: order.id, number: order.number, status: isCod ? 'CONFIRMED' : 'NEW', paymentMethod: order.paymentMethod, total: order.total },
      accessToken: this.orders.accessToken(order.id),
      payment: redirectUrl ? { redirectUrl } : null,
    };
  }

  /** Restore the cart after a placement that could not open a payment session. */
  private async reopenCart(cartId: string) {
    const cart = await this.prisma.cart.findUnique({ where: { id: cartId } });
    if (!cart) return;
    if (cart.userId) {
      const active = await this.prisma.cart.findFirst({ where: { userId: cart.userId, status: 'ACTIVE' } });
      if (active) return;
    }
    await this.prisma.cart.update({ where: { id: cartId }, data: { status: 'ACTIVE' } });
  }

  private async contact(dto: PlaceOrderDto, shopper: Shopper): Promise<{ name: string; phoneE164: string; email: string | null }> {
    if (shopper.userId) {
      const user = await this.prisma.user.findUniqueOrThrow({ where: { id: shopper.userId } });
      const phone = dto.contact?.phone ? normalizeSaudiMobile(dto.contact.phone) : user.phoneE164;
      if (!phone) throw AppError.badRequest('phoneInvalid');
      const name = dto.contact?.name?.trim() || user.fullName || '';
      if (name.length < 2) throw AppError.badRequest('validation', { field: 'contact.name' });
      return { name, phoneE164: phone, email: dto.contact?.email ?? user.email ?? null };
    }
    if (!dto.contact) throw AppError.badRequest('validation', { field: 'contact' });
    const phone = normalizeSaudiMobile(dto.contact.phone);
    if (!phone) throw AppError.badRequest('phoneInvalid');
    return { name: dto.contact.name.trim(), phoneE164: phone, email: dto.contact.email ?? null };
  }
}
