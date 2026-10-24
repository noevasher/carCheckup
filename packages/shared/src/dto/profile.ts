import type { Profile } from '../generated/prisma/browser';
import type { Serialized } from './serialized';

export type ProfileDto = Serialized<Pick<Profile, 'id' | 'activeVehicleId' | 'emailStatus'>> & {
  /** The user unsubscribed from reminder emails (feature 003, FR-014). */
  emailUnsubscribed: boolean;
  /** End of the ad-free benefit from donations (feature 004); the ads feature must respect it. */
  adFreeUntil: string | null;
  /** Show the discreet donation card on home (FR-012a). */
  showDonationCard: boolean;
};
