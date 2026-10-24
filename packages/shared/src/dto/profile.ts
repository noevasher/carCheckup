import type { Profile } from '../generated/prisma/browser';
import type { Serialized } from './serialized';

export type ProfileDto = Serialized<Pick<Profile, 'id' | 'activeVehicleId' | 'emailStatus'>> & {
  /** The user unsubscribed from reminder emails (feature 003, FR-014). */
  emailUnsubscribed: boolean;
};
