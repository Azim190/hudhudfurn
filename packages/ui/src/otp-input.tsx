'use client';

import { useRef, type ClipboardEvent, type KeyboardEvent } from 'react';
import { cn } from './components';

const ARABIC_INDIC = /[٠-٩]/g;
const toLatin = (s: string) => s.replace(ARABIC_INDIC, (d) => String(d.charCodeAt(0) - 0x0660));

export interface OtpInputProps {
  length: number;
  value: string;
  onChange: (value: string) => void;
  label: string;
  disabled?: boolean;
  invalid?: boolean;
  autoFocus?: boolean;
}

/**
 * One box per digit. Always laid out LTR (codes are read left to right in both languages),
 * accepts Arabic-Indic digits, paste, and SMS autofill via autocomplete="one-time-code".
 */
export function OtpInput({ length, value, onChange, label, disabled, invalid, autoFocus }: OtpInputProps) {
  const refs = useRef<Array<HTMLInputElement | null>>([]);
  const digits = Array.from({ length }, (_, i) => value[i] ?? '');

  const setAt = (index: number, digit: string) => {
    const next = digits.slice();
    next[index] = digit;
    onChange(next.join('').slice(0, length));
  };

  const handleInput = (index: number, raw: string) => {
    const clean = toLatin(raw).replace(/\D/g, '');
    if (clean.length > 1) {
      // Autofill or fast typing delivered several digits at once.
      onChange((digits.slice(0, index).join('') + clean).slice(0, length));
      refs.current[Math.min(index + clean.length, length - 1)]?.focus();
      return;
    }
    setAt(index, clean);
    if (clean && index < length - 1) refs.current[index + 1]?.focus();
  };

  const handleKey = (index: number, e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Backspace' && !digits[index] && index > 0) refs.current[index - 1]?.focus();
    if (e.key === 'ArrowLeft' && index > 0) refs.current[index - 1]?.focus();
    if (e.key === 'ArrowRight' && index < length - 1) refs.current[index + 1]?.focus();
  };

  const handlePaste = (e: ClipboardEvent<HTMLInputElement>) => {
    e.preventDefault();
    const pasted = toLatin(e.clipboardData.getData('text')).replace(/\D/g, '').slice(0, length);
    if (pasted) {
      onChange(pasted);
      refs.current[Math.min(pasted.length, length - 1)]?.focus();
    }
  };

  return (
    <fieldset className="flex flex-col gap-2" disabled={disabled}>
      <legend className="mb-1.5 text-sm font-medium text-ink-700">{label}</legend>
      <div dir="ltr" className="flex justify-center gap-2">
        {digits.map((d, i) => (
          <input
            key={i}
            ref={(el) => {
              refs.current[i] = el;
            }}
            value={d}
            inputMode="numeric"
            autoComplete={i === 0 ? 'one-time-code' : 'off'}
            autoFocus={autoFocus && i === 0}
            aria-label={`${label} ${i + 1}`}
            aria-invalid={invalid || undefined}
            maxLength={length}
            onChange={(e) => handleInput(i, e.target.value)}
            onKeyDown={(e) => handleKey(i, e)}
            onPaste={handlePaste}
            onFocus={(e) => e.target.select()}
            className={cn(
              'size-12 rounded-xl border bg-white text-center text-xl font-semibold text-ink-900 sm:size-14',
              'focus:border-brand-500 focus:ring-2 focus:ring-brand-100 focus:outline-none',
              invalid ? 'border-danger-600' : 'border-sand-300',
            )}
          />
        ))}
      </div>
    </fieldset>
  );
}
