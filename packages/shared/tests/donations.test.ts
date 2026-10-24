import { describe, expect, it } from 'vitest';
import { adFreeDays, computeAdFreeUntil, isValidDonationAmount } from '../src/donations';

const d = (iso: string) => new Date(iso);

describe('amounts (FR-003, FR-013)', () => {
  it('grants 30 days per 50 MXN, rounded down', () => {
    expect(adFreeDays(20)).toBe(12);
    expect(adFreeDays(50)).toBe(30);
    expect(adFreeDays(100)).toBe(60);
    expect(adFreeDays(75)).toBe(45);
    expect(adFreeDays(10_000)).toBe(6000);
  });

  it('validates whole MXN between 20 and 10.000', () => {
    expect(isValidDonationAmount(20)).toBe(true);
    expect(isValidDonationAmount(10_000)).toBe(true);
    expect(isValidDonationAmount(19)).toBe(false);
    expect(isValidDonationAmount(10_001)).toBe(false);
    expect(isValidDonationAmount(50.5)).toBe(false);
  });
});

describe('computeAdFreeUntil (research R5)', () => {
  const now = d('2026-06-10T12:00:00Z');

  it('a single grant runs from its date', () => {
    expect(
      computeAdFreeUntil({ grants: [{ at: now, days: 60 }], periods: [], now })?.toISOString(),
    ).toBe('2026-08-09T12:00:00.000Z');
  });

  it('stacks grants: new days start at the end of the current benefit', () => {
    const until = computeAdFreeUntil({
      grants: [
        { at: d('2026-06-01T12:00:00Z'), days: 30 },
        { at: d('2026-06-10T12:00:00Z'), days: 30 },
      ],
      periods: [],
      now,
    });
    expect(until?.toISOString()).toBe('2026-07-31T12:00:00.000Z');
  });

  it('saves one-time days while a monthly period covers them (Q2: 30 jun + 50 MXN → 30 jul)', () => {
    const until = computeAdFreeUntil({
      grants: [{ at: d('2026-06-10T12:00:00Z'), days: 30 }],
      periods: [{ start: d('2026-05-31T00:00:00Z'), end: d('2026-06-30T00:00:00Z') }],
      now,
    });
    expect(until?.toISOString()).toBe('2026-07-30T00:00:00.000Z');
  });

  it('pauses a running grant during a later monthly period', () => {
    const until = computeAdFreeUntil({
      grants: [{ at: d('2026-06-01T00:00:00Z'), days: 30 }],
      periods: [{ start: d('2026-06-11T00:00:00Z'), end: d('2026-07-11T00:00:00Z') }],
      now,
    });
    // 10 days before the period, the remaining 20 after it.
    expect(until?.toISOString()).toBe('2026-07-31T00:00:00.000Z');
  });

  it('uses the monthly period end when there are no grants', () => {
    const until = computeAdFreeUntil({
      grants: [],
      periods: [{ start: d('2026-06-01T00:00:00Z'), end: d('2026-07-01T00:00:00Z') }],
      now,
    });
    expect(until?.toISOString()).toBe('2026-07-01T00:00:00.000Z');
  });

  it('returns null when nothing is active (expired or removed by a refund)', () => {
    expect(
      computeAdFreeUntil({
        grants: [{ at: d('2026-01-01T00:00:00Z'), days: 30 }],
        periods: [],
        now,
      }),
    ).toBeNull();
    expect(computeAdFreeUntil({ grants: [], periods: [], now })).toBeNull();
  });
});
