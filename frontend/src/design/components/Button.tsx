import type { ButtonHTMLAttributes, Ref } from 'react';
import { cx } from '../cx';
import { Spinner } from './Spinner';

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger';

const variants: Record<Variant, string> = {
  primary: 'bg-primary text-on-primary hover:bg-primary-hover',
  secondary: 'border border-border bg-surface text-text hover:bg-surface-muted',
  ghost: 'text-primary hover:bg-surface-muted',
  danger: 'border border-danger bg-surface text-danger hover:bg-danger-bg',
};

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: 'md' | 'lg';
  loading?: boolean;
  block?: boolean;
  ref?: Ref<HTMLButtonElement>;
}

export function Button({
  variant = 'primary',
  size = 'md',
  loading = false,
  block = false,
  disabled,
  className,
  children,
  type = 'button',
  ...rest
}: ButtonProps) {
  return (
    <button
      type={type}
      disabled={disabled === true || loading}
      aria-busy={loading || undefined}
      className={cx(
        'inline-flex min-h-tap items-center justify-center gap-2 rounded-xl px-4 font-semibold transition-colors',
        'disabled:cursor-not-allowed disabled:opacity-60',
        size === 'lg' ? 'min-h-14 text-lg' : 'text-base',
        block && 'w-full',
        variants[variant],
        className,
      )}
      {...rest}
    >
      {loading && <Spinner label="Procesando" />}
      {children}
    </button>
  );
}
