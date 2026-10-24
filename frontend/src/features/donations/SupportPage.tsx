import { isValidDonationAmount } from '@car-checkup/shared/donations';
import { useRef, useState } from 'react';
import { Link } from 'react-router';
import { Banner, Button, Skeleton, TextField } from '../../design/components';
import { cx } from '../../design/cx';
import { messageForError, t } from '../../i18n/es';
import { useDonationConfig, useStartDonation } from './api';
import {
  type ErrorCode,
  errorCode,
  formatLongDate,
  formatMxn,
  providerLabel,
  useOnline,
} from './format';

type Kind = 'ONE_TIME' | 'MONTHLY';
type Provider = 'STRIPE' | 'PAYPAL';

function Choice({
  selected,
  onClick,
  children,
}: {
  selected: boolean;
  onClick: () => void;
  children: string;
}) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      onClick={onClick}
      className={cx(
        'min-h-tap rounded-xl border px-3 font-semibold',
        selected
          ? 'border-primary bg-primary text-on-primary'
          : 'border-border bg-surface text-text',
      )}
    >
      {children}
    </button>
  );
}

/** "Apoya Car Checkup" (FR-001–FR-004, FR-014): amount, frequency and provider in one screen. */
export function SupportPage() {
  const config = useDonationConfig();
  const start = useStartDonation();
  const online = useOnline();
  const [kind, setKind] = useState<Kind>('ONE_TIME');
  const [preset, setPreset] = useState<number | null>(100);
  const [custom, setCustom] = useState('');
  const [failed, setFailed] = useState<{ provider: Provider; code: ErrorCode } | null>(null);
  // One idempotency key per (kind, amount, provider): a double tap reuses the same checkout (R4).
  const keys = useRef(new Map<string, string>());

  if (config.data === undefined) {
    return config.isError ? (
      <Banner
        tone="danger"
        action={
          <Button variant="secondary" onClick={() => void config.refetch()}>
            {t.common.retry}
          </Button>
        }
      >
        {t.common.loadError}
      </Banner>
    ) : (
      <div className="flex flex-col gap-4" aria-busy>
        <Skeleton className="h-9 w-2/3" />
        <Skeleton className="h-64" />
      </div>
    );
  }

  const { providers, presets, minAmount, maxAmount, adFreeUntil, subscription } = config.data;
  const amount = preset ?? (custom === '' ? NaN : Number(custom));
  const amountValid = isValidDonationAmount(amount);
  const hasMonthly =
    subscription !== null &&
    (subscription.status === 'ACTIVE' || subscription.status === 'PAST_DUE');
  const blockedMonthly = kind === 'MONTHLY' && hasMonthly;

  const pay = (provider: Provider) => {
    if (!amountValid) return;
    const id = `${kind}:${String(amount)}:${provider}`;
    const checkoutKey = keys.current.get(id) ?? crypto.randomUUID();
    keys.current.set(id, checkoutKey);
    setFailed(null);
    start.mutate(
      { kind, amount, provider, checkoutKey },
      {
        onSuccess: ({ redirectUrl }) => {
          window.location.assign(redirectUrl);
        },
        onError: (err) => {
          setFailed({ provider, code: errorCode(err) });
        },
      },
    );
  };

  const otherProvider = (p: Provider) => {
    const other = providers.find((x) => x !== p);
    return other === undefined ? null : providerLabel(other);
  };

  return (
    <section className="flex flex-col gap-5">
      <div>
        <Link to="/" className="inline-flex min-h-tap items-center text-primary">
          ← {t.common.back}
        </Link>
        <h1 className="text-2xl font-bold">{t.donations.title}</h1>
        <p className="mt-2 text-text-muted">{t.donations.why}</p>
      </div>

      {adFreeUntil !== null && (
        <Banner tone="success">{t.donations.adFreeUntil(formatLongDate(adFreeUntil))}</Banner>
      )}

      {providers.length === 0 ? (
        <Banner tone="info">{t.donations.unavailableAll}</Banner>
      ) : (
        <>
          <fieldset>
            <legend className="mb-2 font-medium">{t.donations.frequency}</legend>
            <div className="grid grid-cols-2 gap-2">
              <Choice
                selected={kind === 'ONE_TIME'}
                onClick={() => {
                  setKind('ONE_TIME');
                }}
              >
                {t.donations.once}
              </Choice>
              <Choice
                selected={kind === 'MONTHLY'}
                onClick={() => {
                  setKind('MONTHLY');
                }}
              >
                {t.donations.monthly}
              </Choice>
            </div>
            <p className="mt-2 text-sm text-text-muted">
              {kind === 'ONE_TIME' ? t.donations.benefitRule : t.donations.monthlyBenefit}
            </p>
          </fieldset>

          {blockedMonthly ? (
            <Banner
              tone="info"
              action={
                <Link
                  to="/support/history"
                  className="inline-flex min-h-tap items-center font-semibold text-primary underline"
                >
                  {t.donations.manageMonthly}
                </Link>
              }
            >
              {t.donations.hasMonthly}
            </Banner>
          ) : (
            <>
              <fieldset>
                <legend className="mb-2 font-medium">{t.donations.amountLegend}</legend>
                <div className="grid grid-cols-2 gap-2">
                  {presets.map((p) => (
                    <Choice
                      key={p}
                      selected={preset === p}
                      onClick={() => {
                        setPreset(p);
                      }}
                    >
                      {kind === 'MONTHLY'
                        ? `${formatMxn(p)} ${t.donations.perMonth}`
                        : formatMxn(p)}
                    </Choice>
                  ))}
                  <Choice
                    selected={preset === null}
                    onClick={() => {
                      setPreset(null);
                    }}
                  >
                    {t.donations.otherAmount}
                  </Choice>
                </div>
                {preset === null && (
                  <TextField
                    className="mt-3"
                    label={t.donations.otherAmountLabel}
                    inputMode="numeric"
                    pattern="[0-9]*"
                    autoFocus
                    suffix="MXN"
                    value={custom}
                    onChange={(e) => {
                      setCustom(e.target.value.replace(/\D/g, ''));
                    }}
                    hint={t.donations.amountRange(minAmount, maxAmount)}
                    error={
                      custom !== '' && !amountValid
                        ? t.donations.amountRange(minAmount, maxAmount)
                        : undefined
                    }
                  />
                )}
              </fieldset>

              <fieldset>
                <legend className="mb-2 font-medium">{t.donations.payWith}</legend>
                {!online && (
                  <Banner tone="warning" className="mb-3">
                    {t.donations.offline}
                  </Banner>
                )}
                {failed !== null && (
                  <Banner tone="danger" className="mb-3">
                    {failed.code === 'PROVIDER_UNAVAILABLE'
                      ? t.donations.providerDown(
                          providerLabel(failed.provider),
                          otherProvider(failed.provider),
                        )
                      : messageForError(failed.code)}
                  </Banner>
                )}
                <div className="flex flex-col gap-2">
                  {providers.map((p) => (
                    <Button
                      key={p}
                      size="lg"
                      block
                      variant={p === 'STRIPE' ? 'primary' : 'secondary'}
                      disabled={
                        !online ||
                        !amountValid ||
                        (start.isPending && start.variables.provider !== p)
                      }
                      loading={start.isPending && start.variables.provider === p}
                      onClick={() => {
                        pay(p);
                      }}
                    >
                      {providerLabel(p)}
                    </Button>
                  ))}
                </div>
                <p className="mt-3 text-sm text-text-muted">{t.donations.secureNote}</p>
              </fieldset>
            </>
          )}
        </>
      )}

      <Link
        to="/support/history"
        className="inline-flex min-h-tap items-center font-semibold text-primary"
      >
        {t.donations.history} →
      </Link>
    </section>
  );
}
