import { expect, type Page, test } from '@playwright/test';
import { signInAsNewUser } from './support/session';

/** Quickstart scenarios (specs/001-vehicles-mileage/quickstart.md) on a mobile viewport. */

async function registerVehicle(
  page: Page,
  { make, model, year, km }: { make: string; model: string; year: string; km: string },
) {
  await page.getByRole('combobox', { name: 'Marca' }).fill(make);
  await page.getByRole('combobox', { name: 'Modelo' }).fill(model);
  await page.getByLabel('Año').fill(year);
  await page.getByLabel('Kilometraje actual').fill(km);
  await page.getByRole('button', { name: 'Guardar vehículo' }).click();
  await expect(page).toHaveURL('/');
}

async function captureKm(page: Page, km: string) {
  await page.getByRole('button', { name: 'Actualizar km' }).click();
  await page.getByLabel('Kilometraje actual').fill(km);
  await page.getByRole('button', { name: 'Guardar', exact: true }).click();
}

const daysAgoInput = (n: number) => {
  const d = new Date(Date.now() - n * 86_400_000);
  return `${String(d.getFullYear())}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

test.beforeEach(async ({ page }) => {
  await signInAsNewUser(page);
});

test('1–2: a user without vehicles lands on registration and registers from the catalog', async ({ page }) => {
  await page.goto('/');
  await expect(page).toHaveURL('/vehicles/new');
  await expect(page.getByRole('heading', { name: 'Agrega tu vehículo' })).toBeVisible();

  await page.getByRole('combobox', { name: 'Marca' }).fill('toy');
  await page.getByRole('option', { name: 'Toyota' }).click();
  await page.getByRole('combobox', { name: 'Modelo' }).fill('cor');
  await page.getByRole('option', { name: 'Corolla', exact: true }).click();
  await page.getByLabel('Año').fill('2019');
  await page.getByLabel('Kilometraje actual').fill('45.000');
  await page.getByRole('button', { name: 'Guardar vehículo' }).click();

  await expect(page).toHaveURL('/');
  await expect(page.getByRole('heading', { name: 'Toyota Corolla' })).toBeVisible();
  await expect(page.getByText('45.000 km')).toBeVisible();
});

test('3: free-text make/model is accepted', async ({ page }) => {
  await page.goto('/vehicles/new');
  await registerVehicle(page, { make: 'Marca Rara', model: 'Modelo X', year: '2010', km: '120000' });
  await expect(page.getByRole('heading', { name: 'Marca Rara Modelo X' })).toBeVisible();
});

test('validation messages are plain language (FR-015)', async ({ page }) => {
  await page.goto('/vehicles/new');
  await page.getByRole('button', { name: 'Guardar vehículo' }).click();
  await expect(page.getByText('Escribe la marca.')).toBeVisible();
  await expect(page.getByText('Escribe el año con 4 números, ej. 2019.')).toBeVisible();
});

test('4–5, 7: quick capture in 2 taps, lower values rejected, unusual jumps confirmed', async ({ page }) => {
  await page.goto('/vehicles/new');
  await registerVehicle(page, { make: 'Mazda', model: '3', year: '2020', km: '45000' });

  // Tap 1 opens the sheet with the km field focused.
  await page.getByRole('button', { name: 'Actualizar km' }).click();
  await expect(page.getByLabel('Kilometraje actual')).toBeFocused();
  await page.keyboard.type('45350');
  // Tap 2 saves.
  await page.getByRole('button', { name: 'Guardar', exact: true }).click();
  await expect(page.getByRole('paragraph').filter({ hasText: '45.350 km' })).toBeVisible();

  await captureKm(page, '45000');
  await expect(page.getByText('no puede ser menor que el anterior (45.350 km)')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Corregir la última lectura' })).toBeVisible();
  await page.keyboard.press('Escape');

  await captureKm(page, '50500');
  await expect(page.getByRole('heading', { name: '¿Seguro que es correcto?' })).toBeVisible();
  await page.getByRole('button', { name: 'Sí, es correcto' }).click();
  await expect(page.getByRole('paragraph').filter({ hasText: '50.500 km' })).toBeVisible();
});

test('US2-3: the last reading can be corrected from the capture sheet', async ({ page }) => {
  await page.goto('/vehicles/new');
  await registerVehicle(page, { make: 'Kia', model: 'Rio', year: '2018', km: '30000' });
  await captureKm(page, '31000');
  await expect(page.getByRole('paragraph').filter({ hasText: '31.000 km' })).toBeVisible();

  await captureKm(page, '30500');
  await page.getByRole('button', { name: 'Corregir la última lectura' }).click();
  await expect(page.getByText('Estás corrigiendo la última lectura (31.000 km).')).toBeVisible();
  await page.getByRole('button', { name: 'Guardar corrección' }).click();
  await expect(page.getByRole('paragraph').filter({ hasText: '30.500 km' })).toBeVisible();
});

test('6: a past-dated reading is stored in chronological order', async ({ page }) => {
  await page.goto('/vehicles/new');
  await registerVehicle(page, { make: 'Seat', model: 'Ibiza', year: '2015', km: '80000' });

  await page.getByRole('button', { name: 'Actualizar km' }).click();
  await page.getByLabel('Kilometraje actual').fill('79500');
  await page.getByRole('button', { name: 'Fue otro día' }).click();
  await page.getByLabel('Fecha de la lectura').fill(daysAgoInput(3));
  await page.getByRole('button', { name: 'Guardar', exact: true }).click();
  await expect(page.getByText('Kilometraje actualizado.')).toBeVisible();

  await page.getByRole('link', { name: 'Historial' }).click();
  const items = page.getByRole('listitem');
  await expect(items.nth(0)).toContainText('80.000 km');
  await expect(items.nth(1)).toContainText('79.500 km');
});

test('8: offline capture is queued and synced when the connection returns', async ({ page, context }) => {
  await page.goto('/vehicles/new');
  await registerVehicle(page, { make: 'Renault', model: 'Clio', year: '2017', km: '60000' });

  await context.setOffline(true);
  await captureKm(page, '60250');
  await expect(page.getByText('Guardado en el teléfono. Se enviará cuando haya conexión.')).toBeVisible();
  await expect(page.getByText('Pendiente de enviar')).toBeVisible();
  await expect(page.getByRole('paragraph').filter({ hasText: '60.250 km' })).toBeVisible();

  await context.setOffline(false);
  await expect(page.getByText('Pendiente de enviar')).toBeHidden({ timeout: 15_000 });
  await page.reload();
  await expect(page.getByRole('paragraph').filter({ hasText: '60.250 km' })).toBeVisible();
});

test('10: several vehicles; one tap switches; the last active one persists', async ({ page }) => {
  await page.goto('/vehicles/new');
  await registerVehicle(page, { make: 'Ford', model: 'Focus', year: '2016', km: '90000' });
  await page.getByRole('link', { name: '+ Añadir vehículo' }).click();
  await registerVehicle(page, { make: 'Fiat', model: 'Argo', year: '2021', km: '15000' });

  // The new vehicle becomes active.
  await expect(page.getByRole('heading', { name: 'Fiat Argo' })).toBeVisible();
  await page.getByRole('button', { name: 'Ford Focus' }).click();
  await expect(page.getByRole('heading', { name: 'Ford Focus' })).toBeVisible();
  await captureKm(page, '90100');
  await expect(page.getByRole('paragraph').filter({ hasText: '90.100 km' })).toBeVisible();

  await page.reload();
  await expect(page.getByRole('heading', { name: 'Ford Focus' })).toBeVisible();
});

test('11–13: edit, history corrections, protected last reading and vehicle deletion', async ({ page }) => {
  await page.goto('/vehicles/new');
  await registerVehicle(page, { make: 'Honda', model: 'Civic', year: '2015', km: '70000' });

  await page.getByRole('link', { name: 'Editar' }).click();
  await page.getByLabel('Año').fill('2016');
  await page.getByRole('button', { name: 'Guardar cambios' }).click();
  await expect(page.getByText('2016')).toBeVisible();

  // 12: the only reading cannot be deleted.
  await page.getByRole('link', { name: 'Historial' }).click();
  await page.getByRole('button', { name: /70\.000 km/ }).click();
  await page.getByRole('button', { name: 'Eliminar lectura' }).click();
  await page.getByRole('button', { name: 'Sí, eliminar' }).click();
  await expect(page.getByText('Es la única lectura del vehículo')).toBeVisible();
  await page.getByRole('button', { name: 'Cancelar' }).click();
  await page.keyboard.press('Escape');

  // 11: deleting a newer reading recalculates the current km.
  await page.getByRole('link', { name: '← Volver' }).click();
  await captureKm(page, '70500');
  await expect(page.getByRole('paragraph').filter({ hasText: '70.500 km' })).toBeVisible();
  await page.getByRole('link', { name: 'Historial' }).click();
  await page.getByRole('button', { name: /70\.500 km/ }).click();
  await page.getByRole('button', { name: 'Eliminar lectura' }).click();
  await page.getByRole('button', { name: 'Sí, eliminar' }).click();
  await expect(page.getByRole('button', { name: /70\.500 km/ })).toBeHidden();
  await page.getByRole('link', { name: '← Volver' }).click();
  await expect(page.getByRole('paragraph').filter({ hasText: '70.000 km' })).toBeVisible();

  // 13: deleting the vehicle asks for confirmation and warns about the history.
  await page.getByRole('link', { name: 'Editar' }).click();
  await page.getByRole('button', { name: 'Eliminar vehículo' }).click();
  await expect(page.getByText('También se borrará todo su historial de kilometraje.')).toBeVisible();
  await page.getByRole('button', { name: 'Sí, eliminar' }).click();
  await expect(page).toHaveURL('/vehicles/new');
});
