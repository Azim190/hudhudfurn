'use client';

import { Alert, Button, Card, Checkbox, Field, SelectField } from '@hudhud/ui';
import { useLocale, useTranslations } from 'next-intl';
import { useState } from 'react';
import { adminCall, halalasToSar, sarToHalalas } from '@/lib/admin-client';

export interface Area {
  id: string;
  code: string;
  nameAr: string;
  nameEn: string;
  types: Array<'MEASUREMENT' | 'INSTALLATION'>;
  measurementFee: number;
  installationFee: number;
  freeInstallationAbove: number | null;
  isActive: boolean;
  city: { code: string; nameAr: string; nameEn: string };
  _count: { technicians: number };
}

interface Slot {
  id: string;
  date: string;
  startTime: string;
  endTime: string;
  capacity: number;
  booked: number;
  isActive: boolean;
}

const today = () => new Date(Date.now() + 3 * 3_600_000).toISOString().slice(0, 10);
const plus = (d: string, n: number) => new Date(Date.parse(`${d}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);
const WEEKDAYS = [0, 1, 2, 3, 4, 5, 6];

export function AreaManager({ initial, cities, canManage }: { initial: Area[]; cities: Array<{ code: string; nameAr: string; nameEn: string }>; canManage: boolean }) {
  const t = useTranslations('technician');
  const ta = useTranslations('admin');
  const locale = useLocale();
  const [areas, setAreas] = useState(initial);
  const [selected, setSelected] = useState<string | null>(initial[0]?.id ?? null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const blank = { code: '', nameAr: '', nameEn: '', cityCode: cities[0]?.code ?? 'RUH', measurement: true, installation: true, measurementFee: '50', installationFee: '150', freeAbove: '1500' };
  const [form, setForm] = useState(blank);

  const reload = async () => setAreas(await adminCall<Area[]>('/services/areas', 'GET', undefined, locale));
  const run = async (fn: () => Promise<unknown>, message?: string) => {
    setError(null);
    setNotice(null);
    try {
      await fn();
      await reload();
      if (message) setNotice(message);
      return true;
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      return false;
    }
  };

  const area = areas.find((a) => a.id === selected);
  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-6">
      <h1 className="text-2xl font-bold">{t('areas')}</h1>
      {error && <Alert>{error}</Alert>}
      {notice && <Alert tone="success">{notice}</Alert>}
      <Card className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="border-b border-sand-200 text-xs text-ink-500">
            <tr>
              {[t('area'), t('city'), t('visitTypes'), t('measurementFee'), t('installationFee'), t('technicians'), ''].map((h, i) => (
                <th key={i} className="px-4 py-3 text-start font-medium">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {areas.map((a) => (
              <tr key={a.id} className="border-b border-sand-100 last:border-0">
                <td className="px-4 py-3 font-medium">{locale === 'en' ? a.nameEn : a.nameAr}</td>
                <td className="px-4 py-3">{locale === 'en' ? a.city.nameEn : a.city.nameAr}</td>
                <td className="px-4 py-3 text-xs">{a.types.map((ty) => t(ty === 'INSTALLATION' ? 'typeInstallation' : 'typeMeasurement')).join(locale === 'ar' ? '، ' : ', ')}</td>
                <td className="px-4 py-3">{halalasToSar(a.measurementFee) || '0'}</td>
                <td className="px-4 py-3">{halalasToSar(a.installationFee) || '0'}</td>
                <td className="px-4 py-3">{a._count.technicians}</td>
                <td className="px-4 py-3">
                  <Button size="sm" variant="secondary" onClick={() => setSelected(a.id)}>
                    {t('slots')}
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>

      {canManage && (
        <Card className="grid gap-3 p-5 sm:grid-cols-3">
          <h2 className="text-lg font-semibold sm:col-span-3">{t('newArea')}</h2>
          <Field label={ta('code')} value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value.toUpperCase() })} ltr />
          <Field label={`${t('area')} (AR)`} value={form.nameAr} onChange={(e) => setForm({ ...form, nameAr: e.target.value })} />
          <Field label={`${t('area')} (EN)`} value={form.nameEn} onChange={(e) => setForm({ ...form, nameEn: e.target.value })} ltr />
          <SelectField label={t('city')} value={form.cityCode} onChange={(e) => setForm({ ...form, cityCode: e.target.value })}>
            {cities.map((c) => (
              <option key={c.code} value={c.code}>
                {locale === 'en' ? c.nameEn : c.nameAr}
              </option>
            ))}
          </SelectField>
          <Field label={t('measurementFee')} value={form.measurementFee} onChange={(e) => setForm({ ...form, measurementFee: e.target.value })} inputMode="decimal" ltr />
          <Field label={t('installationFee')} value={form.installationFee} onChange={(e) => setForm({ ...form, installationFee: e.target.value })} inputMode="decimal" ltr />
          <Field label={t('freeInstallationAbove')} value={form.freeAbove} onChange={(e) => setForm({ ...form, freeAbove: e.target.value })} inputMode="decimal" ltr />
          <div className="flex items-end gap-4">
            <Checkbox label={t('typeMeasurement')} checked={form.measurement} onChange={(e) => setForm({ ...form, measurement: e.target.checked })} />
            <Checkbox label={t('typeInstallation')} checked={form.installation} onChange={(e) => setForm({ ...form, installation: e.target.checked })} />
          </div>
          <Button
            className="self-end"
            disabled={!form.code || !form.nameAr || !form.nameEn || (!form.measurement && !form.installation)}
            onClick={async () => {
              const ok = await run(
                () =>
                  adminCall('/services/areas', 'POST', {
                    code: form.code,
                    nameAr: form.nameAr,
                    nameEn: form.nameEn,
                    cityCode: form.cityCode,
                    types: [...(form.measurement ? ['MEASUREMENT'] : []), ...(form.installation ? ['INSTALLATION'] : [])],
                    measurementFee: sarToHalalas(form.measurementFee) ?? 0,
                    installationFee: sarToHalalas(form.installationFee) ?? 0,
                    freeInstallationAbove: sarToHalalas(form.freeAbove),
                  }, locale),
                t('saved'),
              );
              if (ok) setForm(blank);
            }}
          >
            {t('addArea')}
          </Button>
        </Card>
      )}

      {area && <SlotPanel key={area.id} area={area} canManage={canManage} onError={setError} />}
    </div>
  );
}

function SlotPanel({ area, canManage, onError }: { area: Area; canManage: boolean; onError: (e: string | null) => void }) {
  const t = useTranslations('technician');
  const locale = useLocale();
  const [from, setFrom] = useState(today());
  const [slots, setSlots] = useState<Slot[] | null>(null);
  const [gen, setGen] = useState({ to: plus(today(), 13), weekdays: [0, 1, 2, 3, 4, 6], windows: '09:00-12:00, 12:00-15:00, 16:00-19:00, 19:00-22:00', capacity: '3' });
  const [message, setMessage] = useState<string | null>(null);

  const load = async () => {
    try {
      setSlots(await adminCall<Slot[]>(`/services/areas/${area.id}/slots?from=${from}&to=${plus(from, 13)}`, 'GET', undefined, locale));
    } catch (err) {
      onError(err instanceof Error ? err.message : String(err));
    }
  };

  const generate = async () => {
    onError(null);
    try {
      const windows = gen.windows.split(',').map((w) => {
        const [start, end] = w.trim().split('-');
        return { start: start!.trim(), end: (end ?? '').trim() };
      });
      const r = await adminCall<{ created: number; skipped: number }>(`/services/areas/${area.id}/slots/generate`, 'POST', { from, to: gen.to, weekdays: gen.weekdays, windows, capacity: Number(gen.capacity) }, locale);
      setMessage(t('slotsCreated', { created: r.created, skipped: r.skipped }));
      await load();
    } catch (err) {
      onError(err instanceof Error ? err.message : String(err));
    }
  };

  return (
    <Card className="flex flex-col gap-4 p-5">
      <h2 className="text-lg font-semibold">
        {t('slots')} · {locale === 'en' ? area.nameEn : area.nameAr}
      </h2>
      <div className="flex flex-wrap items-end gap-3">
        <Field label={t('from')} type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
        <Button variant="secondary" onClick={load}>
          {t('show')}
        </Button>
      </div>
      {canManage && (
        <div className="grid gap-3 rounded-lg bg-sand-100 p-3 sm:grid-cols-4">
          <Field label={t('to')} type="date" value={gen.to} onChange={(e) => setGen({ ...gen, to: e.target.value })} />
          <Field label={t('windows')} hint="09:00-12:00, 16:00-19:00" value={gen.windows} onChange={(e) => setGen({ ...gen, windows: e.target.value })} ltr />
          <Field label={t('capacity')} value={gen.capacity} onChange={(e) => setGen({ ...gen, capacity: e.target.value })} inputMode="numeric" ltr />
          <div className="flex flex-wrap items-end gap-2 text-xs">
            {WEEKDAYS.map((d) => (
              <Checkbox key={d} label={t(`weekday_${d}`)} checked={gen.weekdays.includes(d)} onChange={(e) => setGen({ ...gen, weekdays: e.target.checked ? [...gen.weekdays, d] : gen.weekdays.filter((x) => x !== d) })} />
            ))}
          </div>
          <Button className="sm:col-span-4 sm:justify-self-start" onClick={generate}>
            {t('generateSlots')}
          </Button>
          {message && <p className="text-sm text-success-600 sm:col-span-4">{message}</p>}
        </div>
      )}
      {slots && (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-xs text-ink-500">
              <tr>
                {[t('day'), t('time'), t('booked'), t('capacity'), ''].map((h, i) => (
                  <th key={i} className="px-2 py-2 text-start font-medium">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {slots.map((s) => (
                <SlotRow key={s.id} slot={s} canManage={canManage} onError={onError} />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}

function SlotRow({ slot, canManage, onError }: { slot: Slot; canManage: boolean; onError: (e: string | null) => void }) {
  const t = useTranslations('technician');
  const locale = useLocale();
  const [s, setS] = useState(slot);
  const [capacity, setCapacity] = useState(String(slot.capacity));
  const save = async (patch: { capacity?: number; isActive?: boolean }) => {
    try {
      setS(await adminCall<Slot>(`/services/slots/${s.id}`, 'PATCH', patch, locale));
    } catch (err) {
      onError(err instanceof Error ? err.message : String(err));
    }
  };
  return (
    <tr className={s.isActive ? 'border-t border-sand-100' : 'border-t border-sand-100 opacity-50'}>
      <td className="px-2 py-2" dir="ltr">
        <span className="block text-start">{s.date.slice(0, 10)}</span>
      </td>
      <td className="px-2 py-2" dir="ltr">
        <span className="block text-start">
          {s.startTime}–{s.endTime}
        </span>
      </td>
      <td className="px-2 py-2">{s.booked}</td>
      <td className="px-2 py-2">
        <input aria-label={t('capacity')} value={capacity} onChange={(e) => setCapacity(e.target.value)} disabled={!canManage} className="h-8 w-16 rounded-lg border border-sand-300 px-2" dir="ltr" />
      </td>
      <td className="flex gap-2 px-2 py-2">
        {canManage && (
          <>
            <Button size="sm" variant="secondary" disabled={Number(capacity) === s.capacity} onClick={() => save({ capacity: Number(capacity) })}>
              {t('save')}
            </Button>
            <Button size="sm" variant="ghost" onClick={() => save({ isActive: !s.isActive })}>
              {s.isActive ? t('close') : t('open')}
            </Button>
          </>
        )}
      </td>
    </tr>
  );
}
