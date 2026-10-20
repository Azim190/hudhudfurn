'use client';

import { formatDate, type Locale } from '@hudhud/i18n';
import { Alert, Badge, Button, Card, Field } from '@hudhud/ui';
import { useLocale, useTranslations } from 'next-intl';
import { useState, type FormEvent } from 'react';
import { withBase } from '@/lib/base-path';

export interface RoleOption {
  key: string;
  nameAr: string;
  nameEn: string;
}

export interface StaffRow {
  id: string;
  email: string | null;
  fullName: string | null;
  status: 'ACTIVE' | 'BLOCKED';
  lastLoginAt: string | null;
  twoFactorEnabled: boolean;
  roles: RoleOption[];
}

async function call<T>(url: string, method: string, locale: string, body?: unknown): Promise<T> {
  const res = await fetch(url, {
    method,
    headers: { 'Content-Type': 'application/json', 'X-HD-Locale': locale },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const json = (await res.json().catch(() => ({}))) as T & { message?: string };
  if (!res.ok) throw new Error(json.message ?? res.statusText);
  return json;
}

export function StaffManager({
  initialStaff,
  roles,
  canWrite,
  isOwner,
  currentUserId,
}: {
  initialStaff: StaffRow[];
  roles: RoleOption[];
  canWrite: boolean;
  isOwner: boolean;
  currentUserId: string;
}) {
  const t = useTranslations('admin');
  const locale = useLocale() as Locale;
  const roleName = (r: RoleOption) => (locale === 'ar' ? r.nameAr : r.nameEn);
  const grantable = roles.filter((r) => isOwner || r.key !== 'owner');

  const [staff, setStaff] = useState(initialStaff);
  const [message, setMessage] = useState<{ tone: 'success' | 'danger'; text: string } | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [form, setForm] = useState({ email: '', fullName: '', temporaryPassword: '', roleKeys: [] as string[] });

  const replace = (row: StaffRow) => setStaff((list) => list.map((s) => (s.id === row.id ? row : s)));

  const act = async (id: string, fn: () => Promise<void>) => {
    setBusy(id);
    setMessage(null);
    try {
      await fn();
    } catch (err) {
      setMessage({ tone: 'danger', text: err instanceof Error ? err.message : String(err) });
    } finally {
      setBusy(null);
    }
  };

  const create = (e: FormEvent) => {
    e.preventDefault();
    void act('create', async () => {
      const row = await call<StaffRow>(withBase('/bff/admin/staff'), 'POST', locale, form);
      setStaff((list) => [...list, row]);
      setForm({ email: '', fullName: '', temporaryPassword: '', roleKeys: [] });
      setMessage({ tone: 'success', text: t('staffCreated') });
    });
  };

  return (
    <div className="mt-6 flex flex-col gap-6">
      {message && <Alert tone={message.tone}>{message.text}</Alert>}

      <Card className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="border-b border-sand-200 text-start text-xs text-ink-500">
            <tr>
              {[t('name'), t('email'), t('roles'), t('status'), t('twoFactor'), t('lastLogin'), ''].map((h, i) => (
                <th key={i} scope="col" className="px-4 py-3 text-start font-medium">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {staff.map((s) => (
              <tr key={s.id} className="border-b border-sand-100 last:border-0">
                <td className="px-4 py-3 font-medium">{s.fullName}</td>
                <td className="px-4 py-3" dir="ltr">
                  <span className="block text-start">{s.email}</span>
                </td>
                <td className="px-4 py-3">
                  <div className="flex flex-wrap gap-1">
                    {s.roles.map((r) => (
                      <Badge key={r.key}>{roleName(r)}</Badge>
                    ))}
                  </div>
                </td>
                <td className="px-4 py-3">
                  <Badge className={s.status === 'ACTIVE' ? 'bg-success-50 text-success-600' : 'bg-danger-50 text-danger-600'}>
                    {s.status === 'ACTIVE' ? t('active') : t('blocked')}
                  </Badge>
                </td>
                <td className="px-4 py-3">{s.twoFactorEnabled ? t('enabled') : t('notEnabled')}</td>
                <td className="px-4 py-3 text-ink-500">
                  {s.lastLoginAt ? formatDate(s.lastLoginAt, { locale, digits: 'western' }, { dateStyle: 'medium', timeStyle: 'short' }) : t('never')}
                </td>
                <td className="px-4 py-3">
                  {canWrite && s.id !== currentUserId && (
                    <div className="flex justify-end gap-2">
                      <Button
                        size="sm"
                        variant="secondary"
                        loading={busy === s.id}
                        onClick={() =>
                          act(s.id, async () =>
                            replace(await call<StaffRow>(withBase(`/bff/admin/staff/${s.id}`), 'PATCH', locale, { status: s.status === 'ACTIVE' ? 'BLOCKED' : 'ACTIVE' })),
                          )
                        }
                      >
                        {s.status === 'ACTIVE' ? t('block') : t('unblock')}
                      </Button>
                      {s.twoFactorEnabled && (
                        <Button
                          size="sm"
                          variant="ghost"
                          disabled={busy === s.id}
                          onClick={() => {
                            if (!window.confirm(t('confirmReset2fa'))) return;
                            void act(s.id, async () => replace(await call<StaffRow>(withBase(`/bff/admin/staff/${s.id}/reset-2fa`), 'POST', locale, {})));
                          }}
                        >
                          {t('reset2fa')}
                        </Button>
                      )}
                    </div>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>

      {canWrite && (
        <Card className="p-6">
          <h2 className="text-lg font-semibold">{t('createStaff')}</h2>
          <form onSubmit={create} className="mt-4 grid gap-4 sm:grid-cols-3">
            <Field label={t('name')} value={form.fullName} onChange={(e) => setForm({ ...form, fullName: e.target.value })} required />
            <Field label={t('email')} type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} ltr required />
            <Field
              label={t('temporaryPassword')}
              type="password"
              autoComplete="new-password"
              minLength={12}
              value={form.temporaryPassword}
              onChange={(e) => setForm({ ...form, temporaryPassword: e.target.value })}
              ltr
              required
            />
            <fieldset className="sm:col-span-3">
              <legend className="mb-2 text-sm font-medium text-ink-700">{t('roles')}</legend>
              <div className="flex flex-wrap gap-2">
                {grantable.map((r) => (
                  <label key={r.key} className="flex cursor-pointer items-center gap-2 rounded-xl border border-sand-300 px-3 py-1.5 text-sm has-[:checked]:border-brand-500 has-[:checked]:bg-brand-50">
                    <input
                      type="checkbox"
                      className="accent-brand-600"
                      checked={form.roleKeys.includes(r.key)}
                      onChange={(e) =>
                        setForm({ ...form, roleKeys: e.target.checked ? [...form.roleKeys, r.key] : form.roleKeys.filter((k) => k !== r.key) })
                      }
                    />
                    {roleName(r)}
                  </label>
                ))}
              </div>
            </fieldset>
            <div className="sm:col-span-3">
              <Button type="submit" loading={busy === 'create'} disabled={form.roleKeys.length === 0}>
                {t('create')}
              </Button>
            </div>
          </form>
        </Card>
      )}
    </div>
  );
}
