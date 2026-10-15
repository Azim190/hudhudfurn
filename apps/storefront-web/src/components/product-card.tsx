import { useLocale, useTranslations } from 'next-intl';
import { Link } from '@/i18n/navigation';
import { pick, type ProductCard as Card } from '@/lib/catalog-types';
import { Price } from './price';
import { ResponsiveImage } from './responsive-image';
import { WishlistButton } from './wishlist-button';

const MAX_SWATCHES = 5;

export function ProductCard({ product, priority = false }: { product: Card; priority?: boolean }) {
  const t = useTranslations('shop');
  const locale = useLocale();
  const name = pick(locale, product.nameAr, product.nameEn);
  const href = `/p/${encodeURIComponent(locale === 'en' ? product.slugEn : product.slugAr)}`;
  const unit = product.pricingMode === 'PER_SQM' ? t('perSqm') : product.pricingMode === 'PER_METER' ? t('perMeter') : '';

  return (
    <article className="group relative flex flex-col">
      <div className="relative aspect-[4/5] overflow-hidden rounded-card bg-sand-100">
        {product.image ? (
          <ResponsiveImage
            media={product.image}
            alt={pick(locale, product.image.altAr, product.image.altEn) || name}
            sizes="(min-width: 1024px) 25vw, (min-width: 640px) 33vw, 50vw"
            priority={priority}
            className="size-full object-cover transition duration-500 group-hover:scale-[1.03]"
          />
        ) : null}
        <div className="absolute start-2 top-2 flex flex-col items-start gap-1">
          {product.discountPercent > 0 && <span className="rounded-full bg-danger-600 px-2 py-0.5 text-xs font-semibold text-white">{t('off', { percent: product.discountPercent })}</span>}
          {product.isMadeToMeasure && <span className="rounded-full bg-white/90 px-2 py-0.5 text-xs font-medium text-brand-700">{t('madeToMeasure')}</span>}
          {!product.inStock && <span className="rounded-full bg-ink-900/80 px-2 py-0.5 text-xs font-medium text-white">{t('outOfStock')}</span>}
        </div>
        <div className="absolute end-2 top-2">
          <WishlistButton productId={product.id} productName={name} />
        </div>
      </div>
      <div className="mt-3 flex flex-1 flex-col gap-1">
        <h3 className="line-clamp-2 text-sm font-medium text-ink-900">
          {/* The whole card is clickable through this stretched link. */}
          <Link href={href} className="after:absolute after:inset-0 after:content-['']">
            {name}
          </Link>
        </h3>
        <div className="flex items-baseline gap-1 text-sm">
          {product.priceFrom && <span className="text-ink-500">{t('from')}</span>}
          <Price amount={product.price} compareAt={product.compareAtPrice} size="sm" />
          {unit && <span className="text-xs text-ink-500">{unit}</span>}
        </div>
        {product.swatches.length > 1 && (
          <ul className="mt-1 flex items-center gap-1" aria-label={product.swatches.map((s) => pick(locale, s.labelAr, s.labelEn)).join('، ')}>
            {product.swatches.slice(0, MAX_SWATCHES).map((s) => (
              <li key={s.code} className="size-4 rounded-full border border-black/10" style={{ background: s.swatchHex ?? '#ccc' }} title={pick(locale, s.labelAr, s.labelEn)} />
            ))}
            {product.swatches.length > MAX_SWATCHES && <li className="text-xs text-ink-500">{t('moreColors', { count: product.swatches.length - MAX_SWATCHES })}</li>}
          </ul>
        )}
      </div>
    </article>
  );
}

export function ProductGrid({ products, priorityCount = 0 }: { products: Card[]; priorityCount?: number }) {
  return (
    <ul className="grid grid-cols-2 gap-x-4 gap-y-8 sm:grid-cols-3 lg:grid-cols-4">
      {products.map((p, i) => (
        <li key={p.id}>
          <ProductCard product={p} priority={i < priorityCount} />
        </li>
      ))}
    </ul>
  );
}
