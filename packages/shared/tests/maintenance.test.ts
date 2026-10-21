import { describe, expect, it } from 'vitest';
import {
  addDays,
  computePace,
  dateAtKm,
  deriveStatus,
  estimateMaintenance,
  isApplicable,
  isSnoozed,
  kmAtDate,
  MAINTENANCE_DEFAULTS,
  resolveBaseline,
  resolveInterval,
  summarize,
  todayInTimeZone,
  type EngineInput,
  type ReadingInput,
  type SettingInput,
} from '../src/maintenance';

const d = (iso: string) => new Date(iso);
const entry = (code: string) => {
  const e = MAINTENANCE_DEFAULTS.find((x) => x.code === code);
  if (e === undefined) throw new Error(code);
  return e;
};
const reading = (km: number, iso: string): ReadingInput => ({ odometerKm: km, readAt: d(iso) });

const baseInput = (overrides: Partial<EngineInput> = {}): EngineInput => {
  const initial = reading(45_000, '2026-01-01T12:00:00Z');
  return {
    catalog: MAINTENANCE_DEFAULTS,
    settings: [],
    latestServiceByType: new Map(),
    readings: [initial],
    initialReading: initial,
    vehicle: { fuelType: 'GASOLINE', usageType: null, currentOdometerKm: 45_000, lastReadingAt: initial.readAt },
    ...overrides,
  };
};
const oil = (input: EngineInput) => estimateMaintenance(input).find((e) => e.typeCode === 'OIL_CHANGE');

describe('computePace (R4)', () => {
  it('uses the usage default without enough readings (30/60/40)', () => {
    const one = [reading(1000, '2026-01-01T00:00:00Z')];
    expect(computePace(one, 'CITY')).toMatchObject({ kmPerDay: 30, source: 'USAGE_DEFAULT', usageType: 'CITY' });
    expect(computePace(one, 'HIGHWAY').kmPerDay).toBe(60);
    expect(computePace(one, 'MIXED').kmPerDay).toBe(40);
    expect(computePace([], null).kmPerDay).toBe(40);
  });

  it('requires a span of at least 7 days', () => {
    const r = [reading(1000, '2026-01-01T00:00:00Z'), reading(1500, '2026-01-05T00:00:00Z')];
    expect(computePace(r, null).source).toBe('USAGE_DEFAULT');
  });

  it('uses the last 90 days when possible, else all readings', () => {
    const r = [
      reading(0, '2025-01-01T00:00:00Z'),
      reading(10_000, '2026-01-01T00:00:00Z'),
      reading(13_500, '2026-03-12T00:00:00Z'), // 70 days → 50 km/day
    ];
    expect(computePace(r, null)).toMatchObject({ kmPerDay: 50, source: 'READINGS', windowDays: 70 });
    const sparse = [reading(0, '2025-01-01T00:00:00Z'), reading(36_500, '2026-01-01T00:00:00Z')];
    expect(computePace(sparse, null)).toMatchObject({ kmPerDay: 100, source: 'READINGS' });
  });

  it('keeps 0 km/day for a parked vehicle', () => {
    const r = [reading(5000, '2026-01-01T00:00:00Z'), reading(5000, '2026-02-01T00:00:00Z')];
    expect(computePace(r, null)).toMatchObject({ kmPerDay: 0, source: 'READINGS' });
  });
});

describe('resolveInterval (R6)', () => {
  it('reduces severe-usage items by 20 % in city use, rounded to 100', () => {
    expect(resolveInterval(entry('OIL_CHANGE'), null, 'CITY')).toMatchObject({ km: 8000, months: 12, source: 'CITY_ADJUSTED' });
    expect(resolveInterval(entry('CABIN_AIR_FILTER'), null, 'CITY').km).toBe(12_000);
    expect(resolveInterval(entry('TIRE_ROTATION'), null, 'CITY')).toMatchObject({ km: 10_000, source: 'DEFAULT' });
    expect(resolveInterval(entry('OIL_CHANGE'), null, 'HIGHWAY').source).toBe('DEFAULT');
  });

  it('never adjusts a custom interval', () => {
    const custom = { customIntervalKm: 15_000, customIntervalMonths: null };
    expect(resolveInterval(entry('OIL_CHANGE'), custom, 'CITY')).toMatchObject({ km: 15_000, months: 12, source: 'CUSTOM', defaultKm: 10_000 });
  });
});

