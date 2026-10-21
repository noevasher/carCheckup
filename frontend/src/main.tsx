import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';

const container = document.getElementById('root');
if (container === null) throw new Error('Missing #root element');
const root = createRoot(container);

function ConfigError({ variables }: { variables: string[] }) {
  return (
    <main className="mx-auto max-w-md px-4 py-10">
      <h1 className="text-xl font-bold text-danger">Falta configurar la app</h1>
      <p className="mt-3">
        Faltan o no son válidas estas variables de entorno: <strong>{variables.join(', ')}</strong>.
      </p>
      <p className="mt-3">
        Copia <code>frontend/.env.example</code> a <code>frontend/.env</code>, rellena los valores y
        reinicia <code>npm run dev</code>.
      </p>
    </main>
  );
}

const isEnvConfigError = (err: unknown): err is Error & { variables: string[] } =>
  err instanceof Error &&
  err.name === 'EnvConfigError' &&
  'variables' in err &&
  Array.isArray(err.variables);

// The app is imported dynamically so a configuration error can be shown instead of a blank page.
Promise.all([import('react-router/dom'), import('./app/providers'), import('./app/router')])
  .then(([{ RouterProvider }, { Providers }, { router }]) => {
    root.render(
      <StrictMode>
        <Providers>
          <RouterProvider router={router} />
        </Providers>
      </StrictMode>,
    );
  })
  .catch((err: unknown) => {
    if (isEnvConfigError(err)) {
      root.render(<ConfigError variables={err.variables} />);
      return;
    }
    throw err;
  });
