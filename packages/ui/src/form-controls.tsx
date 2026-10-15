'use client';

import { useId, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes } from 'react';
import { cn } from './components';

const control =
  'w-full rounded-xl border border-sand-300 bg-white px-4 text-base text-ink-900 focus:border-brand-500 focus:ring-2 focus:ring-brand-100 focus:outline-none disabled:bg-sand-100';

export function SelectField({
  label,
  hint,
  children,
  className,
  ...rest
}: SelectHTMLAttributes<HTMLSelectElement> & { label: string; hint?: string; children: ReactNode }) {
  const id = useId();
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-sm font-medium text-ink-700">
        {label}
      </label>
      <select id={id} className={cn(control, 'h-12', className)} {...rest}>
        {children}
      </select>
      {hint && <p className="text-xs text-ink-500">{hint}</p>}
    </div>
  );
}

export function TextAreaField({
  label,
  hint,
  className,
  ...rest
}: TextareaHTMLAttributes<HTMLTextAreaElement> & { label: string; hint?: string }) {
  const id = useId();
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-sm font-medium text-ink-700">
        {label}
      </label>
      <textarea id={id} rows={4} className={cn(control, 'py-3 leading-relaxed', className)} {...rest} />
      {hint && <p className="text-xs text-ink-500">{hint}</p>}
    </div>
  );
}

export function Checkbox({ label, className, ...rest }: InputHTMLAttributes<HTMLInputElement> & { label: ReactNode }) {
  return (
    <label className={cn('inline-flex cursor-pointer items-center gap-2 text-sm text-ink-900', className)}>
      <input type="checkbox" className="size-4 accent-brand-600" {...rest} />
      <span>{label}</span>
    </label>
  );
}

/** Accessible progress bar (completeness indicators). */
export function Progress({ value, label }: { value: number; label: string }) {
  const pct = Math.max(0, Math.min(100, Math.round(value)));
  const tone = pct >= 80 ? 'bg-success-600' : pct >= 50 ? 'bg-accent-500' : 'bg-danger-600';
  return (
    <div className="flex flex-col gap-1">
      <div className="text-xs text-ink-700">{label}</div>
      <div role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} aria-label={label} className="h-2 overflow-hidden rounded-full bg-sand-200">
        <div className={cn('h-full rounded-full transition-all', tone)} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}