describe('isApplicable', () => {
  it('excludes combustion items for electric vehicles', () => {
    const electric = MAINTENANCE_DEFAULTS.filter((e) => isApplicable(e, 'ELECTRIC')).map((e) => e.code);
    for (const code of ['OIL_CHANGE', 'ENGINE_AIR_FILTER', 'COOLANT', 'SPARK_PLUGS', 'TIMING_BELT', 'TRANSMISSION_FLUID']) {
      expect(electric).not.toContain(code);
    }
    expect(electric).toContain('BRAKE_FLUID');
  });

  it('shows combustion-common items when fuel is unknown, but not spark plugs; diesel has no plugs', () => {
    expect(isApplicable(entry('OIL_CHANGE'), null)).toBe(true);
    expect(isApplicable(entry('SPARK_PLUGS'), null)).toBe(false);
    expect(isApplicable(entry('SPARK_PLUGS'), 'DIESEL')).toBe(false);
  });
});

describe('resolveBaseline (R5)', () => {
  const readings = [reading(10_000, '2026-01-01T12:00:00Z'), reading(20_000, '2026-11-01T12:00:00Z')];
  const initial = readings[0] as ReadingInput;

  it('prefers the latest service, then prior history, then registration', () => {
    const service = { odometerKm: 15_000, performedAt: d('2026-06-01T12:00:00Z') };
    const prior = { priorKm: 9000, priorDate: d('2025-12-01'), priorUnknown: false };
    expect(resolveBaseline({ latestService: service, prior, initialReading: initial, readings, kmPerDay: 40 }).source).toBe('SERVICE');
    expect(resolveBaseline({ latestService: null, prior, initialReading: initial, readings, kmPerDay: 40 })).toMatchObject({ source: 'PRIOR', km: 9000 });
    expect(
      resolveBaseline({ latestService: null, prior: { ...prior, priorKm: null, priorDate: null, priorUnknown: true }, initialReading: initial, readings, kmPerDay: 40 }).source,
    ).toBe('VEHICLE_REGISTRATION');
  });

  it('interpolates km from a date and a date from km', () => {
    expect(kmAtDate(readings, d('2026-06-01T12:00:00Z'), 40)).toBe(14_967);
    expect(kmAtDate(readings, d('2025-12-22T12:00:00Z'), 40)).toBe(9600);
    expect(dateAtKm(readings, 15_000, 40).toISOString().slice(0, 10)).toBe('2026-06-02');
    expect(dateAtKm(readings, 9000, 40).toISOString().slice(0, 10)).toBe('2025-12-07');
  });
});

