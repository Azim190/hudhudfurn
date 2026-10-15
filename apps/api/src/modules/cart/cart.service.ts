import { Injectable } from '@nestjs/common';
import { priceCart, priceCartLineUnit, type CartLineInput } from '@hudhud/domain';
import type { Cart, Prisma } from '@prisma/client';
import { CryptoService } from '../../core/crypto/crypto.service';
import { AppError } from '../../core/errors/app-error';
import { PrismaService } from '../../core/prisma/prisma.service';
import { availableQuantity, CatalogPresenter, PRODUCT_FULL_INCLUDE } from '../catalog/catalog.presenter';
import { MediaService } from '../media/media.service';
import { SettingsService } from '../settings/settings.service';
import type { AddCartItemDto, UpdateCartItemDto } from './cart.dto';

/** Measurement limits for measured products (mm / cm). */
const LIMITS = { minMm: 200, maxMm: 6000, minLengthCm: 50, maxLengthCm: 2000 };
const GUEST_CART_TTL_DAYS = 30;

const ITEM_INCLUDE = {
  variant: {
    include: {
      options: { include: { value: { include: { attribute: true } } } },
      stock: { include: { location: { select: { isActive: true } } } },
      product: { include: PRODUCT_FULL_INCLUDE },
    },
  },
} satisfies Prisma.CartItemInclude;

export type CartItemFull = Prisma.CartItemGetPayload<{ include: typeof ITEM_INCLUDE }>;

export type LineIssue = 'productUnavailable' | 'outOfStock' | 'insufficientStock' | 'configurationRequired' | 'measurementsRequired' | 'sampleUnavailable';

export interface CartOwner {
  userId?: string;
  guestToken?: string;
}

@Injectable()
export class CartService {
  private readonly presenter: CatalogPresenter;

  constructor(
    private readonly prisma: PrismaService,
    private readonly crypto: CryptoService,
    private readonly settings: SettingsService,
    media: MediaService,
  ) {
    this.presenter = new CatalogPresenter(media);
  }

  async find(owner: CartOwner): Promise<Cart | null> {
    if (owner.userId) return this.prisma.cart.findFirst({ where: { userId: owner.userId, status: 'ACTIVE' } });
    if (owner.guestToken) {
      return this.prisma.cart.findFirst({ where: { guestTokenHash: this.crypto.sha256(owner.guestToken), userId: null, status: 'ACTIVE' } });
    }
    return null;
  }

  /** Returns the cart and, for a newly created guest cart, the token the client must keep. */
  async findOrCreate(owner: CartOwner): Promise<{ cart: Cart; newGuestToken?: string }> {
    const existing = await this.find(owner);
    if (existing) return { cart: existing };
    if (owner.userId) {
      try {
        return { cart: await this.prisma.cart.create({ data: { userId: owner.userId } }) };
      } catch {
        // Concurrent first add: the partial unique index guarantees a single active cart.
        return { cart: (await this.find(owner))! };
      }
    }
    const token = this.crypto.randomToken(32);
    const cart = await this.prisma.cart.create({ data: { guestTokenHash: this.crypto.sha256(token) } });
    return { cart, newGuestToken: token };
  }

  async view(owner: CartOwner) {
    const cart = await this.find(owner);
    return cart ? this.present(cart.id) : this.emptyView();
  }

