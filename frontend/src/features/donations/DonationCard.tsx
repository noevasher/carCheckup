import { Link } from 'react-router';
import { Button } from '../../design/components';
import { t } from '../../i18n/es';
import { useDismissDonationCard } from './api';

/**
 * Discreet invitation at the end of home (FR-012a): never inside capture flows (FR-012) and never
 * for donors with an active benefit (the API decides through `showDonationCard`, FR-012b).
 */
export function DonationCard() {
  const dismiss = useDismissDonationCard();
  return (
    <aside
      className="mt-6 rounded-card border border-border bg-surface p-5"
      aria-labelledby="donation-card-title"
    >
      <h2 id="donation-card-title" className="font-semibold">
        {t.donations.cardTitle}
      </h2>
      <p className="mt-1 text-text-muted">{t.donations.cardBody}</p>
      <div className="mt-4 grid grid-cols-2 gap-2">
        <Link
          to="/support"
          className="inline-flex min-h-tap items-center justify-center rounded-xl border border-border font-semibold text-primary"
        >
          {t.donations.cardAction}
        </Link>
        <Button
          variant="ghost"
          onClick={() => {
            dismiss.mutate();
          }}
        >
          {t.donations.cardDismiss}
        </Button>
      </div>
    </aside>
  );
}
