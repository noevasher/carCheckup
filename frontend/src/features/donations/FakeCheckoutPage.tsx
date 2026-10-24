import { useNavigate, useSearchParams } from 'react-router';
import { Banner, Button } from '../../design/components';
import { t } from '../../i18n/es';
import { useFakeComplete } from './api';
import { formatMxn } from './format';

/** Simulated provider page (development and e2e only, research R8). */
export function FakeCheckoutPage() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const complete = useFakeComplete();
  const id = params.get('id') ?? '';
  const amount = Number(params.get('amount') ?? 0);
  const monthly = params.get('kind') === 'MONTHLY';
  const provider = params.get('provider') === 'PAYPAL' ? t.donations.paypal : t.donations.card;

  const finish = (outcome: 'paid' | 'canceled') => {
    complete.mutate(
      { id, outcome },
      {
        onSuccess: () => {
          void navigate(
            `/support/result?donation=${id}${outcome === 'canceled' ? '&canceled=1' : ''}`,
            { replace: true },
          );
        },
      },
    );
  };

  return (
    <section className="flex flex-col gap-4 pt-6">
      <h1 className="text-2xl font-bold">
        {t.donations.fakeTitle} · {provider}
      </h1>
      <p className="text-3xl font-bold">
        {formatMxn(amount)} {monthly ? t.donations.perMonth : ''}
      </p>
      <Banner tone="info">{t.donations.fakeBody}</Banner>
      <Button
        size="lg"
        block
        loading={complete.isPending && complete.variables.outcome === 'paid'}
        onClick={() => {
          finish('paid');
        }}
      >
        {t.donations.fakePay}
      </Button>
      <Button
        variant="ghost"
        block
        onClick={() => {
          finish('canceled');
        }}
      >
        {t.donations.fakeCancel}
      </Button>
    </section>
  );
}