  async addItem(owner: CartOwner, dto: AddCartItemDto) {
    const variant = await this.prisma.productVariant.findUnique({ where: { id: dto.variantId }, include: { ...ITEM_INCLUDE.variant.include } });
    if (!variant || !variant.isActive || variant.product.status !== 'ACTIVE' || variant.product.deletedAt) throw AppError.badRequest('productUnavailable');
    const product = variant.product;
    const limits = await this.settings.get('cart.limits');

    const isSample = dto.isSample ?? false;
    if (isSample && !product.sampleAvailable) throw AppError.badRequest('sampleUnavailable');
    if (!isSample) this.assertMeasurements(product.pricingMode, dto);
    if (dto.giftWrap && !(await this.settings.get('modules.enabled')).giftWrapping) throw AppError.badRequest('validation', { field: 'giftWrap' });

    const { cart, newGuestToken } = await this.findOrCreate(owner);
    const lines = await this.prisma.cartItem.findMany({ where: { cartId: cart.id } });
    const same = lines.find(
      (l) =>
        l.variantId === dto.variantId &&
        l.isSample === isSample &&
        (l.lengthCm ?? null) === (isSample ? null : (dto.lengthCm ?? null)) &&
        (l.widthMm ?? null) === (isSample ? null : (dto.widthMm ?? null)) &&
        (l.heightMm ?? null) === (isSample ? null : (dto.heightMm ?? null)) &&
        l.giftWrap === (dto.giftWrap ?? false),
    );
    const quantity = (same?.quantity ?? 0) + dto.quantity;
    if (quantity > (isSample ? 3 : limits.maxQuantityPerLine)) throw AppError.badRequest('cartLimit');
    if (!same && lines.length >= limits.maxLines) throw AppError.badRequest('cartLimit');
    if (!isSample) this.assertStock(product.isMadeToMeasure, availableQuantity(variant), quantity);

    if (same) {
      await this.prisma.cartItem.update({ where: { id: same.id }, data: { quantity, giftMessage: dto.giftMessage ?? same.giftMessage } });
    } else {
      await this.prisma.cartItem.create({
        data: {
          cartId: cart.id,
          variantId: dto.variantId,
          quantity,
          isSample,
          lengthCm: isSample ? null : dto.lengthCm,
          widthMm: isSample ? null : dto.widthMm,
          heightMm: isSample ? null : dto.heightMm,
          giftWrap: dto.giftWrap ?? false,
          giftMessage: dto.giftWrap ? dto.giftMessage?.trim() || null : null,
        },
      });
    }
    await this.touch(cart.id);
    return { ...(await this.present(cart.id)), ...(newGuestToken ? { cartToken: newGuestToken } : {}) };
  }

  async updateItem(owner: CartOwner, itemId: string, dto: UpdateCartItemDto) {
    const { cart, item } = await this.ownedItem(owner, itemId);
    if (dto.quantity !== undefined) {
      const limits = await this.settings.get('cart.limits');
      if (dto.quantity > (item.isSample ? 3 : limits.maxQuantityPerLine)) throw AppError.badRequest('cartLimit');
      if (!item.isSample) this.assertStock(item.variant.product.isMadeToMeasure, availableQuantity(item.variant), dto.quantity);
    }
    if (dto.giftWrap && !(await this.settings.get('modules.enabled')).giftWrapping) throw AppError.badRequest('validation', { field: 'giftWrap' });
    const giftWrap = dto.giftWrap ?? item.giftWrap;
    await this.prisma.cartItem.update({
      where: { id: itemId },
      data: {
        quantity: dto.quantity,
        giftWrap: item.isSample ? false : giftWrap,
        giftMessage: giftWrap ? (dto.giftMessage !== undefined ? dto.giftMessage.trim() || null : item.giftMessage) : null,
      },
    });
    await this.touch(cart.id);
    return this.present(cart.id);
  }

  async removeItem(owner: CartOwner, itemId: string) {
    const { cart } = await this.ownedItem(owner, itemId);
    await this.prisma.cartItem.delete({ where: { id: itemId } });
    await this.touch(cart.id);
    return this.present(cart.id);
  }

  /** After sign-in: move the guest cart's lines into the customer's cart. */
  async merge(userId: string, guestToken: string) {
    const guest = await this.find({ guestToken });
    if (!guest) return this.view({ userId });
    const { cart } = await this.findOrCreate({ userId });
    const limits = await this.settings.get('cart.limits');
    const [guestItems, userItems] = await Promise.all([
      this.prisma.cartItem.findMany({ where: { cartId: guest.id }, include: ITEM_INCLUDE }),
      this.prisma.cartItem.findMany({ where: { cartId: cart.id } }),
    ]);
    await this.prisma.$transaction(async (tx) => {
      for (const g of guestItems) {
        const match = userItems.find(
          (u) => u.variantId === g.variantId && u.isSample === g.isSample && u.lengthCm === g.lengthCm && u.widthMm === g.widthMm && u.heightMm === g.heightMm && u.giftWrap === g.giftWrap,
        );
        const cap = g.isSample ? 3 : g.variant.product.isMadeToMeasure ? limits.maxQuantityPerLine : Math.min(limits.maxQuantityPerLine, Math.max(1, availableQuantity(g.variant)));
        if (match) await tx.cartItem.update({ where: { id: match.id }, data: { quantity: Math.min(cap, match.quantity + g.quantity) } });
        else await tx.cartItem.update({ where: { id: g.id }, data: { cartId: cart.id, quantity: Math.min(cap, g.quantity) } });
      }
      await tx.cart.update({ where: { id: guest.id }, data: { status: 'MERGED' } });
    });
    await this.touch(cart.id);
    return this.present(cart.id);
  }

