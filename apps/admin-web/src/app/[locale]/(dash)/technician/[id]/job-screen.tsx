'use client';

import { Alert, Badge, Button, Card, Field, SelectField, TextAreaField, cn } from '@hudhud/ui';
import { useLocale, useTranslations } from 'next-intl';
import { useEffect, useRef, useState } from 'react';
import { Link } from '@/i18n/navigation';
import { technicianCall, technicianUpload } from '@/lib/admin-client';

interface Measurement {
  id: string;
  roomLabel: string;
  widthMm: number;
  heightMm: number;
  mounting: 'WALL' | 'CEILING' | 'RECESS';
  notes: string | null;
  photoIds: string[];
}

export interface JobDetail {
  id: string;
  number: string;
  type: 'MEASUREMENT' | 'INSTALLATION';
  status: string;
  slot: { date: string; start: string; end: string };
  customer: { name: string; phone: string; masked: boolean };
  address: { cityNameAr: string; cityNameEn: string; district: string | null; street: string | null; buildingNo: string | null; shortAddress: string | null };
  navigationUrl: string;
  notes: string | null;
  product: { nameAr: string; nameEn: string | null } | null;
  signed: boolean;
  measurements: Measurement[];
  quotations: Array<{ id: string; number: string; status: string; total: number }>;
  order: { id: string; number: string } | null;
}

export interface CatalogProduct {
  id: string;
  nameAr: string;
  nameEn: string | null;
  template: { kind: 'CURTAIN' | 'BLIND'; headingStyles: Array<{ code: string; nameAr: string; nameEn: string }>; options: Array<{ group: string; code: string; nameAr: string; nameEn: string; isDefault: boolean }> };
  variants: Array<{ id: string; options: Array<{ labelAr: string; labelEn: string | null }> }>;
}

const NEXT: Record<string, Array<'EN_ROUTE' | 'IN_PROGRESS' | 'COMPLETED' | 'NO_SHOW'>> = { ASSIGNED: ['EN_ROUTE'], EN_ROUTE: ['IN_PROGRESS', 'NO_SHOW'], IN_PROGRESS: ['COMPLETED'] };
const sar = (h: number) => (h / 100).toFixed(2);

