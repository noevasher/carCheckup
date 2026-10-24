import { randomUUID } from 'node:crypto';
import { expect, test } from '@playwright/test';
import { E2E } from './support/config';
import { signInAsNewUser, tokenFor } from './support/session';

/**
 * Screenshots of the donation screens for the UX/UI review
 * (specs/004-donations/checklists/ux-review.md).
 * Run with: UX_SCREENS=1 npx playwright test ux-donations-screens
 */
test.skip(process.env['UX_SCREENS'] !== '1', 'UX screenshots only on demand');

for (const scheme of ['light', 'dark'] as const) {
  test(`donation screens (${scheme})`, async ({ page }) => {
    await page.emulateMedia({ colorScheme: scheme });
    const userId = randomUUID();
    const post = async (path: string, body: object) =>
      (await (
        await fetch(`${E2E.apiUrl}${path}`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${await tokenFor(userId)}`, 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        })
      ).json()) as { id: string };
    const vehicle = await post('/v1/vehicles', { make: 'Toyota', model: 'Corolla', year: 2019, odometerKm: 45_000, initialReadingId: randomUUID() });
    await post(`/v1/vehicles/${vehicle.id}/services`, { id: randomUUID(), performedAt: new Date().toISOString(), odometerKm: 45_000, typeCodes: ['OIL_CHANGE'] });
    await page.addInitScript((id) => {
      localStorage.setItem(`car-checkup:notifications-prompted:${id}`, '1');
    }, userId);
    await signInAsNewUser(page, userId);
    const shot = (name: string) => page.screenshot({ path: `test-results/ux-004/${scheme}-${name}.png`, fullPage: true });

    await page.goto('/');
    await expect(page.getByRole('heading', { name: '¿Te ayuda Car Checkup?' })).toBeVisible();
    await shot('01-home-card');

    await page.getByRole('link', { name: 'Apoya Car Checkup' }).click();
    await expect(page.getByRole('heading', { name: 'Apoya Car Checkup' })).toBeVisible();
    await shot('02-support');
    await page.getByRole('button', { name: 'Otro monto' }).click();
    await page.getByLabel('Monto en pesos').fill('15');
    await shot('03-support-invalid-amount');
    await page.getByLabel('Monto en pesos').fill('100');
    await page.getByRole('button', { name: 'PayPal' }).click();
    await expect(page.getByText(/No pudimos conectar con PayPal/)).toBeVisible();
    await shot('04-provider-down');

    await page.getByRole('button', { name: 'Tarjeta' }).click();
    await expect(page.getByRole('heading', { name: /Pago simulado/ })).toBeVisible();
    await page.getByRole('button', { name: 'Pagar' }).click();
    await expect(page.getByRole('heading', { name: '¡Gracias por tu apoyo!' })).toBeVisible();
    await shot('05-result-thanks');

    await page.goto('/support');
    await page.getByRole('button', { name: 'Cada mes' }).click();
    await page.getByRole('button', { name: 'Tarjeta' }).click();
    await page.getByRole('button', { name: 'Pagar' }).click();
    await expect(page.getByRole('heading', { name: '¡Gracias por tu apoyo!' })).toBeVisible();
    await page.getByRole('link', { name: 'Mis donaciones' }).click();
    await expect(page.getByRole('region', { name: 'Tu donación mensual' })).toBeVisible();
    await shot('06-history-monthly');
    await page.getByRole('button', { name: 'Cancelar donación mensual' }).click();
    await expect(page.getByRole('button', { name: 'Sí, cancelar' })).toBeVisible();
    await shot('07-cancel-dialog');

    await page.goto('/support/result?donation=00000000-0000-4000-8000-000000000000&canceled=1');
    await expect(page.getByRole('heading', { name: 'No se realizó ningún cargo' })).toBeVisible();
    await shot('08-result-canceled');
  });
}