  /** Lightweight count for the header badge. */
  async count(owner: CartOwner): Promise<number> {
    const cart = await this.find(owner);
    if (!cart) return 0;
    const agg = await this.prisma.cartItem.aggregate({ where: { cartId: cart.id }, _sum: { quantity: true } });
    return agg._sum.quantity ?? 0;
  }

  async present(cartId: string) {
    const items = await this.prisma.cartItem.findMany({ where: { cartId }, include: ITEM_INCLUDE, orderBy: { createdAt: 'asc' } });
    const [vat, wrap, modules] = await Promise.all([this.settings.get('tax.vat'), this.settings.get('cart.giftWrap'), this.settings.get('modules.enabled')]);

    const issues = new Map<string, { issue: LineIssue; available?: number }>();
    for (const item of items) {
      const issue = this.issueOf(item);
      if (issue) issues.set(item.id, issue);
    }
    const candidates = items.filter((i) => !issues.has(i.id) || issues.get(i.id)!.issue === 'insufficientStock');
    const lines: CartLineInput[] = candidates.map((i) => ({
      id: i.id,
      pricingMode: i.variant.product.pricingMode,
      unitPrice: i.variant.price ?? i.variant.product.basePrice,
      quantity: issues.get(i.id)?.issue === 'insufficientStock' ? Math.max(1, issues.get(i.id)!.available ?? 1) : i.quantity,
      lengthCm: i.lengthCm,
      widthMm: i.widthMm,
      heightMm: i.heightMm,
      isSample: i.isSample,
      samplePrice: i.variant.product.samplePrice,
      giftWrap: i.giftWrap,
    }));

    // A line that cannot be priced (e.g. measurements missing after a product changed mode) is flagged, not fatal.
    const priceable = lines.filter((line) => {
      try {
        priceCartLineUnit(line);
        return true;
      } catch {
        issues.set(line.id, { issue: 'measurementsRequired' });
        return false;
      }
    });
    const priced = priceCart(priceable, { vatRateBp: vat.rateBp, pricesIncludeVat: vat.pricesIncludeVat, giftWrapPrice: modules.giftWrapping ? wrap.priceHalalas : null });
    const pricedById = new Map(priced.lines.map((l) => [l.id, l]));

    return {
      id: cartId,
      items: items.map((i) => {
        const p = pricedById.get(i.id);
        const card = this.presenter.card(i.variant.product);
        return {
          id: i.id,
          variantId: i.variantId,
          sku: i.variant.sku,
          product: { id: card.id, slugAr: card.slugAr, slugEn: card.slugEn, nameAr: card.nameAr, nameEn: card.nameEn, image: card.image, pricingMode: card.pricingMode, isMadeToMeasure: card.isMadeToMeasure },
          options: [...i.variant.options].sort((a, b) => a.value.attribute.sortOrder - b.value.attribute.sortOrder).map((o) => ({ attributeKey: o.value.attribute.key, nameAr: o.value.attribute.nameAr, nameEn: o.value.attribute.nameEn, labelAr: o.value.labelAr, labelEn: o.value.labelEn, swatchHex: o.value.swatchHex })),
          quantity: i.quantity,
          isSample: i.isSample,
          lengthCm: i.lengthCm,
          widthMm: i.widthMm,
          heightMm: i.heightMm,
          giftWrap: i.giftWrap,
          giftMessage: i.giftMessage,
          unitPrice: p?.unitPrice ?? null,
          billedMeasure: p?.billedMeasure ?? null,
          giftWrapTotal: p?.giftWrap ?? 0,
          lineTotal: p?.total ?? null,
          maxQuantity: i.isSample ? 3 : i.variant.product.isMadeToMeasure ? 20 : Math.min(20, availableQuantity(i.variant)),
          issue: issues.get(i.id)?.issue ?? null,
          available: issues.get(i.id)?.available,
        };
      }),
      totals: { subtotal: priced.subtotal, discount: priced.discount, giftWrap: priced.giftWrap, vat: priced.vat, net: priced.net, total: priced.total, itemCount: priced.itemCount },
      vat: { rateBp: vat.rateBp, pricesIncludeVat: vat.pricesIncludeVat },
      giftWrapPrice: modules.giftWrapping ? wrap.priceHalalas : null,
      canCheckout: items.length > 0 && issues.size === 0,
    };
  }

