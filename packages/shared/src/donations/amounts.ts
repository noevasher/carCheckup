/** Suggested amounts in MXN (FR-002). */
export const DONATION_PRESETS = [50, 100, 200] as const;
/** Limits in whole MXN (FR-003). */
export const MIN_DONATION = 20;
export const MAX_DONATION = 10_000;
export const DONATION_CURRENCY = 'MXN';

/** Ad-free days granted per 50 MXN of a one-time donation (FR-013). */
const DAYS_PER_50_MXN = 30;

export const toCents = (amountMxn: number): number => Math.round(amountMxn * 100);
export const fromCents = (cents: number): number => cents / 100;

/** 30 days per 50 MXN, proportional, rounded down to whole days: 20 → 12, 100 → 60. */
export function adFreeDays(amountMxn: number): number {
  return Math.floor((amountMxn * DAYS_PER_50_MXN) / 50);
}

export function isValidDonationAmount(amountMxn: number): boolean {
  return Number.isInteger(amountMxn) && amountMxn >= MIN_DONATION && amountMxn <= MAX_DONATION;
}
