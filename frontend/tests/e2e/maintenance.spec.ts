import { expect, type Locator, type Page, test } from '@playwright/test';
import { E2E } from './support/config';
import { signInAsNewUser } from './support/session';

/** Quickstart scenarios of specs/002-maintenance-estimation/quickstart.md (mobile viewport). */

async function registerVehicle(
  page: Page,
  { make, model, km, fuel = 'Gasolina' }: { make: string; model: string; km: string; fuel?: string | null },
) {
  await page.goto('/vehicles/new');
  await page.getByRole('combobox', { name: 'Marca' }).fill(make);
  await page.getByRole('combobox', { name: 'Modelo' }).fill(model);
  await page.getByLabel('Año').fill('2019');
  await page.getByLabel('Kilometraje actual').fill(km);
  if (fuel !== null) {
    await page.getByRole('button', { name: 'Más datos (opcional)' }).click();
    await page.getByRole('button', { name: fuel, exact: true }).click();
  }
  await page.getByRole('button', { name: 'Guardar vehículo' }).click();
  await expect(page).toHaveURL('/');
}

async function captureKm(page: Page, km: string, { unusual = false } = {}) {
  await page.getByRole('button', { name: 'Actualizar km' }).click();
  await page.getByLabel('Kilometraje actual').fill(km);
  await page.getByRole('button', { name: 'Guardar', exact: true }).click();
  if (unusual) await page.getByRole('button', { name: 'Sí, es correcto' }).click();
  await expect(page.getByText('Kilometraje actualizado.')).toBeVisible();
}

const card = (scope: Page | Locator, name: string): Locator => scope.getByRole('article', { name, exact: true });
const alerts = (page: Page): Locator => page.getByRole('region', { name: 'Mantenimientos' });

test.beforeEach(async ({ page }) => {
  await signInAsNewUser(page);
});

test('1, 2, 4, 5: from "Todo al día" to upcoming and overdue, with explanation', async ({ page }) => {
  await registerVehicle(page, { make: 'Toyota', model: 'Corolla', km: '45000' });

  // 1: everything OK right after registration.
  await expect(page.getByText('Todo al día')).toBeVisible();
  await expect(page.getByText(/Lo próximo: Cambio de aceite y filtro, hacia el/)).toBeVisible();

  // 2: explanation from the detail page.
  await page.getByRole('link', { name: 'Ver todos los mantenimientos →' }).click();
  await card(page, 'Cambio de aceite y filtro').getByRole('button', { name: '¿Por qué?' }).click();
  const sheet = page.getByRole('dialog');
  await expect(sheet.getByText('Se recomienda cada 10.000 km o 1 año (lo que ocurra primero).')).toBeVisible();
  await expect(sheet.getByText(/Lo calculamos desde que registraste el vehículo/)).toBeVisible();
  await expect(sheet.getByText('Estimamos unos 40 km al día; se ajustará cuando registres más kilometraje.')).toBeVisible();
  await page.keyboard.press('Escape');
  await page.getByRole('link', { name: '← Volver' }).click();

  // 4: 500 km left → upcoming.
  await captureKm(page, '54500', { unusual: true });
  await expect(card(alerts(page), 'Cambio de aceite y filtro')).toContainText('Próximo');
  await expect(card(alerts(page), 'Cambio de aceite y filtro')).toContainText('Faltan 500 km');

  // 5: overdue, listed first.
  await captureKm(page, '55500');
  const first = alerts(page).getByRole('article').first();
  await expect(first).toContainText('Vencido');
  await expect(card(alerts(page), 'Cambio de aceite y filtro')).toContainText('Te pasaste 500 km');
});

test('3, 15: city use shortens the interval; electric vehicles drop combustion items', async ({ page }) => {
  await registerVehicle(page, { make: 'Mazda', model: '3', km: '45000' });
  await page.getByRole('link', { name: 'Editar' }).click();
  await page.getByRole('button', { name: 'Ciudad' }).click();
  await page.getByRole('button', { name: 'Guardar cambios' }).click();
  await expect(page).toHaveURL('/');

  await page.getByRole('link', { name: 'Ver todos los mantenimientos →' }).click();
  await card(page, 'Cambio de aceite y filtro').getByRole('button', { name: '¿Por qué?' }).click();
  await expect(page.getByRole('dialog').getByText(/cada 8\.000 km o 1 año .* porque usas el coche en ciudad/)).toBeVisible();
  await expect(page.getByRole('dialog').getByText(/Estimamos unos 30 km al día por tu uso en ciudad/)).toBeVisible();
  await page.keyboard.press('Escape');

  await page.getByRole('link', { name: '← Volver' }).click();
  await page.getByRole('link', { name: 'Editar' }).click();
  await page.getByRole('button', { name: 'Eléctrico' }).click();
  await page.getByRole('button', { name: 'Guardar cambios' }).click();
  await page.getByRole('link', { name: 'Ver todos los mantenimientos →' }).click();
  await expect(card(page, 'Revisión de batería')).toBeVisible();
  await expect(card(page, 'Cambio de aceite y filtro')).toHaveCount(0);
  await expect(card(page, 'Cambio de bujías')).toHaveCount(0);
});

