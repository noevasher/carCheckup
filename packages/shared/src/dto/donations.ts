import type { DonationKind, DonationStatus, PaymentProvider, SubscriptionStatus } from '../generated/prisma/enums';

export interface SubscriptionDto {
  id: string;
  provider: PaymentProvider;
  /** Whole MXN. */
  amount: number;
  status: SubscriptionStatus;
  paidUntil: string | null;
  nextChargeAt: string | null;
}

export interface DonationConfigDto {
  providers: PaymentProvider[];
  presets: number[];
  minAmount: number;
  maxAmount: number;
  currency: 'MXN';
  adFreeUntil: string | null;
  subscription: SubscriptionDto | null;
  supportEmail: string | null;
}

export interface DonationStartResultDto {
  /** Donation (one-time) or DonationSubscription (monthly) id. */
  donationId: string;
  redirectUrl: string;
}

export interface DonationResultDto {
  id: string;
  kind: 'ONE_TIME' | 'MONTHLY';
  status: DonationStatus;
  amount: number;
  provider: PaymentProvider;
  adFreeUntil: string | null;
}

export interface DonationItemDto {
  id: string;
  kind: DonationKind;
  provider: PaymentProvider;
  amount: number;
  currency: string;
  status: DonationStatus;
  createdAt: string;
  confirmedAt: string | null;
}

export interface DonationHistoryDto {
  items: DonationItemDto[];
  subscription: SubscriptionDto | null;
  adFreeUntil: string | null;
  supportEmail: string | null;
}

export interface ManageLinkDto {
  url: string;
}
