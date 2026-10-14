import { pickLocalized, type Locale } from '@hudhud/i18n';
import { getTranslations } from 'next-intl/server';
import { Link } from '@/i18n/navigation';
import type { StoreInfo } from '@/lib/server';

/** Footer with the legally required CR and VAT numbers (Saudi e-commerce law) and policy links. */
export async function SiteFooter({ locale, store }: { locale: Locale; store: StoreInfo | null }) {
  const t = await getTranslations('footer');
  const storeName = store ? pickLocalized(store.name, locale) : (await getTranslations('common'))('storeName');
  const whatsapp = store?.contact.whatsapp.replace(/\D/g, '');

  return (
    <footer className="mt-20 border-t border-sand-200 bg-white">
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
        <div className="text-sm">
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
        </div>
      </div>
      <p className="border-t border-sand-200 py-4 text-center text-xs text-ink-500">
        {t('rights', { year: new Date().getFullYear(), store: storeName })}
      </p>
    </footer>
  );
}