test('6–9: "Ya lo hice" in 2 taps, workshop km creates a reading, invalid km, deleting services', async ({ page }) => {
  await registerVehicle(page, { make: 'Kia', model: 'Rio', km: '45000' });
  await captureKm(page, '55500', { unusual: true });
  const oil = card(alerts(page), 'Cambio de aceite y filtro');
  await expect(oil).toContainText('Vencido');

  // 6: tap 1 "Ya lo hice", tap 2 "Guardar".
  await oil.getByRole('button', { name: 'Ya lo hice' }).click();
  await page.getByRole('button', { name: 'Guardar', exact: true }).click();
  await expect(page.getByText('Servicio registrado.')).toBeVisible();
  await expect(card(alerts(page), 'Cambio de aceite y filtro')).toHaveCount(0);

  // 8: km lower than the readings is rejected with the valid range.
  await card(alerts(page), 'Rotación de llantas').getByRole('button', { name: 'Ya lo hice' }).click();
  await page.getByLabel('Kilometraje en el taller').fill('40000');
  await page.getByRole('button', { name: 'Guardar', exact: true }).click();
  await expect(page.getByText('no puede ser menor que el anterior (55.500 km)')).toBeVisible();

  // 7: a higher workshop km is saved as a new reading too.
  await page.getByLabel('Kilometraje en el taller').fill('56000');
  await page.getByRole('button', { name: 'Guardar', exact: true }).click();
  await expect(page.getByText('Servicio registrado.')).toBeVisible();
  await expect(page.getByRole('paragraph').filter({ hasText: '56.000 km' }).first()).toBeVisible();
  await page.getByRole('link', { name: 'Historial', exact: true }).click();
  await expect(page.getByRole('button', { name: /56\.000 km/ })).toContainText('Al registrar un servicio');

  // 9: deleting both services brings the oil change back to overdue.
  await page.goto('/');
  await page.getByRole('link', { name: 'Ver todos los mantenimientos →' }).click();
  await page.getByRole('link', { name: 'Historial de servicios →' }).click();
  for (let i = 0; i < 2; i += 1) {
    await page.getByRole('listitem').first().getByRole('button').click();
    await page.getByRole('button', { name: 'Eliminar servicio' }).click();
    await page.getByRole('button', { name: 'Sí, eliminar' }).click();
    await expect(page.getByRole('dialog')).toHaveCount(0);
  }
  await expect(page.getByText('Aún no has registrado servicios.')).toBeVisible();
  await page.goto('/');
  await expect(card(alerts(page), 'Cambio de aceite y filtro')).toContainText('Vencido');
});

test('10–11: prior history and "No lo sé"', async ({ page }) => {
  await registerVehicle(page, { make: 'Seat', model: 'Ibiza', km: '45000' });
  await page.getByRole('link', { name: 'Ver todos los mantenimientos →' }).click();

  const tenMonthsAgo = new Date();
  tenMonthsAgo.setMonth(tenMonthsAgo.getMonth() - 10);
  const month = `${String(tenMonthsAgo.getFullYear())}-${String(tenMonthsAgo.getMonth() + 1).padStart(2, '0')}`;
  await card(page, 'Cambio de aceite y filtro').getByRole('button', { name: 'Indicar cuándo se hizo' }).click();
  await page.getByLabel('Mes y año aproximados').fill(month);
  await page.getByLabel('Kilometraje aproximado (opcional)').fill('44000');
  await page.getByRole('button', { name: 'Guardar', exact: true }).click();
  await expect(card(page, 'Cambio de aceite y filtro').getByRole('button', { name: 'Indicar cuándo se hizo' })).toHaveCount(0);
  await card(page, 'Cambio de aceite y filtro').getByRole('button', { name: '¿Por qué?' }).click();
  await expect(page.getByRole('dialog').getByText(/Por tiempo, toca a más tardar el .*, y eso llega antes que el kilometraje\./)).toBeVisible();
  await page.keyboard.press('Escape');

  await card(page, 'Cambio de anticongelante').getByRole('button', { name: 'Indicar cuándo se hizo' }).click();
  await page.getByRole('button', { name: 'No lo sé' }).click();
  await expect(card(page, 'Cambio de anticongelante').getByRole('button', { name: 'Indicar cuándo se hizo' })).toHaveCount(0);
});

