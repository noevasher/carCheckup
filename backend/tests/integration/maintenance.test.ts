import { randomUUID } from 'node:crypto';
import { MAINTENANCE_DEFAULTS } from '@car-checkup/shared/maintenance';
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { prisma } from '../../src/lib/prisma';
import { createTestContext, daysAgo, resetDatabase } from '../helpers';

type MaintenanceItem = { typeCode: string; status: string | null; dueKm: number | null; remainingKm: number | null; enabled: boolean; snoozed: boolean; askHistory: boolean; interval: { km: number | null; source: string }; limitingFactor: string | null; baseline: { source: string; km: number } | null };

let ctx: Awaited<ReturnType<typeof createTestContext>>;
let user: Awaited<ReturnType<Awaited<ReturnType<typeof createTestContext>>['userAgent']>>;
let vehicleId: string;

beforeAll(async () => {
  ctx = await createTestContext();
});

beforeEach(async () => {
  await resetDatabase();
  user = await ctx.userAgent();
  const res = await user.post('/v1/vehicles', {
    make: 'Toyota',
    model: 'Corolla',
    year: 2019,
    odometerKm: 45_000,
    fuelType: 'GASOLINE',
    initialReadingId: randomUUID(),
  });
  vehicleId = res.body.id;
});

const maintenance = async () => (await user.get(`/v1/vehicles/${vehicleId}/maintenance`)).body as { items: MaintenanceItem[]; pace: { kmPerDay: number; source: string } };
const item = async (code: string) => (await maintenance()).items.find((i) => i.typeCode === code);
const addReading = (km: number, readAt = new Date().toISOString(), confirmedUnusual = true) =>
  user.post(`/v1/vehicles/${vehicleId}/readings`, { id: randomUUID(), odometerKm: km, readAt, origin: 'ONLINE', confirmedUnusual });

describe('catalog', () => {
  it('matches the typed defaults used by the engine', async () => {
    const rows = await prisma.maintenanceType.findMany({ orderBy: { sortOrder: 'asc' } });
    expect(rows.map((r) => ({ ...r, fuelTypes: [...r.fuelTypes].sort() }))).toEqual(
      MAINTENANCE_DEFAULTS.map((d) => ({ ...d, fuelTypes: [...d.fuelTypes].sort() })),
    );
  });
});

describe('GET maintenance (US1)', () => {
  it('starts from the vehicle registration: everything OK, oil due at 55.000 km', async () => {
    const m = await maintenance();
    expect(m.items.every((i) => i.status === 'OK')).toBe(true);
    expect(m.pace).toMatchObject({ kmPerDay: 40, source: 'USAGE_DEFAULT' });
    expect(await item('OIL_CHANGE')).toMatchObject({ dueKm: 55_000, askHistory: true, baseline: { source: 'VEHICLE_REGISTRATION', km: 45_000 } });
    expect((await user.get('/v1/vehicles')).body.items[0].maintenance).toEqual({ overdueCount: 0, upcomingCount: 0 });
  });

  it('recomputes when usage, fuel or readings change (FR-019)', async () => {
    await user.patch(`/v1/vehicles/${vehicleId}`, { usageType: 'CITY' });
    expect(await item('OIL_CHANGE')).toMatchObject({ dueKm: 53_000, interval: { km: 8000, source: 'CITY_ADJUSTED' } });

    await user.patch(`/v1/vehicles/${vehicleId}`, { fuelType: 'ELECTRIC' });
    const codes = (await maintenance()).items.map((i) => i.typeCode);
    expect(codes).not.toContain('OIL_CHANGE');
    expect(codes).not.toContain('SPARK_PLUGS');
    expect(codes).toContain('BRAKE_FLUID');

    await user.patch(`/v1/vehicles/${vehicleId}`, { fuelType: 'GASOLINE', usageType: null });
    expect((await addReading(54_500)).status).toBe(201);
    expect(await item('OIL_CHANGE')).toMatchObject({ status: 'UPCOMING', remainingKm: 500 });
    await addReading(55_500);
    const m = await maintenance();
    expect(m.items[0]).toMatchObject({ typeCode: 'OIL_CHANGE', status: 'OVERDUE', remainingKm: -500 });
    expect((await user.get('/v1/vehicles')).body.items[0].maintenance.overdueCount).toBeGreaterThanOrEqual(1);
  });

  it('uses the pace from readings once they span 7 days', async () => {
    await prisma.mileageReading.updateMany({ where: { vehicleId }, data: { readAt: new Date(daysAgo(20)) } });
    await addReading(46_000, new Date().toISOString(), false);
    expect((await maintenance()).pace).toMatchObject({ kmPerDay: 50, source: 'READINGS' });
  });

  it('snoozes an alert for 7 days without changing its status (FR-007a)', async () => {
    await addReading(55_500);
    const before = (await user.get('/v1/vehicles')).body.items[0].maintenance.overdueCount;
    const res = await user.patch(`/v1/vehicles/${vehicleId}/maintenance/OIL_CHANGE`, { snooze: true });
    expect(res.status).toBe(200);
    const oil = res.body.items.find((i: MaintenanceItem) => i.typeCode === 'OIL_CHANGE');
    expect(oil).toMatchObject({ status: 'OVERDUE', snoozed: true });
    const summary = (await user.get('/v1/vehicles')).body.items[0].maintenance;
    expect(summary.overdueCount).toBe(before - 1);
  });

  it('uses the X-Timezone header for "today" and falls back to UTC', async () => {
    const res = await user.get(`/v1/vehicles/${vehicleId}/maintenance`).set('X-Timezone', 'America/Mexico_City');
    expect(res.status).toBe(200);
    const bad = await user.get(`/v1/vehicles/${vehicleId}/maintenance`).set('X-Timezone', 'Mars/Olympus');
    expect(bad.status).toBe(200);
  });

  it('hides other users vehicles (FR-021)', async () => {
    const other = await ctx.userAgent();
    expect((await other.get(`/v1/vehicles/${vehicleId}/maintenance`)).status).toBe(404);
    expect((await other.patch(`/v1/vehicles/${vehicleId}/maintenance/OIL_CHANGE`, { snooze: true })).status).toBe(404);
  });
});

