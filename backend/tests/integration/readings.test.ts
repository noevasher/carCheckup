import { randomUUID } from 'node:crypto';
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { prisma } from '../../src/lib/prisma';
import { createTestContext, daysAgo, resetDatabase } from '../helpers';

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
    initialReadingId: randomUUID(),
  });
  vehicleId = res.body.id;
  // Move the initial reading 30 days back so plausibility checks have room.
  await prisma.mileageReading.updateMany({ where: { vehicleId }, data: { readAt: new Date(daysAgo(30)) } });
});

const reading = (overrides: object = {}) => ({
  id: randomUUID(),
  odometerKm: 45_350,
  readAt: new Date().toISOString(),
  origin: 'ONLINE',
  ...overrides,
});

const path = () => `/v1/vehicles/${vehicleId}/readings`;

describe('POST readings', () => {
  it('creates a reading and updates the current odometer (FR-007)', async () => {
    const res = await user.post(path(), reading());
    expect(res.status).toBe(201);
    expect(res.body.reading).toMatchObject({ odometerKm: 45_350, source: 'UPDATE', reviewStatus: 'OK' });
    expect(res.body.vehicle.currentOdometerKm).toBe(45_350);
  });

  it('is idempotent by client id; conflicting content is rejected (FR-010, SC-004)', async () => {
    const body = reading();
    expect((await user.post(path(), body)).status).toBe(201);
    const replay = await user.post(path(), body);
    expect(replay.status).toBe(200);
    expect(replay.body.reading.id).toBe(body.id);
    expect(await prisma.mileageReading.count({ where: { vehicleId } })).toBe(2);

    const conflicting = await user.post(path(), { ...body, odometerKm: 46_000 });
    expect(conflicting.status).toBe(409);
    expect(conflicting.body.error.code).toBe('ID_CONFLICT');
  });

  it('handles concurrent duplicates without creating two readings', async () => {
    const body = reading();
    const results = await Promise.all([user.post(path(), body), user.post(path(), body)]);
    expect(results.map((r) => r.status).sort()).toEqual([200, 201]);
    expect(await prisma.mileageReading.count({ where: { id: body.id } })).toBe(1);
  });

  it('rejects online readings lower than the previous one with the valid range (FR-008)', async () => {
    const res = await user.post(path(), reading({ odometerKm: 44_000 }));
    expect(res.status).toBe(422);
    expect(res.body.error).toEqual({
      code: 'READING_OUT_OF_ORDER',
      validRange: { minKm: 45_000, maxKm: null },
    });
  });

  it('accepts past dates between neighbors and rejects outside them (US2-4)', async () => {
    await user.post(path(), reading({ odometerKm: 48_000, readAt: daysAgo(10) }));
    const between = await user.post(path(), reading({ odometerKm: 46_000, readAt: daysAgo(20) }));
    expect(between.status).toBe(201);
    expect(between.body.vehicle.currentOdometerKm).toBe(48_000);
    const outside = await user.post(path(), reading({ odometerKm: 49_000, readAt: daysAgo(15) }));
    expect(outside.status).toBe(422);
    expect(outside.body.error.validRange).toEqual({ minKm: 46_000, maxKm: 48_000 });
  });

  it('rejects future dates beyond the tolerance', async () => {
    const res = await user.post(path(), reading({ readAt: new Date(Date.now() + 3_600_000).toISOString() }));
    expect(res.status).toBe(422);
    expect(res.body.error.fields).toEqual({ readAt: 'future' });
  });

  it('requires confirmation for unusual distances (FR-009)', async () => {
    const yesterday = await user.post(path(), reading({ odometerKm: 46_000, readAt: daysAgo(1) }));
    expect(yesterday.status).toBe(201);
    const jump = reading({ odometerKm: 51_000 });
    const res = await user.post(path(), jump);
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('UNUSUAL_DISTANCE');
    const confirmed = await user.post(path(), { ...jump, confirmedUnusual: true });
    expect(confirmed.status).toBe(201);
  });

  it('stores out-of-order offline readings as NEEDS_REVIEW without touching the odometer', async () => {
    const res = await user.post(path(), reading({ odometerKm: 40_000, origin: 'OFFLINE_SYNC' }));
    expect(res.status).toBe(201);
    expect(res.body.reading.reviewStatus).toBe('NEEDS_REVIEW');
    expect(res.body.vehicle).toMatchObject({ currentOdometerKm: 45_000, pendingReviewCount: 1 });
  });

  it('requires readAt (idempotency key)', async () => {
    const { readAt: _omit, ...withoutDate } = reading();
    const res = await user.post(path(), withoutDate);
    expect(res.status).toBe(422);
    expect(res.body.error.fields).toHaveProperty('readAt');
  });
});

describe('PATCH / DELETE / GET readings', () => {
  it('corrects a reading in place and resolves NEEDS_REVIEW (US2-3, FR-012)', async () => {
    const bad = await user.post(path(), reading({ odometerKm: 40_000, origin: 'OFFLINE_SYNC' }));
    const fixed = await user.patch(`${path()}/${bad.body.reading.id}`, { odometerKm: 45_500 });
    expect(fixed.status).toBe(200);
    expect(fixed.body.reading.reviewStatus).toBe('OK');
    expect(fixed.body.vehicle).toMatchObject({ currentOdometerKm: 45_500, pendingReviewCount: 0 });

    const invalid = await user.patch(`${path()}/${bad.body.reading.id}`, { odometerKm: 1 });
    expect(invalid.status).toBe(422);
    expect(invalid.body.error.code).toBe('READING_OUT_OF_ORDER');
  });

  it('protects the last OK reading and recalculates after deletes', async () => {
    const [initial] = await prisma.mileageReading.findMany({ where: { vehicleId } });
    const lastOnly = await user.delete(`${path()}/${initial?.id ?? ''}`);
    expect(lastOnly.status).toBe(409);
    expect(lastOnly.body.error.code).toBe('LAST_READING_UNDELETABLE');

    const newer = await user.post(path(), reading({ odometerKm: 46_000 }));
    const deleted = await user.delete(`${path()}/${newer.body.reading.id}`);
    expect(deleted.status).toBe(200);
    expect(deleted.body.currentOdometerKm).toBe(45_000);

    // The initial reading can be deleted when another OK reading exists.
    await user.post(path(), reading({ odometerKm: 46_500 }));
    expect((await user.delete(`${path()}/${initial?.id ?? ''}`)).status).toBe(200);
  });

  it('paginates history newest first', async () => {
    for (let i = 1; i <= 4; i += 1) {
      await user.post(path(), reading({ odometerKm: 45_000 + i * 100, readAt: daysAgo(30 - i) }));
    }
    const first = await user.get(`${path()}?limit=3`);
    expect(first.body.items.map((r: { odometerKm: number }) => r.odometerKm)).toEqual([45_400, 45_300, 45_200]);
    const second = await user.get(`${path()}?limit=3&cursor=${first.body.nextCursor}`);
    expect(second.body.items.map((r: { odometerKm: number }) => r.odometerKm)).toEqual([45_100, 45_000]);
    expect(second.body.nextCursor).toBeNull();
    expect((await user.get(`${path()}?cursor=bogus`)).status).toBe(422);
  });
});

describe('history filter', () => {
  it('filters by reviewStatus', async () => {
    await user.post(path(), reading({ odometerKm: 40_000, origin: 'OFFLINE_SYNC' }));
    const res = await user.get(`${path()}?reviewStatus=NEEDS_REVIEW`);
    expect(res.body.items).toHaveLength(1);
    expect(res.body.items[0].odometerKm).toBe(40_000);
  });
});
