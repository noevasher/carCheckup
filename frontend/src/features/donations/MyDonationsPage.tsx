import type { DonationItemDto, SubscriptionDto } from '@car-checkup/shared/dto';
import { useState } from 'react';
import { Link } from 'react-router';
import { Banner, Button, ConfirmDialog, Skeleton } from '../../design/components';
import { messageForError, t } from '../../i18n/es';
import { formatDate } from '../../lib/format';
import { useCancelSubscription, useDonationHistory, useManageLink } from './api';
import { errorCode, formatLongDate, formatMxn, providerLabel } from './format';

function SubscriptionBlock({ sub }: { sub: SubscriptionDto }) {
  const cancel = useCancelSubscription();
  const manage = useManageLink();
  const [confirm, setConfirm] = useState(false);
  const live = sub.status === 'ACTIVE' || sub.status === 'PAST_DUE';
  const error = cancel.error ?? manage.error;

  return (
    <section
      className="rounded-card border border-border bg-surface p-5"
      aria-labelledby="monthly-title"
    >
      <h2 id="monthly-title" className="text-lg font-semibold">
        {t.donations.subscriptionTitle}
      </h2>
      <p className="mt-1 text-2xl font-bold">
        {formatMxn(sub.amount)}{' '}
        <span className="text-base font-medium text-text-muted">{t.donations.perMonth}</span>
      </p>
      <p className="mt-1 text-text-muted">
        {providerLabel(sub.provider)} · {t.donations.subscriptionStatus[sub.status]}
      </p>
      {sub.status === 'ACTIVE' && sub.nextChargeAt !== null && (
        <p className="mt-2">{t.donations.nextCharge(formatLongDate(sub.nextChargeAt))}</p>
      )}
      {sub.status === 'CANCELED' && sub.paidUntil !== null && (
        <p className="mt-2">{t.donations.activeUntil(formatLongDate(sub.paidUntil))}</p>
      )}

      {sub.status === 'PAST_DUE' && (
        <Banner
          tone="warning"
          className="mt-3"
          action={
            sub.provider === 'STRIPE' ? (
              <Button
                variant="secondary"
                loading={manage.isPending}
                onClick={() => {
                  manage.mutate(undefined, {
                    onSuccess: ({ url }) => {
                      window.location.assign(url);
                    },
                  });
                }}
              >
                {t.donations.updateCard}
              </Button>
            ) : undefined
          }
        >
          {sub.provider === 'STRIPE' ? t.donations.pastDueCard : t.donations.pastDuePayPal}
        </Banner>
      )}

      {error !== null && (
        <Banner tone="danger" className="mt-3">
          {messageForError(errorCode(error))}
        </Banner>
      )}
      {cancel.isSuccess && (
        <Banner tone="success" className="mt-3">
          {t.donations.canceled}
        </Banner>
      )}

      {live && (
        <>
          <Button
            variant="danger"
            block
            className="mt-4"
            onClick={() => {
              setConfirm(true);
            }}
          >
            {t.donations.cancelMonthly}
          </Button>
          <p className="mt-2 text-sm text-text-muted">{t.donations.changeAmountNote}</p>
        </>
      )}

      <ConfirmDialog
        open={confirm}
        onOpenChange={setConfirm}
        title={t.donations.cancelTitle}
        description={t.donations.cancelBody(
          sub.paidUntil === null ? null : formatLongDate(sub.paidUntil),
        )}
        confirmLabel={t.donations.cancelConfirm}
        cancelLabel={t.donations.cancelKeep}
        tone="danger"
        loading={cancel.isPending}
        onConfirm={() => {
          cancel.mutate(undefined, {
            onSettled: () => {
              setConfirm(false);
            },
          });
        }}
      />
    </section>
  );
}

function DonationRow({ item }: { item: DonationItemDto }) {
  const tone =
    item.status === 'CONFIRMED'
      ? 'text-success'
      : item.status === 'PENDING'
        ? 'text-text-muted'
        : 'text-warning';
  return (
    <li className="flex items-start justify-between gap-3 border-t border-border py-3 first:border-t-0">
      <div>
        <p className="font-semibold">{formatMxn(item.amount)}</p>
        <p className="text-sm text-text-muted">
          {item.kind === 'ONE_TIME' ? t.donations.oneTime : t.donations.monthlyCharge} ·{' '}
          {providerLabel(item.provider)} · {formatDate(item.confirmedAt ?? item.createdAt)}
        </p>
      </div>
      <p className={`text-sm font-medium ${tone}`}>{t.donations.status[item.status]}</p>
    </li>
  );
}

/** "Mis donaciones" (FR-010, FR-014b, FR-014c, FR-016). */
export function MyDonationsPage() {
  const history = useDonationHistory();

  if (history.data === undefined) {
    return history.isError ? (
      <Banner
        tone="danger"
        action={
          <Button variant="secondary" onClick={() => void history.refetch()}>
            {t.common.retry}
          </Button>
        }
      >
        {t.common.loadError}
      </Banner>
    ) : (
      <div className="flex flex-col gap-4" aria-busy>
        <Skeleton className="h-9 w-2/3" />
        <Skeleton className="h-40" />
      </div>
    );
  }

  const { items, subscription, adFreeUntil, supportEmail } = history.data;
  return (
    <section className="flex flex-col gap-5">
      <div>
        <Link to="/support" className="inline-flex min-h-tap items-center text-primary">
          ← {t.common.back}
        </Link>
        <h1 className="text-2xl font-bold">{t.donations.history}</h1>
      </div>

      {adFreeUntil !== null && (
        <Banner tone="success">{t.donations.adFreeUntil(formatLongDate(adFreeUntil))}</Banner>
      )}
      {subscription !== null && <SubscriptionBlock sub={subscription} />}

      {items.length === 0 ? (
        <div className="rounded-card border border-border bg-surface p-5">
          <p className="text-text-muted">{t.donations.historyEmpty}</p>
          <Link
            to="/support"
            className="mt-3 inline-flex min-h-tap items-center font-semibold text-primary"
          >
            {t.donations.historyEmptyAction} →
          </Link>
        </div>
      ) : (
        <ul
          className="rounded-card border border-border bg-surface px-5"
          aria-label={t.donations.history}
        >
          {items.map((item) => (
            <DonationRow key={item.id} item={item} />
          ))}
        </ul>
      )}

      {supportEmail !== null && (
        <p className="text-sm text-text-muted">
          {t.donations.contactPrefix}
          <a href={`mailto:${supportEmail}`} className="font-medium text-primary underline">
            {supportEmail}
          </a>
          .
        </p>
      )}
    </section>
  );
}
