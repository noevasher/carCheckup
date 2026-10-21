import { expect, test } from '@playwright/test';
import { signInAsNewUser } from './support/session';

/**
 * Captures every screen for the UX/UI review (checklists/ux-review.md).
 * Run with: UX_SCREENS=1 npx playwright test ux-screens
 */
test.skip(process.env['UX_SCREENS'] !== '1', 'UX screenshots only on demand');

const dir = 'test-results/ux';

for (const scheme of ['light', 'dark'] as const) {
  test(`screens (${scheme})`, async ({ page }) => {
    await page.emulateMedia({ colorScheme: scheme });
    await signInAsNewUser(page);
    const shot = (name: string) => page.screenshot({ path: `${dir}/${scheme}-${name}.png`, fullPage: true });

    await page.goto('/vehicles/new');
    await expect(page.getByRole('heading', { name: 'Agrega tu vehículo' })).toBeVisible();
    await page.getByRole('combobox', { name: 'Marca' }).fill('to');
    await expect(page.getByRole('option').first()).toBeVisible();
    await shot('01-new-vehicle-suggestions');
    await page.getByRole('option', { name: 'Toyota' }).click();
    await page.getByRole('combobox', { name: 'Modelo' }).fill('Cor');
    await page.getByRole('option', { name: 'Corolla', exact: true }).click();
    await page.getByLabel('Año').fill('2019');
    await page.getByLabel('Kilometraje actual').fill('45000');
    await page.getByRole('button', { name: 'Más datos (opcional)' }).click();
    await page.getByRole('button', { name: 'Híbrido' }).click();
    await shot('02-new-vehicle-filled');
    await page.getByRole('button', { name: 'Guardar vehículo' }).click();
    await expect(page).toHaveURL('/');
    await shot('03-home');

    await page.getByRole('button', { name: 'Actualizar km' }).click();
    await page.getByLabel('Kilometraje actual').fill('44000');
    await page.getByRole('button', { name: 'Guardar', exact: true }).click();
    await expect(page.getByText('no puede ser menor')).toBeVisible();
    await shot('04-capture-error');
    await page.getByLabel('Kilometraje actual').fill('52000');
    await page.getByRole('button', { name: 'Guardar', exact: true }).click();
    await expect(page.getByRole('heading', { name: '¿Seguro que es correcto?' })).toBeVisible();
    await shot('05-capture-unusual');
    await page.getByRole('button', { name: 'Sí, es correcto' }).click();
    await expect(page.getByText('Kilometraje actualizado.')).toBeVisible();

    await page.getByRole('link', { name: '+ Añadir vehículo' }).click();
    await page.getByRole('combobox', { name: 'Marca' }).fill('Volkswagen');
    await page.getByRole('combobox', { name: 'Modelo' }).fill('Jetta');
    await page.getByLabel('Año').fill('2015');
    await page.getByLabel('Kilometraje actual').fill('120000');
    await page.getByRole('button', { name: 'Guardar vehículo' }).click();
    await expect(page).toHaveURL('/');
    await page.getByRole('button', { name: 'Toyota Corolla' }).click();
    await shot('06-home-two-vehicles');

    await page.getByRole('link', { name: 'Historial' }).click();
    await expect(page.getByRole('heading', { name: 'Historial de kilometraje' })).toBeVisible();
    await shot('07-history');
    await page.getByRole('button', { name: /52\.000 km/ }).click();
    await shot('08-history-edit');
    await page.keyboard.press('Escape');

    await page.goto('/');
    await page.getByRole('link', { name: 'Editar' }).click();
    await expect(page.getByRole('heading', { name: 'Editar vehículo' })).toBeVisible();
    await shot('09-edit');

    await page.getByRole('button', { name: 'Salir' }).click();
    await page.goto('/login');
    await shot('10-login');
  });
}
