import { cx } from '../cx';

export function Spinner({ label = 'Cargando', className }: { label?: string; className?: string }) {
  return (
    <span role="status" className={cx('inline-flex items-center', className)}>
      <span
        aria-hidden
        className="size-5 animate-spin rounded-full border-2 border-current border-t-transparent"
      />
      <span className="sr-only">{label}</span>
    </span>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return <div aria-hidden className={cx('animate-pulse rounded-card bg-surface-muted', className)} />;
}