  /** Cart lines with their availability issues, for checkout. */
  async loadForCheckout(owner: CartOwner) {
    const cart = await this.find(owner);
    if (!cart) return null;
    const items = await this.prisma.cartItem.findMany({ where: { cartId: cart.id }, include: ITEM_INCLUDE, orderBy: { createdAt: 'asc' } });
    return { cart, items: items.map((item) => ({ item, issue: this.issueOf(item) })) };
  }

  /** Card view of a product (name, image) for order snapshots. */
  card(item: CartItemFull) {
    return this.presenter.card(item.variant.product);
  }

  /** Remove abandoned guest carts (scheduled job in a later phase; callable from ops tooling). */
  async purgeStaleGuestCarts(): Promise<number> {
    const cutoff = new Date(Date.now() - GUEST_CART_TTL_DAYS * 86_400_000);
    const { count } = await this.prisma.cart.deleteMany({ where: { userId: null, lastActivityAt: { lt: cutoff } } });
    return count;
  }

  private issueOf(item: CartItemFull): { issue: LineIssue; available?: number } | null {
    const product = item.variant.product;
    if (!item.variant.isActive || product.status !== 'ACTIVE' || product.deletedAt) return { issue: 'productUnavailable' };
    if (item.isSample) return product.sampleAvailable ? null : { issue: 'sampleUnavailable' };
    if (product.pricingMode === 'CALCULATED') return { issue: 'configurationRequired' };
    if (product.isMadeToMeasure) return null;
    const available = availableQuantity(item.variant);
    if (available <= 0) return { issue: 'outOfStock', available: 0 };
    if (available < item.quantity) return { issue: 'insufficientStock', available };
    return null;
  }

  private assertMeasurements(mode: string, dto: AddCartItemDto) {
    const inRange = (v: number | undefined) => v !== undefined && v >= LIMITS.minMm && v <= LIMITS.maxMm;
    if (mode === 'CALCULATED') throw AppError.badRequest('configurationRequired');
    if (mode === 'PER_SQM' && !(inRange(dto.widthMm) && inRange(dto.heightMm))) {
      throw AppError.badRequest('measurementsRequired', { minMm: LIMITS.minMm, maxMm: LIMITS.maxMm });
    }
    if (mode === 'PER_METER' && !(dto.lengthCm !== undefined && dto.lengthCm >= LIMITS.minLengthCm && dto.lengthCm <= LIMITS.maxLengthCm)) {
      throw AppError.badRequest('measurementsRequired', { minCm: LIMITS.minLengthCm, maxCm: LIMITS.maxLengthCm });
    }
    if (mode === 'FIXED' && (dto.widthMm || dto.heightMm || dto.lengthCm)) throw AppError.badRequest('validation', { reason: 'measurementsNotApplicable' });
  }

  private assertStock(madeToMeasure: boolean, available: number, quantity: number) {
    if (madeToMeasure) return;
    if (available <= 0) throw AppError.badRequest('outOfStock');
    if (quantity > available) throw AppError.badRequest('insufficientStock', { available });
  }

  private async ownedItem(owner: CartOwner, itemId: string) {
    const cart = await this.find(owner);
    if (!cart) throw AppError.notFound();
    const item = await this.prisma.cartItem.findFirst({ where: { id: itemId, cartId: cart.id }, include: ITEM_INCLUDE });
    if (!item) throw AppError.notFound();
    return { cart, item };
  }

  private touch(cartId: string) {
    return this.prisma.cart.update({ where: { id: cartId }, data: { lastActivityAt: new Date() } });
  }

  private emptyView() {
    return {
      id: null,
      items: [],
      totals: { subtotal: 0, discount: 0, giftWrap: 0, vat: 0, net: 0, total: 0, itemCount: 0 },
      vat: null,
      giftWrapPrice: null,
      canCheckout: false,
    };
  }
}
