import type { ReactNode } from 'react';
import { cx } from '../cx';

type Tone = 'info' | 'success' | 'warning' | 'danger';

const tones: Record<Tone, string> = {
  info: 'bg-info-bg text-text',
  success: 'bg-success-bg text-success',
  warning: 'bg-warning-bg text-warning',
  danger: 'bg-danger-bg text-danger',
};

export function Banner({
  tone = 'info',
  children,
  action,
  className,
}: {
  tone?: Tone;
  children: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div
      role={tone === 'danger' || tone === 'warning' ? 'alert' : 'status'}
      className={cx('flex flex-col gap-2 rounded-card px-4 py-3 font-medium', tones[tone], className)}
    >
      <div>{children}</div>
      {action}
    </div>
  );
}
