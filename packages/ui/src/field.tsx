'use client';

import { forwardRef, useId, type InputHTMLAttributes } from 'react';
import { cn } from './components';

export interface FieldProps extends InputHTMLAttributes<HTMLInputElement> {
  label: string;
  hint?: string;
  error?: string | null;
  /** Force LTR for inherently left-to-right values (phone, email, codes) while keeping RTL labels. */
  ltr?: boolean;
}

export const Field = forwardRef<HTMLInputElement, FieldProps>(function Field(
  { label, hint, error, ltr, className, id, ...rest },
  ref,
) {
  const autoId = useId();
  const inputId = id ?? autoId;
  const describedBy = [hint && `${inputId}-hint`, error && `${inputId}-error`].filter(Boolean).join(' ') || undefined;
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={inputId} className="text-sm font-medium text-ink-700">
        {label}
      </label>
      <input
        ref={ref}
        id={inputId}
        dir={ltr ? 'ltr' : undefined}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy}
        className={cn(
          'h-12 rounded-xl border bg-white px-4 text-base text-ink-900 placeholder:text-ink-500/70',
          'focus:border-brand-500 focus:ring-2 focus:ring-brand-100 focus:outline-none',
          error ? 'border-danger-600' : 'border-sand-300',
          className,
        )}
        {...rest}
      />
      {hint && !error && (
        <p id={`${inputId}-hint`} className="text-xs text-ink-500">
          {hint}
        </p>
      )}
      {error && (
        <p id={`${inputId}-error`} role="alert" className="text-sm text-danger-600">
          {error}
        </p>
      )}
    </div>
  );
});
