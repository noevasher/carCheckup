import { randomUUID } from 'node:crypto';
import { expect, type Page, test } from '@playwright/test';
import { E2E } from './support/config';
import { signInAsNewUser, tokenFor } from './support/session';

/** Feature 004: donations with the simulated provider (quickstart scenarios 1–3, 7–9, 13–16). */

async function api(userId: string, path: string, body: object) {
  const res = await fetch(`${E2E.apiUrl}${path}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${await tokenFor(userId)}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  return (await res.json()) as { id: string };
}

/** A signed-in user with one vehicle, so the app opens on home. */
async function userWithVehicle(page: Page) {
  const userId = randomUUID();
  const vehicle = await api(userId, '/v1/vehicles', { make: 'Toyota', model: 'Corolla', year: 2019, odometerKm: 45_000, initialReadingId: randomUUID() });
  // Skip the notifications prompt of feature 003 (not under test here).
  await page.addInitScript((id) => {
    localStorage.setItem(`car-checkup:notifications-prompted:${id}`, '1');
  }, userId);
  await signInAsNewUser(page, userId);
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Toyota Corolla' })).toBeVisible();
  return { userId, vehicleId: vehicle.id };
}

const supportEntry = (page: Page) => page.getByRole('link', { name: 'Apoya Car Checkup' });

test('US1: one-time donation by card in 3 taps, confirmed and listed (SC-001)', async ({ page }) => {
  await userWithVehicle(page);
  await supportEntry(page).click(); // 1
  await expect(page.getByRole('heading', { name: 'Apoya Car Checkup' })).toBeVisible();
  await page.getByRole('button', { name: '$100 MXN', exact: true }).click(); // 2
  await page.getByRole('button', { name: 'Tarjeta' }).click(); // 3 → provider page
  await expect(page.getByRole('heading', { name: 'Pago simulado · Tarjeta' })).toBeVisible();
  await page.getByRole('button', { name: 'Pagar' }).click();
  await expect(page.getByRole('heading', { name: '¡Gracias por tu apoyo!' })).toBeVisible();
  await expect(page.getByText(/Sin anuncios hasta el/)).toBeVisible();

  await page.getByRole('link', { name: 'Mis donaciones' }).click();
  const list = page.getByRole('list', { name: 'Mis donaciones' });
  await expect(list.getByText('$100 MXN')).toBeVisible();
  await expect(list.getByText('Confirmada')).toBeVisible();
  await expect(page.getByRole('link', { name: 'soporte@e2e.dev' })).toBeVisible();
});

test('US1: canceling at the provider charges nothing (US1-4)', async ({ page }) => {
  await userWithVehicle(page);
  await supportEntry(page).click();
  await page.getByRole('button', { name: 'Tarjeta' }).click();
  await page.getByRole('button', { name: 'Cancelar' }).click();
  await expect(page.getByRole('heading', { name: 'No se realizó ningún cargo' })).toBeVisible();
  await page.getByRole('link', { name: 'Intentar de nuevo' }).click();
  await expect(page.getByRole('heading', { name: 'Apoya Car Checkup' })).toBeVisible();
});

test('custom amount is validated before leaving; offline disables paying', async ({ page, context }) => {
  await userWithVehicle(page);
  await supportEntry(page).click();
  await page.getByRole('button', { name: 'Otro monto' }).click();
  await page.getByLabel('Monto en pesos').fill('15');
  await expect(page.getByRole('button', { name: 'Tarjeta' })).toBeDisabled();
  await page.getByLabel('Monto en pesos').fill('75');
  await expect(page.getByRole('button', { name: 'Tarjeta' })).toBeEnabled();

  await context.setOffline(true);
  await expect(page.getByText('Necesitas conexión a internet para donar.')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Tarjeta' })).toBeDisabled();
  await context.setOffline(false);
});

test('a provider that does not respond suggests the other one (FR-015)', async ({ page }) => {
  await userWithVehicle(page);
  await supportEntry(page).click();
  await page.getByRole('button', { name: 'PayPal' }).click();
  await expect(page.getByText('No pudimos conectar con PayPal. Inténtalo de nuevo o usa Tarjeta.')).toBeVisible();
  await expect(page.getByRole('button', { name: '$100 MXN', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByRole('button', { name: 'Tarjeta' })).toBeEnabled();
});

test('US2: monthly donation, one at a time, cancel from Mis donaciones (SC-007)', async ({ page }) => {
  await userWithVehicle(page);
  await supportEntry(page).click();
  await page.getByRole('button', { name: 'Cada mes' }).click();
  await page.getByRole('button', { name: '$50 MXN al mes' }).click();
  await page.getByRole('button', { name: 'Tarjeta' }).click();
  await page.getByRole('button', { name: 'Pagar' }).click();
  await expect(page.getByRole('heading', { name: '¡Gracias por tu apoyo!' })).toBeVisible();

  await page.goto('/support');
  await page.getByRole('button', { name: 'Cada mes' }).click();
  await expect(page.getByText('Ya tienes una donación mensual activa.')).toBeVisible();
  await page.getByRole('link', { name: 'Gestionarla en Mis donaciones' }).click();

  const monthly = page.getByRole('region', { name: 'Tu donación mensual' });
  await expect(monthly.getByText(/Activa/)).toBeVisible();
  await expect(monthly.getByText(/Siguiente cargo/)).toBeVisible();
  await monthly.getByRole('button', { name: 'Cancelar donación mensual' }).click();
  await page.getByRole('button', { name: 'Sí, cancelar' }).click();
  await expect(page.getByText('Donación mensual cancelada. No habrá más cargos.')).toBeVisible();
  await expect(monthly.getByText(/Cancelada/)).toBeVisible();
  await expect(monthly.getByText(/Sin más cargos. Cuenta hasta el/)).toBeVisible();
});

test('US5: discreet card after the first service; closing hides it', async ({ page }) => {
  const { userId, vehicleId } = await userWithVehicle(page);
  await expect(page.getByRole('heading', { name: '¿Te ayuda Car Checkup?' })).toHaveCount(0);

  await api(userId, `/v1/vehicles/${vehicleId}/services`, {
    id: randomUUID(),
    performedAt: new Date().toISOString(),
    odometerKm: 45_000,
    typeCodes: ['OIL_CHANGE'],
  });
  await page.reload();
  const card = page.getByRole('complementary', { name: '¿Te ayuda Car Checkup?' });
  await expect(card).toBeVisible();
  await card.getByRole('button', { name: 'Ahora no' }).click();
  await expect(card).toHaveCount(0);
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Toyota Corolla' })).toBeVisible();
  await expect(card).toHaveCount(0);
});

test('US5: a donor with an active benefit sees no card (FR-012b)', async ({ page }) => {
  const { userId, vehicleId } = await userWithVehicle(page);
  await api(userId, `/v1/vehicles/${vehicleId}/services`, {
    id: randomUUID(),
    performedAt: new Date().toISOString(),
    odometerKm: 45_000,
    typeCodes: ['OIL_CHANGE'],
  });
  await supportEntry(page).click();
  await page.getByRole('button', { name: 'Tarjeta' }).click();
  await page.getByRole('button', { name: 'Pagar' }).click();
  await expect(page.getByRole('heading', { name: '¡Gracias por tu apoyo!' })).toBeVisible();
  await page.getByRole('link', { name: 'Ir al inicio' }).click();
  await expect(page.getByRole('heading', { name: 'Toyota Corolla' })).toBeVisible();
  await expect(page.getByRole('heading', { name: '¿Te ayuda Car Checkup?' })).toHaveCount(0);
  await expect(supportEntry(page)).toBeVisible();
});
