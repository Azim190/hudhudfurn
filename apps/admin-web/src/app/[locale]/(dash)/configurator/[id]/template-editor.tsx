'use client';

import { DEFAULT_CONSTANTS, DEFAULT_FORMULAS, FORMULA_VARIABLES, PRICE_BASES, type ConfiguratorKind } from '@hudhud/domain';
import { Alert, Button, Card, Checkbox, Field, TextAreaField } from '@hudhud/ui';
import { useLocale, useTranslations } from 'next-intl';
import { useState } from 'react';
import { Link } from '@/i18n/navigation';
import { adminCall, halalasToSar, sarToHalalas } from '@/lib/admin-client';

interface Heading {
  id: string;
  code: string;
  nameAr: string;
  nameEn: string;
  fullnessMin: number;
  fullnessMax: number;
  fullnessDefault: number;
  makingCostPerM: number;
  isActive: boolean;
}

interface Option {
  id: string;
  group: string;
  code: string;
  nameAr: string;
  nameEn: string;
  priceBasis: (typeof PRICE_BASES)[number];
  price: number;
  isDefault: boolean;
  isActive: boolean;
}

export interface AdminTemplate {
  id: string;
  code: string;
  kind: ConfiguratorKind;
  nameAr: string;
  nameEn: string;
  version: number;
  isActive: boolean;
  constants: Record<string, number>;
  formulas: Record<string, string>;
  headingStyles: Heading[];
  options: Option[];
}

const SAMPLE_INPUTS: Record<ConfiguratorKind, object> = {
  CURTAIN: { widthMm: 3000, heightMm: 2600, panels: 2, headingStyle: 'WAVE' },
  BLIND: { widthMm: 1200, heightMm: 1500 },
  ABAYA: { measurements: { length: 1450, chest: 1000, shoulder: 400, sleeve: 600 } },
  SOFA_COVER: { pieces: [{ code: 'SEAT_3', quantity: 1, widthMm: 2200, depthMm: 900, heightMm: 850 }], photoIds: ['00000000-0000-4000-8000-000000000000'] },
};

export function TemplateEditor({ initial, canWrite }: { initial: AdminTemplate; canWrite: boolean }) {
  const t = useTranslations('admin');
  const locale = useLocale();
  const [tpl, setTpl] = useState(initial);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const kind = tpl.kind;
  const defaults = DEFAULT_CONSTANTS[kind];
  const [constants, setConstants] = useState<Record<string, string>>(Object.fromEntries(Object.keys(defaults).map((k) => [k, tpl.constants[k] !== undefined ? String(tpl.constants[k]) : ''])));
  const [formulas, setFormulas] = useState<Record<string, string>>({ ...tpl.formulas });
  const [meta, setMeta] = useState({ nameAr: tpl.nameAr, nameEn: tpl.nameEn, isActive: tpl.isActive });

  const run = async (fn: () => Promise<unknown>) => {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      await fn();
      setTpl(await adminCall<AdminTemplate>(`/configurator/templates/${tpl.id}`, 'GET', undefined, locale));
      setNotice(t('saved'));
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  const saveRules = () =>
    run(() =>
      adminCall(
        `/configurator/templates/${tpl.id}`,
        'PATCH',
        {
          ...meta,
          constants: Object.fromEntries(Object.entries(constants).filter(([, v]) => v.trim() !== '').map(([k, v]) => [k, Number(v)])),
          formulas: Object.fromEntries(Object.entries(formulas).filter(([, v]) => v.trim() !== '')),
        },
        locale,
      ),
    );

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-6">
      <div>
        <Link href="/configurator" className="text-sm text-brand-700 hover:underline">
          {t('configurator')}
        </Link>
        <h1 className="mt-1 text-2xl font-bold">
          {locale === 'en' ? tpl.nameEn : tpl.nameAr} <span className="text-base font-normal text-ink-500">· {tpl.kind} · v{tpl.version}</span>
        </h1>
      </div>
      {error && <Alert>{error}</Alert>}
      {notice && <Alert tone="success">{notice}</Alert>}

      <Card className="flex flex-col gap-4 p-5">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={`${t('name')} (AR)`} value={meta.nameAr} onChange={(e) => setMeta({ ...meta, nameAr: e.target.value })} disabled={!canWrite} />
          <Field label={`${t('name')} (EN)`} value={meta.nameEn} onChange={(e) => setMeta({ ...meta, nameEn: e.target.value })} disabled={!canWrite} ltr />
        </div>
        <Checkbox label={t('active')} checked={meta.isActive} onChange={(e) => setMeta({ ...meta, isActive: e.target.checked })} disabled={!canWrite} />

        <h2 className="text-lg font-semibold">{t('constants')}</h2>
        <p className="text-xs text-ink-500">{t('constantsHint')}</p>
        <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {Object.keys(defaults).map((k) => (
            <Field key={k} label={k} placeholder={String(defaults[k])} value={constants[k] ?? ''} onChange={(e) => setConstants({ ...constants, [k]: e.target.value })} inputMode="decimal" ltr disabled={!canWrite} />
          ))}
        </div>

        {Object.keys(DEFAULT_FORMULAS[kind]).length > 0 && (
          <>
            <h2 className="text-lg font-semibold">{t('formulas')}</h2>
            <p className="text-xs text-ink-500">{t('formulasHint', { variables: [...FORMULA_VARIABLES[kind], ...Object.keys(defaults), ...Object.keys(DEFAULT_FORMULAS[kind])].join(', ') })}</p>
            {Object.entries(DEFAULT_FORMULAS[kind]).map(([k, def]) => (
              <TextAreaField key={k} label={k} rows={2} placeholder={def} value={formulas[k] ?? ''} onChange={(e) => setFormulas({ ...formulas, [k]: e.target.value })} dir="ltr" className="font-mono text-sm" disabled={!canWrite} />
            ))}
          </>
        )}
        {canWrite && (
          <Button className="self-start" loading={busy} onClick={saveRules}>
            {t('save')}
          </Button>
        )}
      </Card>

      {kind === 'CURTAIN' && <HeadingTable tpl={tpl} canWrite={canWrite} busy={busy} run={run} />}
      <OptionTable tpl={tpl} canWrite={canWrite} busy={busy} run={run} />
      <Simulator tpl={tpl} />
    </div>
  );
}

