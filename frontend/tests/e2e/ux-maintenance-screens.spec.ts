import { expect, test } from '@playwright/test';
import { signInAsNewUser } from './support/session';
import { dismissNotificationsPrompt } from './support/notifications';

/**
 * Screenshots of the maintenance screens for the UX/UI review
 * (specs/002-maintenance-estimation/checklists/ux-review.md).
 * Run with: UX_SCREENS=1 npx playwright test ux-maintenance-screens
 */
test.skip(process.env['UX_SCREENS'] !== '1', 'UX screenshots only on demand');

for (const scheme of ['light', 'dark'] as const) {
  test(`maintenance screens (${scheme})`, async ({ page }) => {
    await page.emulateMedia({ colorScheme: scheme });
    await signInAsNewUser(page);
    const shot = (name: string) => page.screenshot({ path: `test-results/ux-002/${scheme}-${name}.png`, fullPage: true });
    const register = async (make: string, model: string, km: string) => {
      await page.goto('/vehicles/new');
      await page.getByRole('combobox', { name: 'Marca' }).fill(make);
      await page.getByRole('combobox', { name: 'Modelo' }).fill(model);
      await page.getByLabel('Año').fill('2019');
      await page.getByLabel('Kilometraje actual').fill(km);
      await page.getByRole('button', { name: 'Guardar vehículo' }).click();
      await expect(page).toHaveURL('/');
      await dismissNotificationsPrompt(page);
    };

    await register('Toyota', 'Corolla', '45000');
    await register('Mazda', '3', '30000');
    await expect(page.getByText('Todo al día')).toBeVisible();
    await shot('01-home-all-good');

    await page.getByRole('button', { name: 'Toyota Corolla' }).click();
    await page.getByRole('button', { name: 'Actualizar km' }).click();
    await page.getByLabel('Kilometraje actual').fill('54700');
    await page.getByRole('button', { name: 'Guardar', exact: true }).click();
    await page.getByRole('button', { name: 'Sí, es correcto' }).click();
    await page.getByRole('button', { name: 'Actualizar km' }).click();
    await page.getByLabel('Kilometraje actual').fill('55500');
    await page.getByRole('button', { name: 'Guardar', exact: true }).click();
    await expect(page.getByText('Kilometraje actualizado.')).toBeVisible();
    await page.getByRole('button', { name: 'Mazda 3' }).click();
    await page.getByRole('button', { name: 'Toyota Corolla' }).click();
    await shot('02-home-alerts');

    await page.getByRole('region', { name: 'Mantenimientos' }).getByRole('button', { name: '¿Por qué?' }).first().click();
    await shot('03-explanation');
    await page.keyboard.press('Escape');

    await page.getByRole('region', { name: 'Mantenimientos' }).getByRole('button', { name: 'Ya lo hice' }).first().click();
    await shot('04-record-service');
    await page.keyboard.press('Escape');

    await page.getByRole('link', { name: 'Ver todos los mantenimientos →' }).click();
    await shot('05-detail');
    await page.getByRole('article', { name: 'Cambio de anticongelante', exact: true }).getByRole('button', { name: 'Indicar cuándo se hizo' }).click();
    await shot('06-prior-history');
    await page.keyboard.press('Escape');
    await page.getByRole('article', { name: 'Banda de distribución', exact: true }).getByRole('button', { name: 'Ajustar' }).click();
    await shot('07-settings');
    await page.keyboard.press('Escape');

    await page.getByRole('article', { name: 'Cambio de aceite y filtro', exact: true }).getByRole('button', { name: 'Ya lo hice' }).click();
    await page.getByRole('button', { name: 'Guardar', exact: true }).click();
    await expect(page.getByText('Servicio registrado.')).toBeVisible();
    await page.getByRole('link', { name: 'Historial de servicios →' }).click();
    await shot('08-services-history');
  });
}
