'use client';

import { Alert, Button, Card, Spinner, cn } from '@hudhud/ui';
import { useLocale, useTranslations } from 'next-intl';
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { usePriceFormatter } from '@/components/price';
import { Link } from '@/i18n/navigation';
import { pick } from '@/lib/catalog-types';
import { announceCartCount } from '@/lib/shop-store';
import { CurtainPreview } from './curtain-preview';
import { MULTI_GROUPS, SINGLE_GROUPS, type ConfiguratorData, type Inputs, type Piece, type Quote, type TemplateOption } from './types';

type Unit = 'cm' | 'in';
const MM_PER = { cm: 10, in: 25.4 } as const;
const toMm = (v: string, unit: Unit) => {
  const n = Number(v.replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x0660)).replace('٫', '.'));
  return v.trim() && Number.isFinite(n) && n > 0 ? Math.round(n * MM_PER[unit]) : undefined;
};
const fromMm = (mm: number, unit: Unit) => Math.round((mm / MM_PER[unit]) * 10) / 10;
const ABAYA_FIELDS = ['length', 'chest', 'shoulder', 'sleeve'] as const;

interface Props {
  productId: string;
  productName: string;
  variantId: string | undefined;
  swatchHex: string | null;
  whatsapp: string;
  productUrl: string;
  signedIn: boolean;
}

