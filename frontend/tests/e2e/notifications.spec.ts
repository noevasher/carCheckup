import { createHmac, randomUUID } from 'node:crypto';
import { expect, type Page, test } from '@playwright/test';
import { E2E } from './support/config';
import { signInAsNewUser, tokenFor } from './support/session';

/** Feature 003 (quickstart scenarios 1–4): email switch and notification permission flow. */

async function fillVehicle(page: Page, make: string, model: string) {
  await page.goto('/vehicles/new');
  await page.getByRole('combobox', { name: 'Marca' }).fill(make);
  await page.getByRole('combobox', { name: 'Modelo' }).fill(model);
  await page.getByLabel('Año').fill('2020');
  await page.getByLabel('Kilometraje actual').fill('30000');
}

const emailSwitch = (page: Page) =>
  page.getByRole('switch', { name: 'Recibir también los avisos por correo' });

test.describe('registration flow', () => {
  test.beforeEach(async ({ page }) => {
    await signInAsNewUser(page);
  });

  /** Simulates a device that has not been asked yet; the system prompt then answers "denied". */
  const notAskedYet = (page: Page) =>
    page.addInitScript(() => {
      Object.defineProperty(Notification, 'permission', {
        get: () => 'default',
        configurable: true,
      });
      Notification.requestPermission = () => Promise.resolve('denied');
    });

  test('1, 3, 4: switch off by default; denied push → email question once per vehicle', async ({
    page,
  }) => {
    await notAskedYet(page);
    await fillVehicle(page, 'Toyota', 'Yaris');
    await expect(emailSwitch(page)).toHaveAttribute('aria-checked', 'false');
    await expect(
      page.getByText('Las notificaciones en el teléfono se envían siempre.'),
    ).toBeVisible();
    await page.getByRole('button', { name: 'Guardar vehículo' }).click();

    // Explanation → permission (headless Chromium denies it) → email question.
    await expect(
      page.getByRole('heading', { name: 'Activa los avisos de mantenimiento' }),
    ).toBeVisible();
    await page.getByRole('button', { name: 'Activar notificaciones' }).click();
    await expect(
      page.getByRole('heading', { name: '¿Quieres recibir los avisos por correo?' }),
    ).toBeVisible();
    await page.getByRole('button', { name: 'Sí, por correo' }).click();
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await page.getByRole('link', { name: 'Editar' }).click();
    await expect(emailSwitch(page)).toHaveAttribute('aria-checked', 'true');

    // Second vehicle: no explanation again on this device, but the email question is asked.
    await fillVehicle(page, 'Mazda', '2');
    await page.getByRole('button', { name: 'Guardar vehículo' }).click();
    await expect(
      page.getByRole('heading', { name: '¿Quieres recibir los avisos por correo?' }),
    ).toBeVisible();
    await expect(
      page.getByRole('heading', { name: 'Activa los avisos de mantenimiento' }),
    ).toHaveCount(0);
    await page.getByRole('button', { name: 'No, gracias' }).click();
    await page.getByRole('link', { name: 'Editar' }).click();
    await expect(emailSwitch(page)).toHaveAttribute('aria-checked', 'false');
  });

  test('switch on at registration skips the email question', async ({ page }) => {
    await fillVehicle(page, 'Kia', 'Rio');
    await emailSwitch(page).click();
    await page.getByRole('button', { name: 'Guardar vehículo' }).click();
    // Headless Chromium starts with notifications denied: with email on there is nothing to ask.
    await expect(page.getByRole('heading', { name: 'Kia Rio' })).toBeVisible();
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await expect(page.getByRole('heading', { name: 'Kia Rio' })).toBeVisible();
  });

  test('2: with permission already granted no dialog is shown', async ({ page }) => {
    // Headless Chromium reports notifications as denied and has no push service, so the device
    // subscription itself is verified on real devices (quickstart 2); here we simulate "granted"
    // and check the flow does not interrupt the user.
    await page.addInitScript(() => {
      Object.defineProperty(Notification, 'permission', {
        get: () => 'granted',
        configurable: true,
      });
    });
    await fillVehicle(page, 'Seat', 'Ibiza');
    await page.getByRole('button', { name: 'Guardar vehículo' }).click();
    await expect(page.getByRole('heading', { name: 'Seat Ibiza' })).toBeVisible();
    await expect(page.getByRole('dialog')).toHaveCount(0);
  });
});

test.describe('deep links and unsubscribe', () => {
  test('US3: /?capture=<id> opens the capture, also after signing in (FR-012)', async ({
    page,
  }) => {
    const userId = randomUUID();
    const token = await tokenFor(userId);
    const created = await fetch(`${E2E.apiUrl}/v1/vehicles`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        make: 'Nissan',
        model: 'Versa',
        year: 2018,
        odometerKm: 50_000,
        initialReadingId: randomUUID(),
      }),
    });
    const vehicle = (await created.json()) as { id: string };

    // No session yet: redirected to login, then back to the capture once signed in.
    await page.goto(`/?capture=${vehicle.id}`);
    await expect(page).toHaveURL('/login');
    await signInAsNewUser(page, userId);
    await page.reload();
    await expect(page.getByRole('heading', { name: 'Actualizar kilometraje' })).toBeVisible();
    await expect(page.getByLabel('Kilometraje actual')).toBeFocused();
  });

  test('US4: unsubscribe page confirms, can undo, and rejects bad links', async ({ page }) => {
    const userId = await signInAsNewUser(page);
    await page.goto('/');
    const sig = createHmac('sha256', 'e2e-unsubscribe-secret-0123456789abcdef')
      .update(`unsub:${userId}`)
      .digest('base64url');
    const token = `${Buffer.from(userId).toString('base64url')}.${sig}`;

    await page.goto(`/unsubscribe?token=${encodeURIComponent(token)}`);
    await expect(page.getByRole('heading', { name: 'Dejar de recibir correos' })).toBeVisible();
    // Opening the page alone does not unsubscribe (link scanners).
    const me = async () => {
      const res = await fetch(`${E2E.apiUrl}/v1/me`, {
        headers: { Authorization: `Bearer ${await tokenFor(userId)}` },
      });
      return (await res.json()) as { emailUnsubscribed: boolean };
    };
    expect((await me()).emailUnsubscribed).toBe(false);
    await page.getByRole('button', { name: 'Confirmar baja' }).click();
    await expect(page.getByText('Listo, ya no recibirás avisos por correo.')).toBeVisible();
    expect((await me()).emailUnsubscribed).toBe(true);
    await page.getByRole('button', { name: 'Deshacer' }).click();
    await expect(page.getByText('Hecho: volverás a recibir los avisos por correo.')).toBeVisible();
    expect((await me()).emailUnsubscribed).toBe(false);

    await page.goto('/unsubscribe?token=bogus.token');
    await page.getByRole('button', { name: 'Confirmar baja' }).click();
    await expect(page.getByText('Este enlace no es válido.', { exact: false })).toBeVisible();
  });
});
