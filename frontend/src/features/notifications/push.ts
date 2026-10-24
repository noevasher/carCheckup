import { apiFetch } from '../../lib/api';
import { env } from '../../lib/env';

export type PushSupport = 'supported' | 'needs-install' | 'unsupported';
export type SubscribeResult = 'subscribed' | 'denied' | 'needs-install' | 'unsupported';

const isIos = (): boolean => /iPad|iPhone|iPod/.test(navigator.userAgent);
const isStandalone = (): boolean =>
  window.matchMedia('(display-mode: standalone)').matches ||
  ('standalone' in navigator && (navigator as { standalone?: boolean }).standalone === true);

/** Whether this device can receive Web Push (iPhone needs the app installed, iOS 16.4+). */
export function pushSupport(): PushSupport {
  const apis = 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
  if (isIos() && !isStandalone()) return 'needs-install';
  return apis && env.VITE_VAPID_PUBLIC_KEY !== undefined ? 'supported' : 'unsupported';
}

export const notificationPermission = (): NotificationPermission | 'unsupported' =>
  'Notification' in window ? Notification.permission : 'unsupported';

function urlBase64ToUint8Array(base64: string): Uint8Array<ArrayBuffer> {
  const padded = (base64 + '='.repeat((4 - (base64.length % 4)) % 4)).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(padded);
  const bytes = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i += 1) bytes[i] = raw.charCodeAt(i);
  return bytes;
}

async function registration(): Promise<ServiceWorkerRegistration | null> {
  const timeout = new Promise<null>((resolve) => {
    setTimeout(() => {
      resolve(null);
    }, 10_000);
  });
  return Promise.race([navigator.serviceWorker.ready, timeout]);
}

/** Asks for permission and registers this device for push (FR-008, research R11). */
export async function subscribeToPush(): Promise<SubscribeResult> {
  const support = pushSupport();
  if (support !== 'supported') return support;
  const key = env.VITE_VAPID_PUBLIC_KEY;
  if (key === undefined) return 'unsupported';
  const permission = await Notification.requestPermission();
  if (permission !== 'granted') return 'denied';
  const reg = await registration();
  if (reg === null) return 'unsupported';
  const subscription =
    (await reg.pushManager.getSubscription()) ??
    (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlBase64ToUint8Array(key) }));
  const json = subscription.toJSON();
  const p256dh = json.keys?.['p256dh'];
  const auth = json.keys?.['auth'];
  if (json.endpoint === undefined || p256dh === undefined || auth === undefined) return 'unsupported';
  await apiFetch('/v1/push-subscriptions', {
    method: 'POST',
    body: { endpoint: json.endpoint, keys: { p256dh, auth }, userAgent: navigator.userAgent.slice(0, 300) },
  });
  return 'subscribed';
}

/** Removes this device's subscription (on sign-out), ignoring errors. */
export async function unsubscribeFromPush(): Promise<void> {
  try {
    if (!('serviceWorker' in navigator)) return;
    const reg = await navigator.serviceWorker.getRegistration();
    const subscription = await reg?.pushManager.getSubscription();
    if (subscription === null || subscription === undefined) return;
    await apiFetch('/v1/push-subscriptions', { method: 'DELETE', body: { endpoint: subscription.endpoint } }).catch(() => undefined);
    await subscription.unsubscribe();
  } catch {
    // Best effort.
  }
}