export function Configurator({ productId, productName, variantId, swatchHex, whatsapp, productUrl, signedIn }: Props) {
  const t = useTranslations('configurator');
  const ts = useTranslations('shop');
  const locale = useLocale();
  const format = usePriceFormatter();
  const [data, setData] = useState<ConfiguratorData | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [unit, setUnit] = useState<Unit>('cm');
  const [size, setSize] = useState({ width: '', height: '' });
  const [panels, setPanels] = useState(2);
  const [heading, setHeading] = useState<string | undefined>();
  const [fullness, setFullness] = useState<number | undefined>();
  const [choices, setChoices] = useState<Record<string, string>>({});
  const [extras, setExtras] = useState<string[]>([]);
  const [measures, setMeasures] = useState<Record<string, string>>({});
  const [pieces, setPieces] = useState<Array<{ code: string; quantity: number; width: string; depth: string; height: string }>>([]);
  const [photos, setPhotos] = useState<Array<{ id: string; url: string }>>([]);
  const [uploading, setUploading] = useState(false);
  const [notes, setNotes] = useState('');
  const [quantity, setQuantity] = useState(1);
  const [quote, setQuote] = useState<Quote | null>(null);
  const [quoting, setQuoting] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ tone: 'success' | 'danger'; text: string; cart?: boolean } | null>(null);
  const touched = useRef(new Set<string>());
  const [, setTouchTick] = useState(0);

  useEffect(() => {
    fetch(`/bff/configurator/products/${productId}`, { headers: { 'X-HD-Locale': locale } })
      .then(async (r) => {
        const json = await r.json();
        if (!r.ok) throw new Error(json.message ?? r.statusText);
        const d = json as ConfiguratorData;
        setData(d);
        setHeading(d.template.headingStyles[0]?.code);
        const firstPiece = d.template.options.find((o) => o.group === 'PIECE');
        if (firstPiece) setPieces([{ code: firstPiece.code, quantity: 1, width: '', depth: '', height: '' }]);
      })
      .catch((err) => setLoadError(err instanceof Error ? err.message : String(err)));
  }, [productId, locale]);

  const kind = data?.template.kind;
  const groups = useMemo(() => {
    const map = new Map<string, TemplateOption[]>();
    for (const o of data?.template.options ?? []) map.set(o.group, [...(map.get(o.group) ?? []), o]);
    return map;
  }, [data]);
  const headingDef = data?.template.headingStyles.find((h) => h.code === heading);

  const inputs: Inputs = useMemo(() => {
    const base: Inputs = { choices, extras, notes: notes.trim() || undefined };
    if (kind === 'CURTAIN' || kind === 'BLIND') Object.assign(base, { widthMm: toMm(size.width, unit), heightMm: toMm(size.height, unit) });
    if (kind === 'CURTAIN') Object.assign(base, { panels, headingStyle: heading, fullness });
    if (kind === 'ABAYA') base.measurements = Object.fromEntries(ABAYA_FIELDS.map((k) => [k, toMm(measures[k] ?? '', 'cm')]).filter(([, v]) => v !== undefined));
    if (kind === 'SOFA_COVER') {
      base.pieces = pieces.map((p): Piece => ({ code: p.code, quantity: p.quantity, widthMm: toMm(p.width, unit), depthMm: toMm(p.depth, unit), heightMm: toMm(p.height, unit) }));
      base.photoIds = photos.map((p) => p.id);
    }
    return base;
  }, [kind, choices, extras, notes, size, unit, panels, heading, fullness, measures, pieces, photos]);

  useEffect(() => {
    if (!data || !variantId) return;
    const ctrl = new AbortController();
    const timer = setTimeout(async () => {
      setQuoting(true);
      try {
        const res = await fetch('/bff/configurator/quote', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-HD-Locale': locale }, body: JSON.stringify({ productId, variantId, inputs }), signal: ctrl.signal });
        if (res.ok) setQuote((await res.json()) as Quote);
      } catch {
        // superseded or offline; the next change retries
      } finally {
        if (!ctrl.signal.aborted) setQuoting(false);
      }
    }, 300);
    return () => {
      clearTimeout(timer);
      ctrl.abort();
    };
  }, [data, variantId, inputs, productId, locale]);

  if (loadError) return <Alert>{loadError}</Alert>;
  if (!data || !kind) {
    return (
      <div className="flex justify-center py-8" role="status" aria-label={t('loading')}>
        <Spinner className="size-6 text-brand-600" />
      </div>
    );
  }

  const unitLabel = unit === 'cm' ? t('cm') : t('in');
  const issueFor = (field: string) => {
    if (!touched.current.has(field)) return null;
    const issue = quote?.issues.find((i) => i.field === field);
    if (!issue) return null;
    const mmParams = /Mm$|^(widthMm|heightMm)$/.test(field) || field.startsWith('measurements.') || /pieces\.\d+\.(width|depth|height)Mm/.test(field);
    const u: Unit = field.startsWith('measurements.') ? 'cm' : unit;
    const params = Object.fromEntries(Object.entries(issue.params ?? {}).map(([k, v]) => [k, mmParams && typeof v === 'number' ? fromMm(v, u) : v]));
    return t(`issue_${issue.code}` as 'issue_range', { min: '', max: '', unit: u === 'cm' ? t('cm') : t('in'), ...params });
  };
  const touch = (field: string) => {
    touched.current.add(field);
    setTouchTick((n) => n + 1);
  };
  const choose = (group: string, code: string) => setChoices((c) => ({ ...c, [group]: code }));
  const toggleExtra = (code: string) => setExtras((e) => (e.includes(code) ? e.filter((x) => x !== code) : [...e, code]));
  const priceHint = (o: TemplateOption) => (o.price === 0 ? t('included') : t(`basis_${o.priceBasis}`, { price: format(o.price) }));

  async function uploadPhotos(files: FileList | null) {
    if (!files?.length) return;
    setUploading(true);
    setMessage(null);
    try {
      for (const file of [...files].slice(0, 8 - photos.length)) {
        const form = new FormData();
        form.append('file', file);
        const res = await fetch('/bff/configurator/uploads', { method: 'POST', body: form, headers: { 'X-HD-Locale': locale } });
        const json = await res.json();
        if (!res.ok) throw new Error(json.message ?? res.statusText);
        setPhotos((p) => [...p, { id: json.id, url: URL.createObjectURL(file) }]);
      }
      touch('photoIds');
    } catch (err) {
      setMessage({ tone: 'danger', text: err instanceof Error ? err.message : String(err) });
    } finally {
      setUploading(false);
    }
  }

  async function addToCart() {
    if (!variantId) return;
    setBusy(true);
    setMessage(null);
    try {
      // Price the current inputs now (the live quote may still be debouncing), then show every remaining problem.
      const qr = await fetch('/bff/configurator/quote', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-HD-Locale': locale }, body: JSON.stringify({ productId, variantId, inputs }) });
      const fresh = (await qr.json()) as Quote & { message?: string };
      if (!qr.ok) throw new Error(fresh.message ?? qr.statusText);
      setQuote(fresh);
      for (const i of fresh.issues) touched.current.add(i.field);
      if (!fresh.valid) {
        setMessage({ tone: 'danger', text: t('fixErrors') });
        return;
      }
      const res = await fetch('/bff/cart/items', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-HD-Locale': locale }, body: JSON.stringify({ variantId, quantity, configuration: { inputs } }) });
      const json = await res.json();
      if (!res.ok) throw new Error(json.message ?? res.statusText);
      announceCartCount(json.totals?.itemCount ?? 0);
      setMessage({ tone: 'success', text: ts('added'), cart: true });
    } catch (err) {
      setMessage({ tone: 'danger', text: err instanceof Error ? err.message : String(err) });
    } finally {
      setBusy(false);
    }
  }

  const waNumber = whatsapp.replace(/\D/g, '');
  const visitHref = waNumber ? `https://wa.me/${waNumber}?text=${encodeURIComponent(t('bookVisitMessage', { name: productName, url: productUrl }))}` : null;
  const singleGroups = SINGLE_GROUPS.filter((g) => groups.has(g) && (groups.get(g)!.length > 1 || groups.get(g)![0]!.price > 0));
  const multiGroups = MULTI_GROUPS.filter((g) => groups.has(g));
  let step = 0;
  const stepTitle = (key: string) => `${++step}. ${t(key as 'step_size')}`;

  return (
    <div className="flex flex-col gap-4" data-testid="configurator">
      <h2 className="text-lg font-semibold">{pick(locale, data.template.nameAr, data.template.nameEn)}</h2>

      {(kind === 'CURTAIN' || kind === 'BLIND' || kind === 'SOFA_COVER') && (
        <div className="flex items-center gap-2 text-sm" role="radiogroup" aria-label={t('unit')}>
          <span className="text-ink-700">{t('unit')}:</span>
          {(['cm', 'in'] as const).map((u) => (
            <button key={u} type="button" role="radio" aria-checked={unit === u} onClick={() => setUnit(u)} className={cn('rounded-lg border px-3 py-1', unit === u ? 'border-brand-600 bg-brand-50 font-medium text-brand-700' : 'border-sand-300 bg-white')}>
              {u === 'cm' ? t('cm') : t('in')}
            </button>
          ))}
        </div>
      )}

      {(kind === 'CURTAIN' || kind === 'BLIND') && (
        <Step title={stepTitle('step_size')}>
          <div className="grid grid-cols-2 gap-3">
            <NumberField label={`${t('width')} (${unitLabel})`} value={size.width} onChange={(width) => setSize({ ...size, width })} onBlur={() => touch('widthMm')} error={issueFor('widthMm')} />
            <NumberField label={`${t('height')} (${unitLabel})`} value={size.height} onChange={(height) => setSize({ ...size, height })} onBlur={() => touch('heightMm')} error={issueFor('heightMm')} />
          </div>
          <details className="text-sm">
            <summary className="cursor-pointer font-medium text-brand-700">{ts('howToMeasure')}</summary>
            <ol className="mt-2 list-decimal ps-5 text-ink-700">
              {(kind === 'CURTAIN' ? ['measureCurtain1', 'measureCurtain2', 'measureCurtain3'] : ['measureBlind1', 'measureBlind2', 'measureBlind3']).map((k) => (
                <li key={k}>{t(k as 'measureCurtain1')}</li>
              ))}
            </ol>
          </details>
        </Step>
      )}

      {kind === 'CURTAIN' && (
        <Step title={stepTitle('step_panels')}>
          <div role="radiogroup" aria-label={t('panels')} className="flex flex-wrap gap-2">
            {[1, 2].map((n) => (
              <Pill key={n} on={panels === n} onClick={() => setPanels(n)}>
                {t(n === 1 ? 'panelSingle' : 'panelPair')}
              </Pill>
            ))}
            <Pill on={panels > 2} onClick={() => setPanels(3)}>
              {t('panelCustom')}
            </Pill>
          </div>
          {panels > 2 && <NumberField label={t('panelsCount')} value={String(panels)} onChange={(v) => setPanels(Math.max(3, Math.min(8, Number(v) || 3)))} error={issueFor('panels')} />}
        </Step>
      )}

      {kind === 'CURTAIN' && data.template.headingStyles.length > 0 && (
        <Step title={stepTitle('step_heading')}>
          <div role="radiogroup" aria-label={t('group_HEADING')} className="grid grid-cols-2 gap-2">
            {data.template.headingStyles.map((h) => (
              <Choice key={h.code} on={heading === h.code} onClick={() => (setHeading(h.code), setFullness(undefined))} title={pick(locale, h.nameAr, h.nameEn)} hint={t('fullnessRange', { min: h.fullnessMin, max: h.fullnessMax })} />
            ))}
          </div>
          {headingDef && headingDef.fullnessMax > headingDef.fullnessMin && (
            <label className="flex flex-col gap-1 text-sm">
              <span>
                {t('fullness')}: <strong dir="ltr">{(fullness ?? headingDef.fullnessDefault).toFixed(1)}×</strong>
              </span>
              <input type="range" min={headingDef.fullnessMin} max={headingDef.fullnessMax} step={0.1} value={fullness ?? headingDef.fullnessDefault} onChange={(e) => setFullness(Number(e.target.value))} className="accent-brand-600" />
              <span className="text-xs text-ink-500">{t('fullnessHint')}</span>
            </label>
          )}
        </Step>
      )}

      {kind === 'ABAYA' && (
        <Step title={stepTitle('step_measurements')}>
          {signedIn && <ProfilePicker onPick={(m) => setMeasures(Object.fromEntries(Object.entries(m).map(([k, v]) => [k, String(v / 10)])))} current={inputs.measurements ?? {}} />}
          <div className="grid grid-cols-2 gap-3">
            {ABAYA_FIELDS.map((k) => (
              <NumberField key={k} label={`${t(`m_${k}`)} (${t('cm')})`} value={measures[k] ?? ''} onChange={(v) => setMeasures({ ...measures, [k]: v })} onBlur={() => touch(`measurements.${k}`)} error={issueFor(`measurements.${k}`)} />
            ))}
          </div>
          <p className="text-xs text-ink-500">{t('abayaHint')}</p>
        </Step>
      )}

      {kind === 'SOFA_COVER' && (
        <Step title={stepTitle('step_pieces')}>
          <ul className="flex flex-col gap-3">
            {pieces.map((p, i) => {
              const set = (patch: Partial<typeof p>) => setPieces(pieces.map((x, j) => (j === i ? { ...x, ...patch } : x)));
              return (
                <li key={i} className="rounded-xl border border-sand-300 bg-white p-3">
                  <div className="flex flex-wrap items-end gap-2">
                    <label className="flex min-w-40 flex-1 flex-col gap-1 text-sm">
                      <span>{t('pieceType')}</span>
                      <select value={p.code} onChange={(e) => set({ code: e.target.value })} className="h-11 rounded-xl border border-sand-300 bg-white px-2">
                        {(groups.get('PIECE') ?? []).map((o) => (
                          <option key={o.code} value={o.code}>
                            {pick(locale, o.nameAr, o.nameEn)} — {format(o.price)}
                          </option>
                        ))}
                      </select>
                    </label>
                    <NumberField label={t('quantityShort')} value={String(p.quantity)} onChange={(v) => set({ quantity: Math.max(1, Math.min(20, Number(v) || 1)) })} narrow />
                    {pieces.length > 1 && (
                      <button type="button" onClick={() => setPieces(pieces.filter((_, j) => j !== i))} className="h-11 px-2 text-sm text-ink-500 hover:text-danger-600">
                        {t('removePiece')}
                      </button>
                    )}
                  </div>
                  <div className="mt-2 grid grid-cols-3 gap-2">
                    <NumberField label={`${t('width')} (${unitLabel})`} value={p.width} onChange={(width) => set({ width })} onBlur={() => touch(`pieces.${i}.widthMm`)} error={issueFor(`pieces.${i}.widthMm`)} />
                    <NumberField label={`${t('depth')} (${unitLabel})`} value={p.depth} onChange={(depth) => set({ depth })} onBlur={() => touch(`pieces.${i}.depthMm`)} error={issueFor(`pieces.${i}.depthMm`)} />
                    <NumberField label={`${t('height')} (${unitLabel})`} value={p.height} onChange={(height) => set({ height })} onBlur={() => touch(`pieces.${i}.heightMm`)} error={issueFor(`pieces.${i}.heightMm`)} />
                  </div>
                </li>
              );
            })}
          </ul>
          <button type="button" onClick={() => setPieces([...pieces, { code: groups.get('PIECE')?.[0]?.code ?? '', quantity: 1, width: '', depth: '', height: '' }])} className="self-start text-sm font-medium text-brand-700 hover:underline">
            + {t('addPiece')}
          </button>
        </Step>
      )}

      {kind === 'SOFA_COVER' && (
        <Step title={stepTitle('step_photos')}>
          <p className="text-sm text-ink-700">{t('photosHint')}</p>
          <div className="flex flex-wrap gap-2">
            {photos.map((p) => (
              <span key={p.id} className="relative">
                {/* eslint-disable-next-line @next/next/no-img-element -- local preview of the customer's file */}
                <img src={p.url} alt="" className="size-20 rounded-lg object-cover" />
                <button type="button" aria-label={t('removePhoto')} onClick={() => setPhotos(photos.filter((x) => x.id !== p.id))} className="absolute -end-2 -top-2 size-6 rounded-full bg-ink-900 text-xs text-white">
                  ×
                </button>
              </span>
            ))}
            {photos.length < 8 && (
              <label className={cn('flex size-20 cursor-pointer items-center justify-center rounded-lg border-2 border-dashed border-sand-300 text-center text-xs text-ink-500', uploading && 'opacity-60')}>
                {uploading ? <Spinner className="size-5" /> : t('addPhotos')}
                <input type="file" accept="image/*" multiple className="sr-only" disabled={uploading} onChange={(e) => uploadPhotos(e.target.files)} aria-label={t('addPhotos')} />
              </label>
            )}
          </div>
          {issueFor('photoIds') && <p className="text-sm text-danger-600">{issueFor('photoIds')}</p>}
        </Step>
      )}

      {(singleGroups.length > 0 || multiGroups.length > 0) && (
        <Step title={stepTitle('step_options')}>
          {singleGroups.map((g) => (
            <fieldset key={g} className="flex flex-col gap-2">
              <legend className="mb-1 text-sm font-medium">{t(`group_${g}` as 'group_LINING')}</legend>
              <div role="radiogroup" className="grid gap-2 sm:grid-cols-2">
                {groups.get(g)!.map((o) => {
                  const current = choices[g] ?? groups.get(g)!.find((x) => x.isDefault)?.code ?? groups.get(g)![0]!.code;
                  return <Choice key={o.code} on={current === o.code} onClick={() => choose(g, o.code)} title={pick(locale, o.nameAr, o.nameEn)} hint={priceHint(o)} />;
                })}
              </div>
            </fieldset>
          ))}
          {multiGroups.map((g) => (
            <fieldset key={g} className="flex flex-col gap-2">
              <legend className="mb-1 text-sm font-medium">{t(`group_${g}` as 'group_EXTRA')}</legend>
              {groups.get(g)!.map((o) => (
                <label key={o.code} className="flex items-center justify-between gap-3 rounded-xl border border-sand-300 bg-white px-3 py-2 text-sm">
                  <span className="flex items-center gap-2">
                    <input type="checkbox" checked={extras.includes(o.code)} onChange={() => toggleExtra(o.code)} className="size-4 accent-brand-600" />
                    {pick(locale, o.nameAr, o.nameEn)}
                  </span>
                  <span className="text-ink-500">{priceHint(o)}</span>
                </label>
              ))}
            </fieldset>
          ))}
        </Step>
      )}

      <label className="flex flex-col gap-1 text-sm">
        <span className="font-medium">{t('notes')}</span>
        <textarea value={notes} onChange={(e) => setNotes(e.target.value)} maxLength={1000} rows={2} className="rounded-xl border border-sand-300 bg-white px-3 py-2" />
      </label>

      <Card className="flex flex-col gap-3 p-4">
        {(kind === 'CURTAIN' || kind === 'BLIND') && <CurtainPreview kind={kind} color={swatchHex ?? '#c9b99a'} widthMm={inputs.widthMm} heightMm={inputs.heightMm} panels={kind === 'CURTAIN' ? panels : 1} heading={heading} label={t('previewLabel')} />}
        <div className="flex items-center justify-between">
          <h3 className="font-semibold">{t('breakdown')}</h3>
          {quoting && <Spinner className="size-4 text-brand-600" aria-hidden="true" />}
        </div>
        {quote?.valid ? (
          <dl className="flex flex-col gap-1 text-sm" aria-live="polite">
            {quote.lines.map((l) => (
              <div key={l.key} className="flex justify-between gap-3">
                <dt className="text-ink-700">
                  {pick(locale, l.nameAr, l.nameEn)}
                  {l.unit !== 'item' && <span className="text-xs text-ink-500"> · {t(`unit_${l.unit}`, { qty: l.quantity })}</span>}
                </dt>
                <dd>{format(l.amount)}</dd>
              </div>
            ))}
            <div className="flex justify-between border-t border-sand-200 pt-2 text-base font-semibold">
              <dt>{t('total')}</dt>
              <dd data-testid="configured-price">{format(quote.total * quantity)}</dd>
            </div>
            {quantity > 1 && <p className="text-xs text-ink-500">{t('eachPrice', { price: format(quote.total), count: quantity })}</p>}
            <p className="text-xs text-ink-500">{ts('vatIncluded')}</p>
          </dl>
        ) : (
          <p className="text-sm text-ink-500">{t('completeDetails')}</p>
        )}
        <div className="flex items-stretch gap-3">
          <div className="flex items-center rounded-xl border border-sand-300 bg-white" role="group" aria-label={ts('quantity')}>
            <button type="button" aria-label={ts('decrease')} disabled={quantity <= 1} onClick={() => setQuantity((q) => Math.max(1, q - 1))} className="size-12 text-lg disabled:opacity-40">
              −
            </button>
            <span aria-live="polite" className="w-8 text-center font-medium">
              {quantity}
            </span>
            <button type="button" aria-label={ts('increase')} disabled={quantity >= 20} onClick={() => setQuantity((q) => Math.min(20, q + 1))} className="size-12 text-lg disabled:opacity-40">
              +
            </button>
          </div>
          <Button size="lg" className="flex-1" loading={busy} disabled={!variantId || uploading} onClick={addToCart}>
            {ts('addToCart')}
          </Button>
        </div>
        {message && (
          <Alert tone={message.tone}>
            {message.text}{' '}
            {message.cart && (
              <Link href="/cart" className="font-medium underline">
                {ts('viewCart')}
              </Link>
            )}
          </Alert>
        )}
        {kind !== 'ABAYA' && (
          <p className="text-sm text-ink-700">
            {t('bookVisitPrompt')}{' '}
            <Link href={`/services/book?product=${productId}`} className="font-medium text-brand-700 hover:underline">
              {t('bookVisit')}
            </Link>
            {visitHref && (
              <>
                {' · '}
                <a href={visitHref} target="_blank" rel="noopener noreferrer" className="text-success-600 hover:underline">
                  WhatsApp
                </a>
              </>
            )}
          </p>
        )}
      </Card>
    </div>
  );
}

function Step({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-3 rounded-card bg-sand-100 p-4">
      <h3 className="text-sm font-semibold">{title}</h3>
      {children}
    </section>
  );
}

function Pill({ on, onClick, children }: { on: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button type="button" role="radio" aria-checked={on} onClick={onClick} className={cn('rounded-xl border px-3.5 py-2 text-sm', on ? 'border-brand-600 bg-brand-50 font-medium text-brand-700' : 'border-sand-300 bg-white hover:border-ink-500')}>
      {children}
    </button>
  );
}

function Choice({ on, onClick, title, hint }: { on: boolean; onClick: () => void; title: string; hint?: string }) {
  return (
    <button type="button" role="radio" aria-checked={on} onClick={onClick} className={cn('flex flex-col items-start rounded-xl border px-3 py-2 text-start text-sm', on ? 'border-brand-600 bg-brand-50' : 'border-sand-300 bg-white hover:border-ink-500')}>
      <span className="font-medium">{title}</span>
      {hint && <span className="text-xs text-ink-500">{hint}</span>}
    </button>
  );
}

function NumberField({ label, value, onChange, onBlur, error, narrow }: { label: string; value: string; onChange: (v: string) => void; onBlur?: () => void; error?: string | null; narrow?: boolean }) {
  return (
    <label className={cn('flex flex-col gap-1 text-sm', narrow && 'w-20')}>
      <span className="text-ink-700">{label}</span>
      <input value={value} onChange={(e) => onChange(e.target.value)} onBlur={onBlur} inputMode="decimal" dir="ltr" aria-invalid={error ? true : undefined} className={cn('h-11 rounded-xl border bg-white px-3', error ? 'border-danger-600' : 'border-sand-300')} />
      {error && <span className="text-xs text-danger-600">{error}</span>}
    </label>
  );
}

/** Saved measurement profiles (signed-in customers): apply one, or save the current measurements. */
function ProfilePicker({ onPick, current }: { onPick: (m: Record<string, number>) => void; current: Record<string, number> }) {
  const t = useTranslations('configurator');
  const locale = useLocale();
  const [profiles, setProfiles] = useState<Array<{ id: string; label: string; measurements: Record<string, number> }>>([]);
  const [label, setLabel] = useState('');
  const [saved, setSaved] = useState(false);
  const load = () =>
    fetch('/bff/me/measurement-profiles', { headers: { 'X-HD-Locale': locale } })
      .then((r) => (r.ok ? r.json() : []))
      .then(setProfiles)
      .catch(() => undefined);
  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const save = async () => {
    const res = await fetch('/bff/me/measurement-profiles', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-HD-Locale': locale }, body: JSON.stringify({ label: label.trim(), measurements: current }) });
    if (res.ok) {
      setSaved(true);
      setLabel('');
      void load();
    }
  };
  const complete = ABAYA_FIELDS.every((k) => current[k]);
  return (
    <div className="flex flex-col gap-2 text-sm">
      {profiles.length > 0 && (
        <label className="flex flex-col gap-1">
          <span>{t('savedProfiles')}</span>
          <select defaultValue="" onChange={(e) => onPick(profiles.find((p) => p.id === e.target.value)?.measurements ?? {})} className="h-11 rounded-xl border border-sand-300 bg-white px-2">
            <option value="">{t('chooseProfile')}</option>
            {profiles.map((p) => (
              <option key={p.id} value={p.id}>
                {p.label}
              </option>
            ))}
          </select>
        </label>
      )}
      {complete && (
        <div className="flex gap-2">
          <input value={label} onChange={(e) => (setLabel(e.target.value), setSaved(false))} maxLength={60} placeholder={t('profileName')} aria-label={t('profileName')} className="h-10 flex-1 rounded-xl border border-sand-300 bg-white px-3" />
          <Button size="sm" variant="secondary" className="h-10" disabled={!label.trim()} onClick={save}>
            {t('saveProfile')}
          </Button>
        </div>
      )}
      {saved && <p className="text-success-600">{t('profileSaved')}</p>}
    </div>
  );
}
