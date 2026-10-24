import { useEffect, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router';
import { Banner, Button, Spinner } from '../../design/components';
import { t } from '../../i18n/es';
import { useDonationResult, usePayPalReturn, useRefreshAfterDonation } from './api';
import { formatLongDate } from './format';

const WAIT_MS = 60_000;

/** Back from the provider: thanks / still confirming / nothing charged (FR-008, research R7). */
export function ResultPage() {
  const [params] = useSearchParams();
  const id = params.get('donation');
  const canceled = params.get('canceled') === '1';
  const [pollUntil] = useState(() => Date.now() + WAIT_MS);
  const [now, setNow] = useState(() => Date.now());
  const result = useDonationResult(canceled ? null : id, pollUntil);
  const paypalReturn = usePayPalReturn();
  const refresh = useRefreshAfterDonation();
  const capturedRef = useRef(false);
  const data = result.data;

  // PayPal: capture the approved order once on return (the webhook still confirms it).
  useEffect(() => {
    if (
      data?.provider !== 'PAYPAL' ||
      data.kind !== 'ONE_TIME' ||
      data.status !== 'PENDING' ||
      capturedRef.current
    )
      return;
    capturedRef.current = true;
    paypalReturn.mutate(data.id, { onSettled: () => void result.refetch() });
  }, [data, paypalReturn, result]);

  useEffect(() => {
    if (data?.status === 'CONFIRMED') refresh();
  }, [data?.status, refresh]);

  useEffect(() => {
    if (data?.status !== 'PENDING') return;
    const timer = window.setInterval(() => {
      setNow(Date.now());
    }, 5000);
    return () => {
      window.clearInterval(timer);
    };
  }, [data?.status]);

  const actions = (
    <div className="mt-2 flex flex-col gap-2">
      <Link
        to="/support/history"
        className="inline-flex min-h-tap items-center justify-center rounded-xl border border-border font-semibold text-primary"
      >
        {t.donations.history}
      </Link>
      <Link
        to="/"
        className="inline-flex min-h-tap items-center justify-center font-semibold text-primary"
      >
        {t.donations.goHome}
      </Link>
    </div>
  );

  const failed =
    canceled || id === null || data?.status === 'CANCELED' || data?.status === 'FAILED';
  if (failed) {
    return (
      <section className="flex flex-col gap-3 pt-6">
        <h1 className="text-2xl font-bold">{t.donations.resultCanceledTitle}</h1>
        <p className="text-text-muted">{t.donations.resultCanceledBody}</p>
        <Link
          to="/support"
          className="inline-flex min-h-tap items-center justify-center rounded-xl bg-primary font-semibold text-on-primary"
        >
          {t.donations.tryAgain}
        </Link>
        <Link
          to="/"
          className="inline-flex min-h-tap items-center justify-center font-semibold text-primary"
        >
          {t.donations.goHome}
        </Link>
      </section>
    );
  }

  if (data === undefined) {
    return result.isError ? (
      <Banner
        tone="danger"
        action={
          <Button variant="secondary" onClick={() => void result.refetch()}>
            {t.common.retry}
          </Button>
        }
      >
        {t.common.loadError}
      </Banner>
    ) : (
      <div className="flex justify-center pt-10 text-primary">
        <Spinner />
      </div>
    );
  }

  if (data.status === 'PENDING') {
    const slow = now >= pollUntil;
    return (
      <section className="flex flex-col gap-3 pt-6" aria-live="polite">
        <h1 className="text-2xl font-bold">{t.donations.resultPendingTitle}</h1>
        {!slow && (
          <div className="text-primary">
            <Spinner />
          </div>
        )}
        <p className="text-text-muted">
          {slow ? t.donations.resultSlowBody : t.donations.resultPendingBody}
        </p>
        {actions}
      </section>
    );
  }

  return (
    <section className="flex flex-col gap-3 pt-6" aria-live="polite">
      <h1 className="text-2xl font-bold">{t.donations.resultThanksTitle}</h1>
      <p className="text-text-muted">{t.donations.resultThanksBody}</p>
      {data.adFreeUntil !== null && (
        <Banner tone="success">{t.donations.adFreeUntil(formatLongDate(data.adFreeUntil))}</Banner>
      )}
      {actions}
    </section>
  );
}
