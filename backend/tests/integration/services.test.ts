import { randomUUID } from 'node:crypto';
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { prisma } from '../../src/lib/prisma';
import { createTestContext, daysAgo, resetDatabase } from '../helpers';

type Item = { typeCode: string; status: string | null; baseline: { source: string; km: number } | null; snoozed: boolean };

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
  // Registration 60 days ago, then 55.500 km today → oil overdue.
  await prisma.mileageReading.updateMany({ where: { vehicleId }, data: { readAt: new Date(daysAgo(60)) } });
  await user.post(`/v1/vehicles/${vehicleId}/readings`, {
    id: randomUUID(),
    odometerKm: 55_500,
    readAt: new Date().toISOString(),
    origin: 'ONLINE',
    confirmedUnusual: true,
  });
});

const path = () => `/v1/vehicles/${vehicleId}/services`;
const service = (overrides: object = {}) => ({
  id: randomUUID(),
  performedAt: new Date().toISOString(),
  odometerKm: 55_500,
  typeCodes: ['OIL_CHANGE'],
  ...overrides,
});
const find = (items: Item[], code: string) => items.find((i) => i.typeCode === code);

describe('POST services (US2)', () => {
  it('resets the maintenance from the service (FR-010, FR-013)', async () => {
    const before = await user.get(`/v1/vehicles/${vehicleId}/maintenance`);
    expect(find(before.body.items, 'OIL_CHANGE')?.status).toBe('OVERDUE');
    const res = await user.post(path(), service({ typeCodes: ['OIL_CHANGE', 'TIRE_ROTATION'], notes: 'Taller Pérez' }));
    expect(res.status).toBe(201);
    expect(res.body.service).toMatchObject({ typeCodes: ['OIL_CHANGE', 'TIRE_ROTATION'], notes: 'Taller Pérez', createdReading: false });
    expect(find(res.body.maintenance.items, 'OIL_CHANGE')).toMatchObject({ status: 'OK', baseline: { source: 'SERVICE', km: 55_500 } });
    expect(find(res.body.maintenance.items, 'TIRE_ROTATION')?.status).toBe('OK');
  });

  it('records a higher workshop odometer as a new reading (FR-012a)', async () => {
    const res = await user.post(path(), service({ odometerKm: 56_000 }));
    expect(res.status).toBe(201);
    expect(res.body.service.createdReading).toBe(true);
    expect(res.body.vehicle.currentOdometerKm).toBe(56_000);
    const reading = await prisma.mileageReading.findFirst({ where: { vehicleId, source: 'SERVICE' } });
    expect(reading?.odometerKm).toBe(56_000);
  });

  it('rejects out-of-order km with the valid range and future dates (FR-012)', async () => {
    const res = await user.post(path(), service({ odometerKm: 40_000 }));
    expect(res.status).toBe(422);
    expect(res.body.error).toMatchObject({ code: 'READING_OUT_OF_ORDER', validRange: { minKm: 55_500, maxKm: null } });
    const future = await user.post(path(), service({ performedAt: new Date(Date.now() + 3_600_000).toISOString() }));
    expect(future.body.error.fields).toEqual({ performedAt: 'future' });
  });

  it('asks for confirmation on unusual distances when creating a reading', async () => {
    const body = service({ odometerKm: 70_000 });
    expect((await user.post(path(), body)).body.error.code).toBe('UNUSUAL_DISTANCE');
    expect((await user.post(path(), { ...body, confirmedUnusual: true })).status).toBe(201);
  });

  it('is idempotent by id and clears snoozes of the serviced types', async () => {
    await user.patch(`/v1/vehicles/${vehicleId}/maintenance/OIL_CHANGE`, { snooze: true });
    const body = service();
    expect((await user.post(path(), body)).status).toBe(201);
    const replay = await user.post(path(), body);
    expect(replay.status).toBe(200);
    expect(await prisma.serviceRecord.count()).toBe(1);
    expect(find(replay.body.maintenance.items, 'OIL_CHANGE')?.snoozed).toBe(false);
    expect((await user.post(path(), { ...body, odometerKm: 55_400 })).body.error.code).toBe('ID_CONFLICT');
  });

  it('rejects empty or duplicated maintenance lists', async () => {
    expect((await user.post(path(), service({ typeCodes: [] }))).status).toBe(422);
    expect((await user.post(path(), service({ typeCodes: ['OIL_CHANGE', 'OIL_CHANGE'] }))).status).toBe(422);
  });
});

describe('PATCH / DELETE / GET services (FR-014)', () => {
  it('deleting a service restores the previous baseline and removes its reading', async () => {
    const created = await user.post(path(), service({ odometerKm: 56_000 }));
    const res = await user.delete(`${path()}/${created.body.service.id}`);
    expect(res.status).toBe(200);
    expect(find(res.body.maintenance.items, 'OIL_CHANGE')).toMatchObject({ status: 'OVERDUE', baseline: { source: 'VEHICLE_REGISTRATION' } });
    expect(res.body.vehicle.currentOdometerKm).toBe(55_500);
    expect(await prisma.mileageReading.count({ where: { source: 'SERVICE' } })).toBe(0);
  });

  it('editing keeps the generated reading consistent', async () => {
    const created = await user.post(path(), service({ odometerKm: 56_000 }));
    let res = await user.patch(`${path()}/${created.body.service.id}`, { odometerKm: 56_200, typeCodes: ['BRAKE_INSPECTION'] });
    expect(res.status).toBe(200);
    expect(res.body.vehicle.currentOdometerKm).toBe(56_200);
    expect(res.body.service.typeCodes).toEqual(['BRAKE_INSPECTION']);
    expect(find(res.body.maintenance.items, 'OIL_CHANGE')?.status).toBe('OVERDUE');

    res = await user.patch(`${path()}/${created.body.service.id}`, { odometerKm: 55_500 });
    expect(res.body.service.createdReading).toBe(false);
    expect(await prisma.mileageReading.count({ where: { source: 'SERVICE' } })).toBe(0);
  });

  it('lists newest first with pagination and hides other users', async () => {
    await user.post(path(), service({ performedAt: daysAgo(10), odometerKm: 50_000 }));
    await user.post(path(), service({ typeCodes: ['BATTERY_CHECK'] }));
    const page = await user.get(`${path()}?limit=1`);
    expect(page.body.items[0].typeCodes).toEqual(['BATTERY_CHECK']);
    const next = await user.get(`${path()}?limit=1&cursor=${page.body.nextCursor}`);
    expect(next.body.items[0].odometerKm).toBe(50_000);
    const other = await ctx.userAgent();
    expect((await other.get(path())).status).toBe(404);
    expect((await other.post(path(), service())).status).toBe(404);
  });
});
