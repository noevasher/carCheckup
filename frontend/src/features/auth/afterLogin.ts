const KEY = 'car-checkup:after-login';

/** Only same-origin relative paths (no open redirects). */
const isSafePath = (path: string): boolean => path.startsWith('/') && !path.startsWith('//') && !path.startsWith('/login');

/** Remembers where the user wanted to go before being sent to /login (FR-012 of 003). */
export function rememberTarget(path: string): void {
  if (!isSafePath(path) || path === '/') return;
  try {
    sessionStorage.setItem(KEY, path);
  } catch {
    // Storage unavailable: the user lands on the home screen.
  }
}

export function peekTarget(): string | null {
  try {
    const path = sessionStorage.getItem(KEY);
    return path !== null && isSafePath(path) ? path : null;
  } catch {
    return null;
  }
}

export function consumeTarget(): string | null {
  const path = peekTarget();
  try {
    sessionStorage.removeItem(KEY);
  } catch {
    // ignore
  }
  return path;
}