test('12, 16: snooze hides an alert for a week; other vehicles show a badge', async ({ page }) => {
  await registerVehicle(page, { make: 'Renault', model: 'Clio', km: '45000' });
  await captureKm(page, '55500', { unusual: true });
  await card(alerts(page), 'Cambio de aceite y filtro').getByRole('button', { name: 'Posponer 1 semana' }).click();
  await expect(card(alerts(page), 'Cambio de aceite y filtro')).toHaveCount(0);
  await page.getByRole('link', { name: 'Ver todos los mantenimientos →' }).click();
  await expect(card(page, 'Cambio de aceite y filtro')).toContainText(/Pospuesto hasta el/);

  // 16: a second vehicle becomes active; the first one keeps its overdue badge.
  await page.goto('/');
  await page.getByRole('link', { name: '+ Añadir vehículo' }).click();
  await registerVehicle(page, { make: 'Fiat', model: 'Argo', km: '10000' });
  await expect(page.getByRole('heading', { name: 'Fiat Argo' })).toBeVisible();
  await expect(page.getByRole('img', { name: /mantenimientos? vencidos?/ })).toBeVisible();
});

test('13–14: custom interval, reset, disable and re-enable', async ({ page }) => {
  await registerVehicle(page, { make: 'Honda', model: 'Civic', km: '45000' });
  await page.getByRole('link', { name: 'Ver todos los mantenimientos →' }).click();

  await card(page, 'Cambio de aceite y filtro').getByRole('button', { name: 'Ajustar' }).click();
  await page.getByLabel('Cada cuántos km').fill('15000');
  await page.getByRole('button', { name: 'Guardar', exact: true }).click();
  await card(page, 'Cambio de aceite y filtro').getByRole('button', { name: '¿Por qué?' }).click();
  await expect(page.getByRole('dialog').getByText(/configurado cada 15\.000 km .*\(intervalo personalizado\)/)).toBeVisible();
  await page.keyboard.press('Escape');

  await card(page, 'Cambio de aceite y filtro').getByRole('button', { name: 'Ajustar' }).click();
  await page.getByRole('button', { name: 'Volver al recomendado' }).click();
  await card(page, 'Cambio de aceite y filtro').getByRole('button', { name: '¿Por qué?' }).click();
  await expect(page.getByRole('dialog').getByText('Se recomienda cada 10.000 km o 1 año (lo que ocurra primero).')).toBeVisible();
  await page.keyboard.press('Escape');

  await card(page, 'Banda de distribución').getByRole('button', { name: 'Ajustar' }).click();
  await page.getByRole('button', { name: 'No aplica a mi vehículo' }).click();
  await expect(card(page, 'Banda de distribución')).toHaveCount(0);
  await page.getByRole('button', { name: /Desactivados \(1\)/ }).click();
  await page.getByRole('button', { name: 'Reactivar' }).click();
  await expect(card(page, 'Banda de distribución')).toBeVisible();
});

test('17: cached data survives a reload without API; an offline service is saved once back online', async ({ page, context }) => {
  await registerVehicle(page, { make: 'Nissan', model: 'Versa', km: '45000' });
  await captureKm(page, '55500', { unusual: true });
  await expect(card(alerts(page), 'Cambio de aceite y filtro')).toContainText('Vencido');
  // Let the persister write the cache (throttled) before going offline.
  await page.waitForTimeout(1500);

  // The dev server has no service worker, so simulate the outage by blocking the API and reload:
  // the vehicle, km and maintenance must come from the persisted cache.
  await page.route(`${E2E.apiUrl}/**`, (route) => route.abort('internetdisconnected'));
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Nissan Versa' })).toBeVisible();
  await expect(card(alerts(page), 'Cambio de aceite y filtro')).toContainText('Vencido');
  await page.unroute(`${E2E.apiUrl}/**`);

  await context.setOffline(true);

  await card(alerts(page), 'Cambio de aceite y filtro').getByRole('button', { name: 'Ya lo hice' }).click();
  await page.getByRole('button', { name: 'Guardar', exact: true }).click();
  await expect(page.getByText('Sin conexión: guardaremos el servicio cuando vuelvas a tener señal.')).toBeVisible();

  await context.setOffline(false);
  await expect(page.getByText('Servicio registrado.')).toBeVisible({ timeout: 15_000 });
  await expect(card(alerts(page), 'Cambio de aceite y filtro')).toHaveCount(0);
});