type RunFn = (fn: () => Promise<unknown>) => Promise<void>;

function HeadingTable({ tpl, canWrite, busy, run }: { tpl: AdminTemplate; canWrite: boolean; busy: boolean; run: RunFn }) {
  const t = useTranslations('admin');
  const locale = useLocale();
  const blank = { code: '', nameAr: '', nameEn: '', fullnessMin: '2', fullnessDefault: '2.2', fullnessMax: '2.5', makingCostPerM: '0' };
  const [draft, setDraft] = useState(blank);
  const body = (h: typeof blank) => ({
    code: h.code.toUpperCase(),
    nameAr: h.nameAr,
    nameEn: h.nameEn,
    fullnessMin: Math.round(Number(h.fullnessMin) * 100),
    fullnessDefault: Math.round(Number(h.fullnessDefault) * 100),
    fullnessMax: Math.round(Number(h.fullnessMax) * 100),
    makingCostPerM: sarToHalalas(h.makingCostPerM) ?? 0,
  });
  return (
    <Card className="overflow-x-auto p-5">
      <h2 className="text-lg font-semibold">{t('headingStyles')}</h2>
      <table className="mt-3 w-full text-sm">
        <thead className="text-xs text-ink-500">
          <tr>
            {[t('code'), t('name'), t('fullnessMinMax'), t('makingCost'), ''].map((h, i) => (
              <th key={i} className="px-2 py-2 text-start font-medium">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {tpl.headingStyles.map((h) => (
            <HeadingRow key={`${h.id}-${tpl.version}`} h={h} canWrite={canWrite} busy={busy} onSave={(v) => run(() => adminCall(`/configurator/heading-styles/${h.id}`, 'PATCH', body({ ...v, code: h.code }), locale))} />
          ))}
          {canWrite && (
            <tr className="border-t border-sand-200">
              <td className="px-2 py-2">
                <input aria-label={t('code')} value={draft.code} onChange={(e) => setDraft({ ...draft, code: e.target.value })} className="h-9 w-28 rounded-lg border border-sand-300 px-2" dir="ltr" />
              </td>
              <td className="px-2 py-2">
                <input aria-label="AR" value={draft.nameAr} onChange={(e) => setDraft({ ...draft, nameAr: e.target.value })} className="h-9 w-28 rounded-lg border border-sand-300 px-2" />
                <input aria-label="EN" value={draft.nameEn} onChange={(e) => setDraft({ ...draft, nameEn: e.target.value })} className="ms-1 h-9 w-28 rounded-lg border border-sand-300 px-2" dir="ltr" />
              </td>
              <td className="px-2 py-2">
                {(['fullnessMin', 'fullnessDefault', 'fullnessMax'] as const).map((k) => (
                  <input key={k} aria-label={k} value={draft[k]} onChange={(e) => setDraft({ ...draft, [k]: e.target.value })} className="me-1 h-9 w-14 rounded-lg border border-sand-300 px-2" dir="ltr" />
                ))}
              </td>
              <td className="px-2 py-2">
                <input aria-label={t('makingCost')} value={draft.makingCostPerM} onChange={(e) => setDraft({ ...draft, makingCostPerM: e.target.value })} className="h-9 w-20 rounded-lg border border-sand-300 px-2" dir="ltr" />
              </td>
              <td className="px-2 py-2">
                <Button size="sm" disabled={busy || !draft.code} onClick={() => run(() => adminCall(`/configurator/templates/${tpl.id}/heading-styles`, 'POST', body(draft), locale)).then(() => setDraft(blank))}>
                  {t('add')}
                </Button>
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </Card>
  );
}

function HeadingRow({ h, canWrite, busy, onSave }: { h: Heading; canWrite: boolean; busy: boolean; onSave: (v: { code: string; nameAr: string; nameEn: string; fullnessMin: string; fullnessDefault: string; fullnessMax: string; makingCostPerM: string }) => void }) {
  const t = useTranslations('admin');
  const [v, setV] = useState({ code: h.code, nameAr: h.nameAr, nameEn: h.nameEn, fullnessMin: String(h.fullnessMin / 100), fullnessDefault: String(h.fullnessDefault / 100), fullnessMax: String(h.fullnessMax / 100), makingCostPerM: halalasToSar(h.makingCostPerM) });
  return (
    <tr className="border-t border-sand-100">
      <td className="px-2 py-2 font-mono text-xs" dir="ltr">
        <span className="block text-start">{h.code}</span>
      </td>
      <td className="px-2 py-2">
        <input aria-label="AR" value={v.nameAr} onChange={(e) => setV({ ...v, nameAr: e.target.value })} className="h-9 w-28 rounded-lg border border-sand-300 px-2" disabled={!canWrite} />
        <input aria-label="EN" value={v.nameEn} onChange={(e) => setV({ ...v, nameEn: e.target.value })} className="ms-1 h-9 w-28 rounded-lg border border-sand-300 px-2" dir="ltr" disabled={!canWrite} />
      </td>
      <td className="px-2 py-2">
        {(['fullnessMin', 'fullnessDefault', 'fullnessMax'] as const).map((k) => (
          <input key={k} aria-label={`${h.code} ${k}`} value={v[k]} onChange={(e) => setV({ ...v, [k]: e.target.value })} className="me-1 h-9 w-14 rounded-lg border border-sand-300 px-2" dir="ltr" disabled={!canWrite} />
        ))}
      </td>
      <td className="px-2 py-2">
        <input aria-label={`${h.code} ${t('makingCost')}`} value={v.makingCostPerM} onChange={(e) => setV({ ...v, makingCostPerM: e.target.value })} className="h-9 w-20 rounded-lg border border-sand-300 px-2" dir="ltr" disabled={!canWrite} />
      </td>
      <td className="px-2 py-2">
        {canWrite && (
          <Button size="sm" variant="secondary" disabled={busy} onClick={() => onSave(v)}>
            {t('save')}
          </Button>
        )}
      </td>
    </tr>
  );
}

function OptionTable({ tpl, canWrite, busy, run }: { tpl: AdminTemplate; canWrite: boolean; busy: boolean; run: RunFn }) {
  const t = useTranslations('admin');
  const locale = useLocale();
  const blank = { group: '', code: '', nameAr: '', nameEn: '', priceBasis: 'FLAT' as Option['priceBasis'], price: '0', isDefault: false };
  const [draft, setDraft] = useState(blank);
  return (
    <Card className="overflow-x-auto p-5">
      <h2 className="text-lg font-semibold">{t('options')}</h2>
      <table className="mt-3 w-full text-sm">
        <thead className="text-xs text-ink-500">
          <tr>
            {[t('group'), t('code'), t('name'), t('priceBasis'), t('price'), t('default'), t('active'), ''].map((h, i) => (
              <th key={i} className="px-2 py-2 text-start font-medium">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {tpl.options.map((o) => (
            <OptionRow key={`${o.id}-${tpl.version}`} o={o} canWrite={canWrite} busy={busy} onSave={(patch) => run(() => adminCall(`/configurator/options/${o.id}`, 'PATCH', patch, locale))} />
          ))}
          {canWrite && (
            <tr className="border-t border-sand-200">
              <td className="px-2 py-2">
                <input aria-label={t('group')} value={draft.group} onChange={(e) => setDraft({ ...draft, group: e.target.value.toUpperCase() })} className="h-9 w-28 rounded-lg border border-sand-300 px-2" dir="ltr" />
              </td>
              <td className="px-2 py-2">
                <input aria-label={t('code')} value={draft.code} onChange={(e) => setDraft({ ...draft, code: e.target.value.toUpperCase() })} className="h-9 w-28 rounded-lg border border-sand-300 px-2" dir="ltr" />
              </td>
              <td className="px-2 py-2">
                <input aria-label="AR" value={draft.nameAr} onChange={(e) => setDraft({ ...draft, nameAr: e.target.value })} className="h-9 w-28 rounded-lg border border-sand-300 px-2" />
                <input aria-label="EN" value={draft.nameEn} onChange={(e) => setDraft({ ...draft, nameEn: e.target.value })} className="ms-1 h-9 w-28 rounded-lg border border-sand-300 px-2" dir="ltr" />
              </td>
              <td className="px-2 py-2">
                <select aria-label={t('priceBasis')} value={draft.priceBasis} onChange={(e) => setDraft({ ...draft, priceBasis: e.target.value as Option['priceBasis'] })} className="h-9 rounded-lg border border-sand-300 px-1">
                  {PRICE_BASES.map((b) => (
                    <option key={b}>{b}</option>
                  ))}
                </select>
              </td>
              <td className="px-2 py-2">
                <input aria-label={t('price')} value={draft.price} onChange={(e) => setDraft({ ...draft, price: e.target.value })} className="h-9 w-20 rounded-lg border border-sand-300 px-2" dir="ltr" />
              </td>
              <td className="px-2 py-2">
                <input type="checkbox" aria-label={t('default')} checked={draft.isDefault} onChange={(e) => setDraft({ ...draft, isDefault: e.target.checked })} />
              </td>
              <td />
              <td className="px-2 py-2">
                <Button
                  size="sm"
                  disabled={busy || !draft.group || !draft.code}
                  onClick={() => run(() => adminCall(`/configurator/templates/${tpl.id}/options`, 'POST', { ...draft, price: sarToHalalas(draft.price) ?? 0 }, locale)).then(() => setDraft(blank))}
                >
                  {t('add')}
                </Button>
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </Card>
  );
}

function OptionRow({ o, canWrite, busy, onSave }: { o: Option; canWrite: boolean; busy: boolean; onSave: (patch: Record<string, unknown>) => void }) {
  const t = useTranslations('admin');
  const [v, setV] = useState({ nameAr: o.nameAr, nameEn: o.nameEn, priceBasis: o.priceBasis, price: halalasToSar(o.price) || '0', isDefault: o.isDefault, isActive: o.isActive });
  return (
    <tr className="border-t border-sand-100">
      <td className="px-2 py-2 font-mono text-xs" dir="ltr">
        <span className="block text-start">{o.group}</span>
      </td>
      <td className="px-2 py-2 font-mono text-xs" dir="ltr">
        <span className="block text-start">{o.code}</span>
      </td>
      <td className="px-2 py-2">
        <input aria-label="AR" value={v.nameAr} onChange={(e) => setV({ ...v, nameAr: e.target.value })} className="h-9 w-32 rounded-lg border border-sand-300 px-2" disabled={!canWrite} />
        <input aria-label="EN" value={v.nameEn} onChange={(e) => setV({ ...v, nameEn: e.target.value })} className="ms-1 h-9 w-32 rounded-lg border border-sand-300 px-2" dir="ltr" disabled={!canWrite} />
      </td>
      <td className="px-2 py-2">
        <select aria-label={t('priceBasis')} value={v.priceBasis} onChange={(e) => setV({ ...v, priceBasis: e.target.value as Option['priceBasis'] })} className="h-9 rounded-lg border border-sand-300 px-1" disabled={!canWrite}>
          {PRICE_BASES.map((b) => (
            <option key={b}>{b}</option>
          ))}
        </select>
      </td>
      <td className="px-2 py-2">
        <input aria-label={`${o.code} ${t('price')}`} value={v.price} onChange={(e) => setV({ ...v, price: e.target.value })} className="h-9 w-20 rounded-lg border border-sand-300 px-2" dir="ltr" disabled={!canWrite} />
      </td>
      <td className="px-2 py-2">
        <input type="checkbox" aria-label={t('default')} checked={v.isDefault} onChange={(e) => setV({ ...v, isDefault: e.target.checked })} disabled={!canWrite} />
      </td>
      <td className="px-2 py-2">
        <input type="checkbox" aria-label={t('active')} checked={v.isActive} onChange={(e) => setV({ ...v, isActive: e.target.checked })} disabled={!canWrite} />
      </td>
      <td className="px-2 py-2">
        {canWrite && (
          <Button size="sm" variant="secondary" disabled={busy} onClick={() => onSave({ ...v, price: sarToHalalas(v.price) ?? 0 })}>
            {t('save')}
          </Button>
        )}
      </td>
    </tr>
  );
}

function Simulator({ tpl }: { tpl: AdminTemplate }) {
  const t = useTranslations('admin');
  const locale = useLocale();
  const [inputs, setInputs] = useState(JSON.stringify(SAMPLE_INPUTS[tpl.kind], null, 2));
  const [basePrice, setBasePrice] = useState('89');
  const [result, setResult] = useState<{ valid: boolean; total: number; issues: unknown[]; lines: Array<{ key: string; nameEn: string; nameAr: string; quantity: number; unit: string; amount: number }>; specs: Record<string, unknown> } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const simulate = async () => {
    setError(null);
    try {
      setResult(await adminCall(`/configurator/templates/${tpl.id}/simulate`, 'POST', { inputs: JSON.parse(inputs), basePrice: sarToHalalas(basePrice) ?? 0 }, locale));
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };
  return (
    <Card className="grid gap-4 p-5 lg:grid-cols-2">
      <div className="flex flex-col gap-3">
        <h2 className="text-lg font-semibold">{t('simulate')}</h2>
        <TextAreaField label={t('simulateInputs')} rows={8} value={inputs} onChange={(e) => setInputs(e.target.value)} dir="ltr" className="font-mono text-xs" />
        <Field label={t('basePrice')} value={basePrice} onChange={(e) => setBasePrice(e.target.value)} inputMode="decimal" ltr />
        <Button className="self-start" variant="secondary" onClick={simulate}>
          {t('run')}
        </Button>
        {error && <Alert>{error}</Alert>}
      </div>
      {result && (
        <div className="flex flex-col gap-2 text-sm" data-testid="simulation">
          {!result.valid && <pre className="overflow-x-auto rounded-lg bg-danger-50 p-3 text-xs text-danger-600" dir="ltr">{JSON.stringify(result.issues, null, 2)}</pre>}
          {result.lines.map((l) => (
            <div key={l.key} className="flex justify-between">
              <span>
                {locale === 'en' ? l.nameEn : l.nameAr} <span className="text-xs text-ink-500">({l.quantity} {l.unit})</span>
              </span>
              <span dir="ltr">{(l.amount / 100).toFixed(2)}</span>
            </div>
          ))}
          <div className="flex justify-between border-t border-sand-200 pt-2 font-semibold">
            <span>{t('total')}</span>
            <span dir="ltr">{(result.total / 100).toFixed(2)} SAR</span>
          </div>
          <h3 className="mt-2 font-semibold">{t('workshopSpec')}</h3>
          <pre className="overflow-x-auto rounded-lg bg-sand-100 p-3 text-xs" dir="ltr">
            {JSON.stringify(result.specs, null, 2)}
          </pre>
        </div>
      )}
    </Card>
  );
}
