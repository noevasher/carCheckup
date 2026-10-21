import { Link } from 'react-router';
import { cx } from '../design/cx';
import { t } from '../i18n/es';
import { dismissNotice, useNotices } from './notices';

const tones = {
  info: 'bg-info-bg text-text',
  success: 'bg-success-bg text-success',
  warning: 'bg-warning-bg text-warning',
  danger: 'bg-danger-bg text-danger',
} as const;

/** Compact, dismissible notices (sync results, offline saves). */
export function SyncNotices() {
  const notices = useNotices();
  if (notices.length === 0) return null;
  return (
    <ul className="mb-4 flex flex-col gap-2" aria-live="polite">
      {notices.map((n) => (
        <li
          key={n.id}
          role={n.tone === 'danger' || n.tone === 'warning' ? 'alert' : 'status'}
          className={cx('flex items-center gap-2 rounded-card py-1 pr-1 pl-4 font-medium', tones[n.tone])}
        >
          <span className="flex-1 py-2">{n.text}</span>
          {n.action !== undefined && (
            <Link
              to={n.action.to}
              className="inline-flex min-h-tap shrink-0 items-center px-2 font-semibold underline"
              onClick={() => {
                dismissNotice(n.id);
              }}
            >
              {n.action.label}
            </Link>
          )}
          <button
            type="button"
            aria-label={t.common.close}
            className="inline-flex size-tap shrink-0 items-center justify-center rounded-xl text-xl"
            onClick={() => {
              dismissNotice(n.id);
            }}
          >
            <span aria-hidden>×</span>
          </button>
        </li>
      ))}
    </ul>
  );
}
