import { type InputHTMLAttributes, type Ref, useId } from 'react';
import { cx } from '../cx';

export interface TextFieldProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'id'> {
  label: string;
  hint?: string | undefined;
  error?: string | undefined;
  suffix?: string;
  ref?: Ref<HTMLInputElement>;
}

export function TextField({ label, hint, error, suffix, className, ...input }: TextFieldProps) {
  const id = useId();
  const hintId = `${id}-hint`;
  const errorId = `${id}-error`;
  const describedBy = [hint !== undefined && hintId, error !== undefined && errorId]
    .filter(Boolean)
    .join(' ');
  return (
    <div className={cx('flex flex-col gap-1.5', className)}>
      <label htmlFor={id} className="font-medium">
        {label}
      </label>
      <div className="relative">
        <input
          id={id}
          aria-invalid={error !== undefined || undefined}
          aria-describedby={describedBy || undefined}
          className={cx(
            'min-h-tap w-full rounded-xl border bg-surface px-3.5 py-2.5 text-base text-text',
            'placeholder:text-text-muted',
            error !== undefined ? 'border-danger' : 'border-border',
            suffix !== undefined && 'pr-12',
          )}
          {...input}
        />
        {suffix !== undefined && (
          <span className="pointer-events-none absolute inset-y-0 right-3.5 flex items-center text-text-muted">
            {suffix}
          </span>
        )}
      </div>
      {hint !== undefined && (
        <p id={hintId} className="text-sm text-text-muted">
          {hint}
        </p>
      )}
      {error !== undefined && (
        <p id={errorId} className="text-sm font-medium text-danger">
          {error}
        </p>
      )}
    </div>
  );
}
