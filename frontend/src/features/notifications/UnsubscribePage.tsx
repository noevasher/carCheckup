import { useState } from 'react';
import { Link, useSearchParams } from 'react-router';
import { Banner, Button } from '../../design/components';
import { t } from '../../i18n/es';
import { env } from '../../lib/env';

type State = 'confirm' | 'busy' | 'done' | 'undone' | 'invalid' | 'error';

async function call(path: 'unsubscribe' | 'resubscribe', token: string): Promise<'ok' | 'invalid' | 'error'> {
  try {
    const res = await fetch(`${env.VITE_API_URL}/public/${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token }),
    });
    if (res.ok) return 'ok';
    return res.status === 404 || res.status === 422 ? 'invalid' : 'error';
  } catch {
    return 'error';
  }
}

/**
 * Public page of the email unsubscribe link (FR-014, research R10). It never unsubscribes on
 * load (link scanners open pages): the user confirms with a button and can undo.
 */
export function UnsubscribePage() {
  const [params] = useSearchParams();
  const token = params.get('token') ?? '';
  const [state, setState] = useState<State>(token === '' ? 'invalid' : 'confirm');
  const u = t.notifications.unsubscribe;

  const run = (path: 'unsubscribe' | 'resubscribe') => {
    setState('busy');
    void call(path, token).then((r) => {
      setState(r === 'ok' ? (path === 'unsubscribe' ? 'done' : 'undone') : r);
    });
  };

  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center gap-4 px-4 py-8">
      <p className="text-lg font-bold text-primary">{t.appName}</p>
      <h1 className="text-2xl font-bold text-primary">{u.title}</h1>
      {(state === 'confirm' || state === 'busy') && (
        <>
          <p>{u.body}</p>
          <Button
            size="lg"
            block
            loading={state === 'busy'}
            onClick={() => {
              run('unsubscribe');
            }}
          >
            {u.confirm}
          </Button>
        </>
      )}
      {state === 'done' && (
        <>
          <Banner tone="success">{u.done}</Banner>
          <Button
            variant="secondary"
            block
            onClick={() => {
              run('resubscribe');
            }}
          >
            {u.undo}
          </Button>
        </>
      )}
      {state === 'undone' && <Banner tone="success">{u.undone}</Banner>}
      {state === 'invalid' && <Banner tone="warning">{u.invalid}</Banner>}
      {state === 'error' && <Banner tone="danger">{u.error}</Banner>}
      <Link to="/" className="mt-2 font-medium text-primary underline">
        {u.openApp}
      </Link>
    </main>
  );
}
