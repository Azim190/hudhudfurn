import { pickLocalized, type Locale } from '@hudhud/i18n';
import { getTranslations } from 'next-intl/server';
import { Link } from '@/i18n/navigation';
import type { StoreInfo } from '@/lib/server';

type Network = keyof NonNullable<StoreInfo['social']>;

/** Display order and brand names (not translated). */
const NETWORKS: Array<{ key: Network; name: string }> = [
  { key: 'instagram', name: 'Instagram' },
  { key: 'tiktok', name: 'TikTok' },
  { key: 'x', name: 'X' },
  { key: 'facebook', name: 'Facebook' },
  { key: 'telegram', name: 'Telegram' },
];

/** Simple outline marks, drawn like the header icons (24×24, current colour). */
function NetworkIcon({ network }: { network: Network }) {
  const common = { viewBox: '0 0 24 24', 'aria-hidden': true, className: 'size-5', fill: 'none', stroke: 'currentColor', strokeWidth: 1.8, strokeLinecap: 'round', strokeLinejoin: 'round' } as const;
  switch (network) {
    case 'instagram':
      return (
        <svg {...common}>
          <rect x="3" y="3" width="18" height="18" rx="5" />
          <circle cx="12" cy="12" r="4" />
          <circle cx="17.5" cy="6.5" r="0.6" fill="currentColor" />
        </svg>
      );
    case 'tiktok':
      return (
        <svg {...common}>
          <path d="M14 3v11.5a3.5 3.5 0 1 1-3.5-3.5" />
          <path d="M14 3c.4 2.6 2.4 4.6 5 5" />
        </svg>
      );
    case 'x':
      return (
        <svg {...common}>
          <path d="M4 4l11.5 16H20L8.5 4z" />
          <path d="M20 4l-6.6 7.4M10.6 12.6 4 20" />
        </svg>
      );
    case 'facebook':
      return (
        <svg {...common}>
          <path d="M15 3h-2a4 4 0 0 0-4 4v3H7v4h2v7h4v-7h3l1-4h-4V7.5a.5.5 0 0 1 .5-.5H15z" />
        </svg>
      );
    case 'telegram':
      return (
        <svg {...common}>
          <path d="M21 4 3 11l6 2.5L11.5 20l3.2-4.2L19 19z" />
          <path d="m9 13.5 9-7.5" />
        </svg>
      );
  }
}

/** Footer with the legally required CR and VAT numbers (Saudi e-commerce law) and policy links. */
export async function SiteFooter({ locale, store }: { locale: Locale; store: StoreInfo | null }) {
  const t = await getTranslations('footer');
  const ts = await getTranslations('services');
  const storeName = store ? pickLocalized(store.name, locale) : (await getTranslations('common'))('storeName');
  const whatsapp = store?.contact.whatsapp.replace(/\D/g, '');
  // Only absolute https links from the store settings are rendered.
  const social = NETWORKS.flatMap((n) => {
    const url = store?.social?.[n.key];
    return url?.startsWith('https://') ? [{ ...n, url }] : [];
  });

  return (
    <footer className="mt-20 border-t border-sand-200 bg-white print:hidden">
      <div className="mx-auto grid max-w-7xl gap-8 px-4 py-12 sm:grid-cols-3 sm:px-6">
        <div className="space-y-2 text-sm text-ink-700">
          <p className="text-lg font-semibold text-ink-900">{storeName}</p>
          {store?.legal.commercialRegistration && (
            <p>{t('commercialRegistration', { number: store.legal.commercialRegistration })}</p>
          )}
          {store?.legal.vatNumber && <p>{t('vatNumber', { number: store.legal.vatNumber })}</p>}
        </div>
        <ul className="space-y-2 text-sm">
          {(['privacy', 'terms', 'returns', 'shipping'] as const).map((key) => (
            <li key={key}>
              <Link href={`/legal/${key}`} className="text-ink-700 hover:text-brand-700 hover:underline">
                {t(key)}
              </Link>
            </li>
          ))}
        </ul>
        <div className="flex flex-col items-start gap-3 text-sm">
          <Link href="/services/book" className="font-medium text-brand-700 hover:underline">
            {ts('bookTitle')}
          </Link>
          {whatsapp && (
            <a
              href={`https://wa.me/${whatsapp}`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 rounded-lg bg-success-600 px-4 py-2 font-medium text-white"
            >
              {t('whatsapp')}
            </a>
          )}
          {social.length > 0 && (
            <div className="mt-2">
              <p className="font-medium text-ink-900">{t('followUs')}</p>
              <ul className="mt-2 flex flex-wrap gap-2">
                {social.map((n) => (
                  <li key={n.key}>
                    <a
                      href={n.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      aria-label={t('socialLink', { store: storeName, network: n.name })}
                      title={n.name}
                      className="inline-flex size-10 items-center justify-center rounded-full border border-sand-300 text-ink-700 transition hover:border-brand-600 hover:bg-brand-600 hover:text-white"
                    >
                      <NetworkIcon network={n.key} />
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </div>
      <p className="border-t border-sand-200 py-4 text-center text-xs text-ink-500">
        {t('rights', { year: new Date().getFullYear(), store: storeName })}
      </p>
    </footer>
  );
}
