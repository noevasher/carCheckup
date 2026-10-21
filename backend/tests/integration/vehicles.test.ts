import { randomUUID } from 'node:crypto';
import supertest from 'supertest';
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { prisma } from '../../src/lib/prisma';
import { createTestContext, resetDatabase } from '../helpers';

let ctx: Awaited<ReturnType<typeof createTestContext>>;

beforeAll(async () => {
  ctx = await createTestContext();
});
beforeEach(resetDatabase);

const newVehicle = (overrides: object = {}) => ({
  make: 'Toyota',
  model: 'Corolla',
  year: 2019,
  odometerKm: 45_000,
  initialReadingId: randomUUID(),
  ...overrides,
});

describe('auth', () => {
  it('rejects missing and invalid tokens', async () => {
    const res = await supertest(ctx.app).get('/v1/vehicles');
    expect(res.status).toBe(401);
    expect(res.body).toEqual({ error: { code: 'UNAUTHORIZED' } });

    const bad = await ctx.tokenFor(randomUUID(), { issuer: 'http://evil.test/auth/v1' });
    const res2 = await supertest(ctx.app).get('/v1/vehicles').set('Authorization', `Bearer ${bad}`);
    expect(res2.status).toBe(401);
  });

  it('creates the profile on first request', async () => {
    const user = await ctx.userAgent();
    const res = await user.get('/v1/me');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ id: user.userId, activeVehicleId: null });
  });
});

describe('POST /v1/vehicles', () => {
  it('creates vehicle + initial reading and makes it active (FR-001, FR-003)', async () => {
    const user = await ctx.userAgent();
    const body = newVehicle({ licensePlate: ' abc123 ', nickname: '' });
    const res = await user.post('/v1/vehicles', body);
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({
      make: 'Toyota',
      model: 'Corolla',
      catalogModelId: null,
      currentOdometerKm: 45_000,
      licensePlate: 'ABC123',
      nickname: null,
      fuelType: null,
      pendingReviewCount: 0,
    });
    const me = await user.get('/v1/me');
    expect(me.body.activeVehicleId).toBe(res.body.id);
    const reading = await prisma.mileageReading.findUniqueOrThrow({ where: { id: body.initialReadingId } });
    expect(reading).toMatchObject({ source: 'INITIAL', odometerKm: 45_000 });
  });

  it('uses catalog names when catalogModelId is given (FR-002)', async () => {
    const make = await prisma.catalogMake.create({ data: { name: 'Škoda' } });
    const model = await prisma.catalogModel.create({ data: { makeId: make.id, name: 'Octavia' } });
    const user = await ctx.userAgent();
    const res = await user.post('/v1/vehicles', newVehicle({ catalogModelId: model.id, make: 'x', model: 'y' }));
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ make: 'Škoda', model: 'Octavia', catalogModelId: model.id });
  });

  it('is idempotent on initialReadingId (offline retry)', async () => {
    const user = await ctx.userAgent();
    const body = newVehicle();
    const first = await user.post('/v1/vehicles', body);
    const second = await user.post('/v1/vehicles', body);
    expect(second.status).toBe(201);
    expect(second.body.id).toBe(first.body.id);
    expect(await prisma.vehicle.count()).toBe(1);
  });

  it('validates fields with codes (FR-015)', async () => {
    const user = await ctx.userAgent();
    const res = await user.post(
      '/v1/vehicles',
      newVehicle({ make: '', year: 1949, odometerKm: 1.5, fuelType: 'STEAM' }),
    );
    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
    expect(Object.keys(res.body.error.fields).sort()).toEqual(['fuelType', 'make', 'odometerKm', 'year']);

    const future = await user.post('/v1/vehicles', newVehicle({ year: new Date().getFullYear() + 2 }));
    expect(future.status).toBe(422);
    expect(future.body.error.fields).toEqual({ year: 'too_big' });
  });
});

describe('vehicle ownership and management', () => {
  it('hides other users vehicles behind 404 (FR-014)', async () => {
    const alice = await ctx.userAgent();
    const bob = await ctx.userAgent();
    const { body: v } = await alice.post('/v1/vehicles', newVehicle());
    expect((await bob.get(`/v1/vehicles/${v.id}`)).status).toBe(404);
    expect((await bob.patch(`/v1/vehicles/${v.id}`, { year: 2020 })).status).toBe(404);
    expect((await bob.delete(`/v1/vehicles/${v.id}`)).status).toBe(404);
    expect((await bob.patch('/v1/me', { activeVehicleId: v.id })).status).toBe(404);
    expect((await bob.get(`/v1/vehicles/${v.id}/readings`)).status).toBe(404);
    expect((await bob.get('/v1/vehicles')).body.items).toEqual([]);
  });

  it('lists N vehicles, switches active one, edits and deletes (US3, US4)', async () => {
    const user = await ctx.userAgent();
    const { body: a } = await user.post('/v1/vehicles', newVehicle());
    const { body: b } = await user.post('/v1/vehicles', newVehicle({ make: 'Mazda', model: '3' }));
    expect((await user.get('/v1/me')).body.activeVehicleId).toBe(b.id);
    expect((await user.get('/v1/vehicles')).body.items.map((v: { id: string }) => v.id)).toEqual([a.id, b.id]);

    expect((await user.patch('/v1/me', { activeVehicleId: a.id })).body.activeVehicleId).toBe(a.id);

    const edited = await user.patch(`/v1/vehicles/${a.id}`, { year: 2020, fuelType: 'HYBRID' });
    expect(edited.body).toMatchObject({ year: 2020, fuelType: 'HYBRID' });
    expect((await user.patch(`/v1/vehicles/${a.id}`, {})).status).toBe(422);

    expect((await user.delete(`/v1/vehicles/${a.id}`)).status).toBe(204);
    expect((await user.get('/v1/me')).body.activeVehicleId).toBeNull();
    expect(await prisma.mileageReading.count({ where: { vehicleId: a.id } })).toBe(0);
  });
});

describe('catalog', () => {
  it('searches makes ignoring accents/case, prefix first, and models by make', async () => {
    const skoda = await prisma.catalogMake.create({ data: { name: 'Škoda' } });
    await prisma.catalogMake.createMany({ data: [{ name: 'Toyota' }, { name: 'Lotus' }] });
    await prisma.catalogModel.createMany({
      data: [
        { makeId: skoda.id, name: 'Octavia' },
        { makeId: skoda.id, name: 'Fabia' },
      ],
    });
    const user = await ctx.userAgent();
    const makes = await user.get('/v1/catalog/makes?q=SKO');
    expect(makes.body.items).toEqual([{ id: skoda.id, name: 'Škoda' }]);
    const ot = await user.get('/v1/catalog/makes?q=ot');
    expect(ot.body.items.map((m: { name: string }) => m.name)).toEqual(['Lotus', 'Toyota']);
    const models = await user.get(`/v1/catalog/makes/${skoda.id}/models`);
    expect(models.body.items.map((m: { name: string }) => m.name)).toEqual(['Fabia', 'Octavia']);
    expect((await user.get(`/v1/catalog/makes/${randomUUID()}/models`)).status).toBe(404);
    expect((await user.get('/v1/catalog/makes?q=')).status).toBe(422);
    expect((await user.get('/v1/catalog/makes?q=%25')).body.items).toEqual([]);
  });
});
