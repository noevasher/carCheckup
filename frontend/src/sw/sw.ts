/// <reference lib="webworker" />
import { clientsClaim } from 'workbox-core';
import { cleanupOutdatedCaches, createHandlerBoundToURL, precacheAndRoute } from 'workbox-precaching';
import { NavigationRoute, registerRoute } from 'workbox-routing';

declare const self: ServiceWorkerGlobalScope & {
  __WB_MANIFEST: (string | { url: string; revision: string | null })[];
};

// App shell (same behavior as the former generateSW config).
void self.skipWaiting();
clientsClaim();
cleanupOutdatedCaches();
precacheAndRoute(self.__WB_MANIFEST);
if (import.meta.env.PROD) {
  registerRoute(
    new NavigationRoute(createHandlerBoundToURL('/index.html'), {
      denylist: [/^\/v1\//, /^\/public\//, /^\/webhooks\//, /^\/internal\//],
    }),
  );
}

interface PushPayload {
  title: string;
  body: string;
  url: string;
  tag: string;
}

function parsePayload(data: PushMessageData | null): PushPayload | null {
  if (data === null) return null;
  try {
    const value: unknown = data.json();
    if (typeof value !== 'object' || value === null) return null;
    const { title, body, url, tag } = value as Record<string, unknown>;
    if (typeof title !== 'string' || typeof body !== 'string' || typeof url !== 'string' || typeof tag !== 'string') {
      return null;
    }
    // Only same-origin relative URLs are opened.
    return { title, body, url: url.startsWith('/') && !url.startsWith('//') ? url : '/', tag };
  } catch {
    return null;
  }
}

// Daily reminder digest (feature 003). No action buttons: tapping opens the app (FR-012).
self.addEventListener('push', (event) => {
  const payload = parsePayload(event.data);
  if (payload === null) return;
  event.waitUntil(
    self.registration.showNotification(payload.title, {
      body: payload.body,
      tag: payload.tag,
      icon: '/icons/pwa-192x192.png',
      badge: '/icons/pwa-64x64.png',
      lang: 'es',
      data: { url: payload.url },
    }),
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const data: unknown = event.notification.data;
  const path =
    typeof data === 'object' && data !== null && 'url' in data && typeof data.url === 'string' ? data.url : '/';
  const target = new URL(path, self.location.origin).href;
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(async (clients) => {
      const client = clients.find((c) => new URL(c.url).origin === self.location.origin);
      if (client !== undefined) {
        await client.focus();
        await client.navigate(target);
        return;
      }
      await self.clients.openWindow(target);
    }),
  );
});
