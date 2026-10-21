import { z } from 'zod';
import type { Profile } from '../generated/prisma/browser';
import type { AssertKeysIn } from './common';

export const ProfileUpdateSchema = z.object({
  activeVehicleId: z.uuid(),
});
export type ProfileUpdateInput = z.infer<typeof ProfileUpdateSchema>;

export const profileUpdateMatchesModel: AssertKeysIn<ProfileUpdateInput, Profile> = true;
