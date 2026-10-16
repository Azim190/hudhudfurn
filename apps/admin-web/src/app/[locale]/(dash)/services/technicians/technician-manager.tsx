'use client';

import { Alert, Button, Card, Checkbox, Field } from '@hudhud/ui';
import { useLocale, useTranslations } from 'next-intl';
import { useState } from 'react';
import { adminCall } from '@/lib/admin-client';

export interface Technician {
  userId: string;
  name: string | null;
  email: string | null;
  profile: { phoneE164: string | null; isActive: boolean; areas: Array<{ id: string }> } | null;
}

export function TechnicianManager({ initial, areas, canManage }: { initial: Technician[]; areas: Array<{ id: string; nameAr: string; nameEn: string }>; canManage: boolean }) {
  const t = useTranslations('technician');
  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-4">
      <h1 className="text-2xl font-bold">{t('technicians')}</h1>
      <p className="text-sm text-ink-500">{t('techniciansHint')}</p>
      {initial.length === 0 && <Card className="p-6 text-sm text-ink-500">{t('noTechnicians')}</Card>}
      {initial.map((tech) => (
        <TechnicianCard key={tech.userId} tech={tech} areas={areas} canManage={canManage} />
      ))}
    </div>
  );
}

function TechnicianCard({ tech, areas, canManage }: { tech: Technician; areas: Array<{ id: string; nameAr: string; nameEn: string }>; canManage: boolean }) {
  const t = useTranslations('technician');
  const locale = useLocale();
  const [phone, setPhone] = useState(tech.profile?.phoneE164?.replace(/^\+966/, '0') ?? '');
  const [areaIds, setAreaIds] = useState(tech.profile?.areas.map((a) => a.id) ?? []);
  const [active, setActive] = useState(tech.profile?.isActive ?? true);
  const [state, setState] = useState<{ error?: string; saved?: boolean }>({});

  const save = async () => {
    setState({});
    try {
      await adminCall(`/services/technicians/${tech.userId}`, 'PUT', { phone: phone || undefined, areaIds, isActive: active }, locale);
      setState({ saved: true });
    } catch (err) {
      setState({ error: err instanceof Error ? err.message : String(err) });
    }
  };

  return (
    <Card className="flex flex-col gap-3 p-5">
      <div>
        <p className="font-semibold">{tech.name}</p>
        <p className="text-sm text-ink-500" dir="ltr">
          <span className="block text-start">{tech.email}</span>
        </p>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label={t('phone')} value={phone} onChange={(e) => setPhone(e.target.value)} disabled={!canManage} ltr />
        <div className="flex items-end">
          <Checkbox label={t('activeTechnician')} checked={active} onChange={(e) => setActive(e.target.checked)} disabled={!canManage} />
        </div>
      </div>
      <fieldset className="flex flex-wrap gap-3">
        <legend className="mb-1 text-sm font-medium">{t('areas')}</legend>
        {areas.map((a) => (
          <Checkbox key={a.id} label={locale === 'en' ? a.nameEn : a.nameAr} checked={areaIds.includes(a.id)} disabled={!canManage} onChange={(e) => setAreaIds(e.target.checked ? [...areaIds, a.id] : areaIds.filter((x) => x !== a.id))} />
        ))}
      </fieldset>
      {canManage && (
        <Button size="sm" className="self-start" onClick={save}>
          {t('save')}
        </Button>
      )}
      {state.error && <Alert>{state.error}</Alert>}
      {state.saved && <Alert tone="success">{t('saved')}</Alert>}
    </Card>
  );
}
