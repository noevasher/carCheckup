import { describe, expect, it } from 'vitest';
import {
  checkOrder,
  findNeighbors,
  isFutureDate,
  isUnusual,
  parseKmInput,
  type ReadingPoint,
} from '../src/validation/readings';

const r = (id: string, km: number, readAt: string, ok = true): ReadingPoint => ({
  id,
  odometerKm: km,
  readAt,
  reviewStatus: ok ? 'OK' : 'NEEDS_REVIEW',
});

const readings = [
  r('a', 1000, '2026-01-01T00:00:00Z'),
  r('b', 2000, '2026-02-01T00:00:00Z'),
  r('x', 9000, '2026-02-15T00:00:00Z', false),
  r('c', 3000, '2026-03-01T00:00:00Z'),
];

describe('findNeighbors', () => {
  it('finds the immediate OK readings around a date, ignoring NEEDS_REVIEW', () => {
    const { prev, next } = findNeighbors(readings, '2026-02-20T00:00:00Z');
    expect(prev?.id).toBe('b');
    expect(next?.id).toBe('c');
  });

  it('excludes the reading being edited', () => {
    const { prev, next } = findNeighbors(readings, '2026-02-01T00:00:00Z', 'b');
    expect(prev?.id).toBe('a');
    expect(next?.id).toBe('c');
  });

  it('returns null at the edges', () => {
    expect(findNeighbors(readings, '2026-04-01T00:00:00Z').next).toBeNull();
    expect(findNeighbors(readings, '2025-01-01T00:00:00Z').prev).toBeNull();
  });
});

describe('checkOrder', () => {
  it('accepts values between neighbors (inclusive)', () => {
    expect(checkOrder(2000, { odometerKm: 2000 }, { odometerKm: 3000 })).toEqual({ ok: true });
    expect(checkOrder(3000, { odometerKm: 2000 }, { odometerKm: 3000 })).toEqual({ ok: true });
  });

  it('rejects values outside the range and reports it', () => {
    expect(checkOrder(1999, { odometerKm: 2000 }, null)).toEqual({
      ok: false,
      validRange: { minKm: 2000, maxKm: null },
    });
    expect(checkOrder(3001, { odometerKm: 2000 }, { odometerKm: 3000 })).toEqual({
      ok: false,
      validRange: { minKm: 2000, maxKm: 3000 },
    });
  });
});

describe('isUnusual', () => {
  const prev = { odometerKm: 10_000, readAt: '2026-03-01T00:00:00Z' };

  it('uses at least one day as the divisor', () => {
    expect(isUnusual(11_500, prev, '2026-03-01T02:00:00Z')).toBe(false);
    expect(isUnusual(11_501, prev, '2026-03-01T02:00:00Z')).toBe(true);
  });

  it('averages over the elapsed days', () => {
    expect(isUnusual(14_000, prev, '2026-03-04T00:00:00Z')).toBe(false);
    expect(isUnusual(15_000, prev, '2026-03-04T00:00:00Z')).toBe(true);
  });

  it('is never unusual without a previous reading', () => {
    expect(isUnusual(999_999, null, '2026-03-04T00:00:00Z')).toBe(false);
  });
});

describe('isFutureDate', () => {
  const now = new Date('2026-03-01T12:00:00Z');
  it('allows a 5 minute clock skew', () => {
    expect(isFutureDate('2026-03-01T12:04:59Z', now)).toBe(false);
    expect(isFutureDate('2026-03-01T12:05:01Z', now)).toBe(true);
  });
});

describe('parseKmInput', () => {
  it.each([
    ['45350', 45350],
    ['45.350', 45350],
    ['45,350', 45350],
    ['45 350', 45350],
    ['1.234.567', 1234567],
    ['45350,7', 45350],
    ['45350.99', 45350],
    ['0', 0],
  ])('parses %s', (input, expected) => {
    expect(parseKmInput(input)).toBe(expected);
  });

  it.each(['', 'abc', '-5', '45.35.0', '12a'])('rejects %s', (input) => {
    expect(parseKmInput(input)).toBeNull();
  });
});
