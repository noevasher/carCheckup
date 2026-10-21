import type { Profile } from '../generated/prisma/browser';
import type { Serialized } from './serialized';

export type ProfileDto = Serialized<Pick<Profile, 'id' | 'activeVehicleId'>>;