describe('prior history (US3)', () => {
  it('accepts an approximate date, km or "No lo sé" and validates them', async () => {
    const tenMonthsAgo = new Date();
    tenMonthsAgo.setUTCMonth(tenMonthsAgo.getUTCMonth() - 10);
    const date = tenMonthsAgo.toISOString().slice(0, 10);
    // Date + km: 10 months ago at 44.000 km → time limit (2 months left) comes before km (9.000 km left).
    let res = await user.patch(`/v1/vehicles/${vehicleId}/maintenance/OIL_CHANGE`, { priorHistory: { date, km: 44_000 } });
    let oil = res.body.items.find((i: MaintenanceItem) => i.typeCode === 'OIL_CHANGE');
    expect(oil).toMatchObject({ baseline: { source: 'PRIOR', km: 44_000 }, limitingFactor: 'TIME', status: 'OK', askHistory: false });

    // Date only: the km at that date is extrapolated with the pace (40 km/day × ~304 days ≈ 12.000 km).
    res = await user.patch(`/v1/vehicles/${vehicleId}/maintenance/OIL_CHANGE`, { priorHistory: { date } });
    oil = res.body.items.find((i: MaintenanceItem) => i.typeCode === 'OIL_CHANGE');
    expect(oil.baseline.source).toBe('PRIOR');
    expect(oil.baseline.km).toBeGreaterThan(32_000);
    expect(oil.baseline.km).toBeLessThan(34_000);
    expect(oil.status).toBe('OVERDUE');

    res = await user.patch(`/v1/vehicles/${vehicleId}/maintenance/OIL_CHANGE`, { priorHistory: { km: 40_000 } });
    oil = res.body.items.find((i: MaintenanceItem) => i.typeCode === 'OIL_CHANGE');
    expect(oil).toMatchObject({ baseline: { source: 'PRIOR', km: 40_000 }, dueKm: 50_000, remainingKm: 5000, status: 'OK' });

    res = await user.patch(`/v1/vehicles/${vehicleId}/maintenance/COOLANT`, { priorHistory: 'UNKNOWN' });
    expect(res.body.items.find((i: MaintenanceItem) => i.typeCode === 'COOLANT')).toMatchObject({ askHistory: false, baseline: { source: 'VEHICLE_REGISTRATION' } });

    const invalid = await user.patch(`/v1/vehicles/${vehicleId}/maintenance/OIL_CHANGE`, { priorHistory: { km: 99_000, date: '2999-01-01' } });
    expect(invalid.status).toBe(422);
    expect(invalid.body.error.fields).toEqual({ 'priorHistory.km': 'too_big', 'priorHistory.date': 'future' });
  });
});

describe('customization (US4)', () => {
  it('custom interval is never city-adjusted, can be reset, and items can be disabled', async () => {
    await user.patch(`/v1/vehicles/${vehicleId}`, { usageType: 'CITY' });
    let res = await user.patch(`/v1/vehicles/${vehicleId}/maintenance/OIL_CHANGE`, { customIntervalKm: 15_000 });
    expect(res.body.items.find((i: MaintenanceItem) => i.typeCode === 'OIL_CHANGE')).toMatchObject({ dueKm: 60_000, interval: { km: 15_000, source: 'CUSTOM' } });

    res = await user.patch(`/v1/vehicles/${vehicleId}/maintenance/OIL_CHANGE`, { resetInterval: true });
    expect(res.body.items.find((i: MaintenanceItem) => i.typeCode === 'OIL_CHANGE')).toMatchObject({ interval: { km: 8000, source: 'CITY_ADJUSTED' } });

    res = await user.patch(`/v1/vehicles/${vehicleId}/maintenance/TIMING_BELT`, { enabled: false });
    expect(res.body.items.find((i: MaintenanceItem) => i.typeCode === 'TIMING_BELT')).toMatchObject({ enabled: false, status: null });
    expect(await prisma.maintenanceEstimate.count({ where: { vehicleId, typeCode: 'TIMING_BELT' } })).toBe(0);

    res = await user.patch(`/v1/vehicles/${vehicleId}/maintenance/TIMING_BELT`, { enabled: true });
    expect(res.body.items.find((i: MaintenanceItem) => i.typeCode === 'TIMING_BELT')).toMatchObject({ enabled: true, status: 'OK' });

    expect((await user.patch(`/v1/vehicles/${vehicleId}/maintenance/OIL_CHANGE`, { customIntervalKm: 100 })).status).toBe(422);
    expect((await user.patch(`/v1/vehicles/${vehicleId}/maintenance/OIL_CHANGE`, {})).status).toBe(422);
  });
});