describe('estimateMaintenance (R7)', () => {
  it('computes from the vehicle registration (oil due at 55.000 km, ~250 days at 40 km/day)', () => {
    const est = oil(baseInput());
    expect(est).toMatchObject({ dueKm: 55_000, limitingFactor: 'KM', baseline: { source: 'VEHICLE_REGISTRATION', km: 45_000 } });
    expect(est?.estimatedDueAt?.toISOString().slice(0, 10)).toBe('2026-09-08');
    expect(est?.dueByTimeAt?.toISOString().slice(0, 10)).toBe('2027-01-01');
  });

  it('applies the city adjustment and the city default pace (53.000 km at 30 km/day)', () => {
    const input = baseInput();
    const est = oil({ ...input, vehicle: { ...input.vehicle, usageType: 'CITY' } });
    expect(est).toMatchObject({ dueKm: 53_000, pace: { kmPerDay: 30, source: 'USAGE_DEFAULT' } });
  });

  it('uses the time limit when it comes first', () => {
    const input = baseInput();
    const est = oil({ ...input, vehicle: { ...input.vehicle, usageType: 'CITY' }, settings: [setting({ customIntervalKm: 100_000 })] });
    expect(est?.limitingFactor).toBe('TIME');
  });

  it('has no estimated date by km for a parked vehicle; months-only items still get a date', () => {
    const r = [reading(5000, '2026-01-01T12:00:00Z'), reading(5000, '2026-03-01T12:00:00Z')];
    const input = baseInput({ readings: r, initialReading: r[0] as ReadingInput });
    const all = estimateMaintenance({ ...input, vehicle: { ...input.vehicle, currentOdometerKm: 5000, lastReadingAt: d('2026-03-01T12:00:00Z') } });
    expect(all.find((e) => e.typeCode === 'OIL_CHANGE')).toMatchObject({ estimatedByKmAt: null, limitingFactor: 'TIME' });
    expect(all.find((e) => e.typeCode === 'BRAKE_FLUID')?.limitingFactor).toBe('TIME');
  });

  it('skips disabled items', () => {
    expect(oil(baseInput({ settings: [setting({ enabled: false })] }))).toBeUndefined();
  });

  it('SC-004: with a steady 40 km/day the estimated date is within 15 days of the real one', () => {
    const start = d('2026-01-01T12:00:00Z');
    const r = Array.from({ length: 121 }, (_, i) => reading(45_000 + i * 40, addDays(start, i).toISOString()));
    const last = r.at(-1) as ReadingInput;
    const est = oil({
      ...baseInput({ readings: r, initialReading: r[0] as ReadingInput }),
      vehicle: { fuelType: 'GASOLINE', usageType: 'MIXED', currentOdometerKm: last.odometerKm, lastReadingAt: last.readAt },
    });
    const realDate = addDays(start, (55_000 - 45_000) / 40); // day the odometer reaches dueKm
    const diffDays = Math.abs(((est?.estimatedDueAt?.getTime() ?? 0) - realDate.getTime()) / 86_400_000);
    expect(diffDays).toBeLessThan(15);
  });
});

describe('status (FR-006)', () => {
  const tz = 'America/Mexico_City';
  it('derives OVERDUE / UPCOMING / OK with 1.000 km and 30 days thresholds', () => {
    const base = { dueKm: 55_000, dueByTimeAt: '2027-06-01T12:00:00Z', estimatedDueAt: '2026-12-01T12:00:00Z' };
    expect(deriveStatus(base, 55_000, '2026-10-01', tz)).toBe('OVERDUE');
    expect(deriveStatus(base, 54_000, '2026-10-01', tz)).toBe('UPCOMING');
    expect(deriveStatus(base, 50_000, '2026-11-01', tz)).toBe('UPCOMING');
    expect(deriveStatus(base, 50_000, '2026-10-01', tz)).toBe('OK');
    expect(deriveStatus({ ...base, dueKm: null }, 0, '2027-06-01', tz)).toBe('OVERDUE');
  });

  it('compares calendar dates in the user time zone', () => {
    // 2026-12-01T03:00Z is still Nov 30 in Mexico City.
    const s = { dueKm: null, dueByTimeAt: '2026-12-01T03:00:00Z', estimatedDueAt: null };
    expect(deriveStatus(s, 0, '2026-11-30', tz)).toBe('OVERDUE');
    expect(deriveStatus(s, 0, '2026-11-30', 'UTC')).toBe('UPCOMING');
    expect(todayInTimeZone(tz, d('2026-12-01T03:00:00Z'))).toBe('2026-11-30');
  });

  it('handles snoozes and summaries', () => {
    expect(isSnoozed('2026-10-08', '2026-10-01')).toBe(true);
    expect(isSnoozed('2026-10-01', '2026-10-01')).toBe(false);
    expect(
      summarize([
        { status: 'OVERDUE', snoozed: false },
        { status: 'OVERDUE', snoozed: true },
        { status: 'UPCOMING', snoozed: false },
        { status: 'OK', snoozed: false },
        { status: null, snoozed: false },
      ]),
    ).toEqual({ overdueCount: 1, upcomingCount: 1 });
  });
});

function setting(overrides: Partial<SettingInput>): SettingInput {
  return {
    typeCode: 'OIL_CHANGE',
    enabled: true,
    customIntervalKm: null,
    customIntervalMonths: null,
    priorKm: null,
    priorDate: null,
    priorUnknown: false,
    snoozedUntil: null,
    ...overrides,
  };
}
