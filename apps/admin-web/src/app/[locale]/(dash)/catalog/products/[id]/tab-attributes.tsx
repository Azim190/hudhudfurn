'use client';

import { Button, Card, Checkbox } from '@hudhud/ui';
import { useLocale, useTranslations } from 'next-intl';
import { useState } from 'react';
import { adminCall } from '@/lib/admin-client';
import type { AdminProduct } from '@/lib/catalog-types';
import type { EditorContext } from './product-editor';

export function AttributesTab({ ctx }: { ctx: EditorContext }) {
  const t = useTranslations('catalog');
  const locale = useLocale();
  const p = ctx.product;
  const [selected, setSelected] = useState(() => new Set(p.attributeValueIds));
  const attributes = p.categoryAttributes.filter((a) => !a.isVariantAxis);
  const pick = (ar: string, en: string | null) => (locale === 'en' ? en || ar : ar);

  // Products may carry several values of one attribute (e.g. the heading styles they are offered in).
  const toggle = (id: string, on: boolean) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (on) next.add(id);
      else next.delete(id);
      return next;
    });

  if (attributes.length === 0) return <p className="text-ink-500">{t('noAttributes')}</p>;

  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm text-ink-500">{t('attributesHint')}</p>
      <div className="grid gap-4 md:grid-cols-2">
        {attributes.map((a) => (
          <Card key={a.attributeId} className="p-5">
            <fieldset disabled={!ctx.canWrite}>
              <legend className="mb-3 text-sm font-semibold">{pick(a.nameAr, a.nameEn)}</legend>
              <div className="flex flex-wrap gap-x-5 gap-y-2">
                {a.values.map((v) => (
                  <Checkbox key={v.id} label={pick(v.labelAr, v.labelEn)} checked={selected.has(v.id)} onChange={(e) => toggle(v.id, e.target.checked)} />
                ))}
              </div>
            </fieldset>
          </Card>
        ))}
      </div>
      {ctx.canWrite && (
        <div>
          <Button
            loading={ctx.busy}
            onClick={() => ctx.mutate(() => adminCall<AdminProduct>(`/products/${p.id}`, 'PATCH', { attributeValueIds: [...selected] }, locale), t('saved'))}
          >
            {t('save')}
          </Button>
        </div>
      )}
    </div>
  );
}
