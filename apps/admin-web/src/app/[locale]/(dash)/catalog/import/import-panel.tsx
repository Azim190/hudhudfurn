'use client';

import { Alert, Badge, Button, Card } from '@hudhud/ui';
import { useLocale, useTranslations } from 'next-intl';
import { useEffect, useRef, useState } from 'react';
import { adminCall, adminUpload } from '@/lib/admin-client';
import { withBase } from '@/lib/base-path';

interface Job {
  id: string;
  status: 'QUEUED' | 'RUNNING' | 'SUCCEEDED' | 'FAILED';
  summary: {
    products?: { created: number; updated: number; failed: number };
    variants?: number;
    errors?: Array<{ row: number; message: string }>;
    warnings?: Array<{ row: number; message: string }>;
  } | null;
}

export function ImportPanel({ columns }: { columns: string[] }) {
  const t = useTranslations('catalog');
  const locale = useLocale();
  const input = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [job, setJob] = useState<Job | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // Poll the background job until it finishes.
  useEffect(() => {
    if (!job || job.status === 'SUCCEEDED' || job.status === 'FAILED') return;
    const id = setTimeout(async () => {
      try {
        setJob(await adminCall<Job>(`/jobs/${job.id}`, 'GET', undefined, locale));
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
      }
    }, 1000);
    return () => clearTimeout(id);
  }, [job, locale]);

  const start = async () => {
    if (!file) return;
    setError(null);
    setBusy(true);
    try {
      const form = new FormData();
      form.append('file', file);
      setJob(await adminUpload<Job>('products/import', form, locale));
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  const s = job?.summary;
  return (
    <div className="mt-6 flex flex-col gap-6">
      <Card className="flex flex-col gap-4 p-5">
        <h2 className="font-semibold">{t('importTitle')}</h2>
        <p className="text-sm text-ink-500">{t('importHint')}</p>
        <div className="flex flex-wrap items-center gap-3">
          <input ref={input} type="file" accept=".xlsx,.csv" className="sr-only" id="import-file" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
          <Button variant="secondary" onClick={() => input.current?.click()}>
            {t('chooseFile')}
          </Button>
          {file && <span className="text-sm" dir="ltr">{file.name}</span>}
          <Button onClick={start} disabled={!file} loading={busy || job?.status === 'QUEUED' || job?.status === 'RUNNING'}>
            {t('startImport')}
          </Button>
        </div>
        {error && <Alert>{error}</Alert>}
        {job && (
          <div className="flex flex-col gap-3 rounded-xl bg-sand-50 p-4 text-sm" aria-live="polite">
            <div className="flex items-center gap-2">
              <Badge className={job.status === 'SUCCEEDED' ? 'bg-success-50 text-success-600' : job.status === 'FAILED' ? 'bg-danger-50 text-danger-600' : undefined}>{t(`job_${job.status}`)}</Badge>
              {s?.products && <span>{t('importSummary', { ...s.products, variants: s.variants ?? 0 })}</span>}
            </div>
            {!!s?.errors?.length && (
              <div>
                <h3 className="font-medium text-danger-600">{t('rowErrors')}</h3>
                <ul className="mt-1 list-inside list-disc">
                  {s.errors.map((e, i) => (
                    <li key={i}>
                      {t('row', { row: e.row })}: <span dir="ltr">{e.message}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {!!s?.warnings?.length && (
              <div>
                <h3 className="font-medium text-ink-700">{t('warnings')}</h3>
                <ul className="mt-1 list-inside list-disc">
                  {s.warnings.map((w, i) => (
                    <li key={i}>
                      {t('row', { row: w.row })}: <span dir="ltr">{w.message}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}
        <details className="text-sm">
          <summary className="cursor-pointer text-brand-700">{t('columnsHelp')}</summary>
          <code dir="ltr" className="mt-2 block rounded-lg bg-sand-100 p-3 text-xs break-words">
            {columns.join(', ')}
          </code>
        </details>
      </Card>

      <Card className="flex flex-col gap-3 p-5">
        <p className="text-sm text-ink-500">{t('exportHint')}</p>
        <div className="flex gap-2">
          <a href={withBase('/bff/files/products/export?format=xlsx')} className="inline-flex h-11 items-center rounded-xl bg-brand-600 px-5 text-sm font-medium text-white hover:bg-brand-700">
            {t('exportXlsx')}
          </a>
          <a href={withBase('/bff/files/products/export?format=csv')} className="inline-flex h-11 items-center rounded-xl border border-sand-300 bg-white px-5 text-sm font-medium hover:bg-sand-100">
            {t('exportCsv')}
          </a>
        </div>
      </Card>
    </div>
  );
}