export function JobScreen({ initial, catalog }: { initial: JobDetail; catalog: CatalogProduct[] }) {
  const t = useTranslations('technician');
  const ts = useTranslations('services');
  const locale = useLocale();
  const [job, setJob] = useState(initial);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const name = (ar: string, en: string | null | undefined) => (locale === 'en' && en ? en : ar);
  const editable = job.status === 'EN_ROUTE' || job.status === 'IN_PROGRESS';

  const run = async (key: string, fn: () => Promise<JobDetail | unknown>) => {
    setBusy(key);
    setError(null);
    try {
      const res = await fn();
      if (res && typeof res === 'object' && 'measurements' in res) setJob(res as JobDetail);
      else setJob(await technicianCall<JobDetail>(`/jobs/${job.id}`, 'GET', undefined, locale));
      return true;
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      return false;
    } finally {
      setBusy(null);
    }
  };

  const a = job.address;
  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-4">
      <Link href="/technician" className="text-sm text-brand-700 hover:underline">
        ‹ {t('myJobs')}
      </Link>
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-xl font-bold" dir="ltr">
          {job.number}
        </h1>
        <Badge>{ts(`status_${job.status}` as 'status_CONFIRMED')}</Badge>
      </div>
      {error && <Alert>{error}</Alert>}

      <Card className="flex flex-col gap-2 p-4 text-sm">
        <p>
          <span dir="ltr">
            {job.slot.date} · {job.slot.start}–{job.slot.end}
          </span>{' '}
          · {ts(job.type === 'INSTALLATION' ? 'typeInstallation' : 'typeMeasurement')}
        </p>
        <p className="font-semibold">{job.customer.name}</p>
        <p>{[a.buildingNo, a.street, a.district, locale === 'en' ? a.cityNameEn : a.cityNameAr].filter(Boolean).join('، ')}</p>
        {a.shortAddress && <p dir="ltr" className="text-start font-mono">{a.shortAddress}</p>}
        {job.product && <p className="text-ink-500">{t('interestedIn', { name: name(job.product.nameAr, job.product.nameEn) })}</p>}
        {job.notes && <p className="rounded-lg bg-sand-100 p-2" dir="auto">{job.notes}</p>}
        {job.order && <p className="text-ink-500">{t('forOrder', { number: job.order.number })}</p>}
        <div className="mt-2 flex flex-wrap gap-2">
          <a href={job.navigationUrl} target="_blank" rel="noopener noreferrer" className="rounded-lg bg-brand-600 px-4 py-2 font-medium text-white">
            {t('navigate')}
          </a>
          {job.customer.masked ? (
            <span className="rounded-lg border border-sand-300 px-4 py-2 text-ink-500" dir="ltr" title={t('phoneHidden')}>
              {job.customer.phone}
            </span>
          ) : (
            <a href={`tel:${job.customer.phone}`} className="rounded-lg border border-sand-300 px-4 py-2 font-medium" dir="ltr">
              📞 {job.customer.phone}
            </a>
          )}
        </div>
      </Card>

      {NEXT[job.status] && (
        <Card className="flex flex-wrap gap-2 p-4">
          {NEXT[job.status]!.map((s) => (
            <Button key={s} variant={s === 'NO_SHOW' ? 'secondary' : 'primary'} loading={busy === s} disabled={Boolean(busy)} onClick={() => run(s, () => technicianCall(`/jobs/${job.id}/status`, 'POST', { status: s }, locale))}>
              {t(`action_${s}`)}
            </Button>
          ))}
        </Card>
      )}

      {(job.type === 'MEASUREMENT' || job.measurements.length > 0) && <Measurements job={job} editable={editable} busy={busy} run={run} />}
      {editable && !job.signed && <SignaturePad onSave={(dataUrl) => run('sign', () => technicianCall(`/jobs/${job.id}/signature`, 'POST', { dataUrl }, locale))} busy={busy === 'sign'} />}
      {job.signed && <Alert tone="success">{t('signed')}</Alert>}
      {job.type === 'MEASUREMENT' && (job.status === 'IN_PROGRESS' || job.status === 'COMPLETED') && job.measurements.length > 0 && <QuotationBuilder job={job} catalog={catalog} busy={busy} run={run} />}
      {job.quotations.length > 0 && (
        <Card className="p-4 text-sm">
          <h2 className="font-semibold">{ts('quotations')}</h2>
          <ul className="mt-2 flex flex-col gap-1">
            {job.quotations.map((q) => (
              <li key={q.id} className="flex justify-between" dir="ltr">
                <span>{q.number}</span>
                <span>
                  {sar(q.total)} SAR · {ts(`quotation_${q.status}` as 'quotation_SENT')}
                </span>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  );
}

type Run = (key: string, fn: () => Promise<unknown>) => Promise<boolean>;

function Measurements({ job, editable, busy, run }: { job: JobDetail; editable: boolean; busy: string | null; run: Run }) {
  const t = useTranslations('technician');
  const locale = useLocale();
  const blank = { roomLabel: '', width: '', height: '', mounting: 'WALL' as Measurement['mounting'], notes: '' };
  const [form, setForm] = useState(blank);
  const [photos, setPhotos] = useState<Array<{ id: string; url: string }>>([]);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);

  const upload = async (files: FileList | null) => {
    if (!files?.length) return;
    setUploading(true);
    setUploadError(null);
    try {
      for (const f of [...files].slice(0, 10 - photos.length)) {
        const { id } = await technicianUpload(f, locale);
        setPhotos((p) => [...p, { id, url: URL.createObjectURL(f) }]);
      }
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : String(err));
    } finally {
      setUploading(false);
    }
  };

  const cmToMm = (v: string) => Math.round(Number(v.replace(',', '.')) * 10);
  const valid = form.roomLabel.trim() && cmToMm(form.width) >= 100 && cmToMm(form.height) >= 100;

  return (
    <Card className="flex flex-col gap-3 p-4">
      <h2 className="font-semibold">{t('measurements')}</h2>
      {job.measurements.length === 0 && <p className="text-sm text-ink-500">{t('noMeasurements')}</p>}
      <ul className="flex flex-col gap-2 text-sm">
        {job.measurements.map((m) => (
          <li key={m.id} className="flex items-start justify-between gap-2 rounded-lg bg-sand-100 p-2">
            <div>
              <p className="font-medium">{m.roomLabel}</p>
              <p dir="ltr" className="text-start">
                {m.widthMm / 10} × {m.heightMm / 10} cm · {t(`mounting_${m.mounting}`)}
              </p>
              {m.notes && <p className="text-ink-500">{m.notes}</p>}
              {m.photoIds.length > 0 && <p className="text-xs text-ink-500">{t('photoCount', { count: m.photoIds.length })}</p>}
            </div>
            {editable && (
              <button type="button" className="text-xs text-danger-600" disabled={Boolean(busy)} onClick={() => run(`del-${m.id}`, () => technicianCall(`/jobs/${job.id}/measurements/${m.id}/delete`, 'POST', {}, locale))}>
                {t('delete')}
              </button>
            )}
          </li>
        ))}
      </ul>
      {editable ? (
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <Field label={t('roomLabel')} value={form.roomLabel} onChange={(e) => setForm({ ...form, roomLabel: e.target.value })} />
          </div>
          <Field label={t('widthCm')} value={form.width} onChange={(e) => setForm({ ...form, width: e.target.value })} inputMode="decimal" ltr />
          <Field label={t('heightCm')} value={form.height} onChange={(e) => setForm({ ...form, height: e.target.value })} inputMode="decimal" ltr />
          <SelectField label={t('mounting')} value={form.mounting} onChange={(e) => setForm({ ...form, mounting: e.target.value as Measurement['mounting'] })}>
            {(['WALL', 'CEILING', 'RECESS'] as const).map((m) => (
              <option key={m} value={m}>
                {t(`mounting_${m}`)}
              </option>
            ))}
          </SelectField>
          <label className="flex flex-col gap-1.5 text-sm">
            <span className="font-medium text-ink-700">{t('photos')}</span>
            <input type="file" accept="image/*" capture="environment" multiple disabled={uploading} onChange={(e) => upload(e.target.files)} aria-label={t('photos')} className="text-sm" />
          </label>
          {photos.length > 0 && (
            <div className="flex flex-wrap gap-2 sm:col-span-2">
              {/* eslint-disable-next-line @next/next/no-img-element -- local preview */}
              {photos.map((p) => <img key={p.id} src={p.url} alt="" className="size-16 rounded object-cover" />)}
            </div>
          )}
          {uploadError && <Alert className="sm:col-span-2">{uploadError}</Alert>}
          <div className="sm:col-span-2">
            <TextAreaField label={t('notes')} rows={2} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
          </div>
          <Button
            className="sm:col-span-2"
            disabled={!valid || uploading || Boolean(busy)}
            loading={busy === 'measure'}
            onClick={async () => {
              const ok = await run('measure', () =>
                technicianCall(`/jobs/${job.id}/measurements`, 'POST', { roomLabel: form.roomLabel.trim(), widthMm: cmToMm(form.width), heightMm: cmToMm(form.height), mounting: form.mounting, notes: form.notes.trim() || undefined, photoIds: photos.map((p) => p.id) }, locale),
              );
              if (ok) {
                setForm(blank);
                setPhotos([]);
              }
            }}
          >
            {t('addMeasurement')}
          </Button>
        </div>
      ) : (
        job.status === 'ASSIGNED' && <p className="text-xs text-ink-500">{t('startToMeasure')}</p>
      )}
    </Card>
  );
}

/** Finger or mouse signature on a canvas, sent as PNG. */
function SignaturePad({ onSave, busy }: { onSave: (dataUrl: string) => void; busy: boolean }) {
  const t = useTranslations('technician');
  const canvas = useRef<HTMLCanvasElement>(null);
  const drawing = useRef(false);
  const [empty, setEmpty] = useState(true);

  useEffect(() => {
    const c = canvas.current!;
    const ctx = c.getContext('2d')!;
    ctx.lineWidth = 2.5;
    ctx.lineCap = 'round';
    ctx.strokeStyle = '#1f2933';
  }, []);

  const point = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const r = canvas.current!.getBoundingClientRect();
    return { x: ((e.clientX - r.left) / r.width) * canvas.current!.width, y: ((e.clientY - r.top) / r.height) * canvas.current!.height };
  };

  return (
    <Card className="flex flex-col gap-3 p-4">
      <h2 className="font-semibold">{t('signature')}</h2>
      <p className="text-xs text-ink-500">{t('signatureHint')}</p>
      <canvas
        ref={canvas}
        width={600}
        height={220}
        aria-label={t('signature')}
        className="w-full touch-none rounded-lg border border-sand-300 bg-white"
        onPointerDown={(e) => {
          drawing.current = true;
          const p = point(e);
          const ctx = canvas.current!.getContext('2d')!;
          ctx.beginPath();
          ctx.moveTo(p.x, p.y);
          canvas.current!.setPointerCapture(e.pointerId);
        }}
        onPointerMove={(e) => {
          if (!drawing.current) return;
          const p = point(e);
          const ctx = canvas.current!.getContext('2d')!;
          ctx.lineTo(p.x, p.y);
          ctx.stroke();
          setEmpty(false);
        }}
        onPointerUp={() => (drawing.current = false)}
      />
      <div className="flex gap-2">
        <Button variant="secondary" size="sm" onClick={() => (canvas.current!.getContext('2d')!.clearRect(0, 0, 600, 220), setEmpty(true))}>
          {t('clear')}
        </Button>
        <Button size="sm" disabled={empty} loading={busy} onClick={() => onSave(canvas.current!.toDataURL('image/png'))}>
          {t('saveSignature')}
        </Button>
      </div>
    </Card>
  );
}

function QuotationBuilder({ job, catalog, busy, run }: { job: JobDetail; catalog: CatalogProduct[]; busy: string | null; run: Run }) {
  const t = useTranslations('technician');
  const tg = useTranslations('configurator');
  const locale = useLocale();
  const name = (ar: string, en: string | null | undefined) => (locale === 'en' && en ? en : ar);
  const first = catalog[0];
  const [lines, setLines] = useState(() =>
    job.measurements.map((m) => ({
      measurementId: m.id,
      include: true,
      productId: first?.id ?? '',
      variantId: first?.variants[0]?.id ?? '',
      quantity: 1,
      panels: 2,
      headingStyle: first?.template.headingStyles[0]?.code ?? '',
      choices: {} as Record<string, string>,
    })),
  );
  const [notes, setNotes] = useState('');
  const set = (i: number, patch: Partial<(typeof lines)[number]>) => setLines(lines.map((l, j) => (j === i ? { ...l, ...patch } : l)));

  if (catalog.length === 0) return <Alert tone="info">{t('noCatalog')}</Alert>;
  const submit = () =>
    run('quote', () =>
      technicianCall(
        `/jobs/${job.id}/quotation`,
        'POST',
        {
          notes: notes.trim() || undefined,
          lines: lines
            .filter((l) => l.include)
            .map((l) => {
              const p = catalog.find((c) => c.id === l.productId)!;
              return { measurementId: l.measurementId, productId: l.productId, variantId: l.variantId, quantity: l.quantity, inputs: p.template.kind === 'CURTAIN' ? { panels: l.panels, headingStyle: l.headingStyle, choices: l.choices } : { choices: l.choices } };
            }),
        },
        locale,
      ),
    );

  return (
    <Card className="flex flex-col gap-3 p-4">
      <h2 className="font-semibold">{t('quotation')}</h2>
      {lines.map((l, i) => {
        const m = job.measurements.find((x) => x.id === l.measurementId)!;
        const p = catalog.find((c) => c.id === l.productId) ?? first!;
        const groups = [...new Set(p.template.options.map((o) => o.group))].filter((g) => g !== 'MOUNTING');
        return (
          <fieldset key={l.measurementId} className={cn('flex flex-col gap-2 rounded-lg border border-sand-300 p-3', !l.include && 'opacity-50')}>
            <legend className="px-1 text-sm font-medium">
              <label className="flex items-center gap-2">
                <input type="checkbox" checked={l.include} onChange={(e) => set(i, { include: e.target.checked })} />
                {m.roomLabel} · <span dir="ltr">{m.widthMm / 10}×{m.heightMm / 10} cm</span>
              </label>
            </legend>
            <div className="grid gap-2 sm:grid-cols-2">
              <SelectField label={t('product')} value={l.productId} onChange={(e) => {
                const np = catalog.find((c) => c.id === e.target.value)!;
                set(i, { productId: np.id, variantId: np.variants[0]?.id ?? '', headingStyle: np.template.headingStyles[0]?.code ?? '', choices: {} });
              }}>
                {catalog.map((c) => (
                  <option key={c.id} value={c.id}>
                    {name(c.nameAr, c.nameEn)}
                  </option>
                ))}
              </SelectField>
              <SelectField label={t('fabric')} value={l.variantId} onChange={(e) => set(i, { variantId: e.target.value })}>
                {p.variants.map((v) => (
                  <option key={v.id} value={v.id}>
                    {v.options.map((o) => name(o.labelAr, o.labelEn)).join(' · ') || '—'}
                  </option>
                ))}
              </SelectField>
              {p.template.kind === 'CURTAIN' && (
                <>
                  <SelectField label={t('heading')} value={l.headingStyle} onChange={(e) => set(i, { headingStyle: e.target.value })}>
                    {p.template.headingStyles.map((h) => (
                      <option key={h.code} value={h.code}>
                        {name(h.nameAr, h.nameEn)}
                      </option>
                    ))}
                  </SelectField>
                  <Field label={t('panels')} value={String(l.panels)} onChange={(e) => set(i, { panels: Math.max(1, Math.min(8, Number(e.target.value) || 1)) })} inputMode="numeric" ltr />
                </>
              )}
              {groups.map((g) => {
                const opts = p.template.options.filter((o) => o.group === g);
                if (opts.length < 2) return null;
                return (
                  <SelectField key={g} label={tg(`group_${g}` as 'group_LINING')} value={l.choices[g] ?? opts.find((o) => o.isDefault)?.code ?? opts[0]!.code} onChange={(e) => set(i, { choices: { ...l.choices, [g]: e.target.value } })}>
                    {opts.map((o) => (
                      <option key={o.code} value={o.code}>
                        {name(o.nameAr, o.nameEn)}
                      </option>
                    ))}
                  </SelectField>
                );
              })}
            </div>
          </fieldset>
        );
      })}
      <TextAreaField label={t('quotationNotes')} rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
      <Button loading={busy === 'quote'} disabled={Boolean(busy) || !lines.some((l) => l.include)} onClick={submit}>
        {t('sendQuotation')}
      </Button>
    </Card>
  );
}
