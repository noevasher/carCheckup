import { randomUUID } from 'node:crypto';
import { expect, test } from '@playwright/test';
import { E2E } from './support/config';
import { signInAsNewUser, tokenFor } from './support/session';

/**
 * Screenshots of the notification screens for the UX/UI review
 * (specs/003-email-reminders/checklists/ux-review.md).
 * Run with: UX_SCREENS=1 npx playwright test ux-notifications-screens
 */
test.skip(process.env['UX_SCREENS'] !== '1', 'UX screenshots only on demand');

for (const scheme of ['light', 'dark'] as const) {
  test(`notification screens (${scheme})`, async ({ page }) => {
    await page.emulateMedia({ colorScheme: scheme });
    await page.addInitScript(() => {
      let permission: NotificationPermission = 'default';
      Object.defineProperty(Notification, 'permission', { get: () => permission, configurable: true });
      Notification.requestPermission = () => {
        permission = 'denied';
        return Promise.resolve(permission);
      };
    });
    const userId = await signInAsNewUser(page);
    const shot = (name: string) => page.screenshot({ path: `test-results/ux-003/${scheme}-${name}.png`, fullPage: true });

    await page.goto('/vehicles/new');
    await page.getByRole('combobox', { name: 'Marca' }).fill('Toyota');
    await page.getByRole('combobox', { name: 'Modelo' }).fill('Corolla');
    await page.getByLabel('Año').fill('2019');
    await page.getByLabel('Kilometraje actual').fill('45000');
    await shot('01-form-email-switch');
    await page.getByRole('button', { name: 'Guardar vehículo' }).click();
    await expect(page.getByRole('heading', { name: 'Activa los avisos de mantenimiento' })).toBeVisible();
    await shot('02-explain');
    await page.getByRole('button', { name: 'Activar notificaciones' }).click();
    await expect(page.getByRole('heading', { name: '¿Quieres recibir los avisos por correo?' })).toBeVisible();
    await shot('03-email-question');
    await page.getByRole('button', { name: 'No, gracias' }).click();

    await page.getByRole('link', { name: 'Editar' }).click();
    await expect(page.getByText('Las notificaciones están bloqueadas', { exact: false })).toBeVisible();
    await shot('04-edit-blocked');

    const { items } = (await (
      await fetch(`${E2E.apiUrl}/v1/vehicles`, { headers: { Authorization: `Bearer ${await tokenFor(userId)}` } })
    ).json()) as { items: { id: string }[] };
    await page.goto(`/?capture=${items[0]?.id ?? randomUUID()}`);
    await expect(page.getByRole('heading', { name: 'Actualizar kilometraje' })).toBeVisible();
    await shot('05-capture-deep-link');

    await page.route('**/v1/me', async (route) => {
      const res = await route.fetch();
      await route.fulfill({ response: res, json: { ...((await res.json()) as object), emailStatus: 'BOUNCED' } });
    });
    await page.goto('/');
    await expect(page.getByText('No pudimos entregar', { exact: false })).toBeVisible();
    await shot('06-bounced-banner');

    await page.goto('/unsubscribe?token=bogus.token');
    await expect(page.getByRole('heading', { name: 'Dejar de recibir correos' })).toBeVisible();
    await shot('07-unsubscribe-confirm');
    await page.getByRole('button', { name: 'Confirmar baja' }).click();
    await expect(page.getByText('Este enlace no es válido.', { exact: false })).toBeVisible();
    await shot('08-unsubscribe-invalid');
  });
}
