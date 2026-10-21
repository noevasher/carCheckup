import type { ProfileDto } from '@car-checkup/shared/dto';
import { notFound } from '../../lib/http-error';
import { prisma } from '../../lib/prisma';

// Per-instance cache of profiles known to exist, so the upsert runs once per user per instance
// instead of on every request. Losing it (restart, other instance) only costs one extra upsert.
const KNOWN_PROFILES_MAX = 10_000;
const knownProfiles = new Set<string>();

export async function ensureProfile(userId: string): Promise<void> {
  if (knownProfiles.has(userId)) return;
  // INSERT … ON CONFLICT DO NOTHING: atomic even when a new user's first requests arrive together
  // (a Prisma upsert can race and fail with a unique violation).
  await prisma.profile.createMany({ data: [{ id: userId }], skipDuplicates: true });
  if (knownProfiles.size >= KNOWN_PROFILES_MAX) knownProfiles.clear();
  knownProfiles.add(userId);
}

/** Test helper: forget cached profiles (e.g. after truncating tables). */
export function resetProfileCache(): void {
  knownProfiles.clear();
}

export async function getProfile(userId: string): Promise<ProfileDto> {
  const profile = await prisma.profile.findUniqueOrThrow({
    where: { id: userId },
    select: { id: true, activeVehicleId: true },
  });
  return profile;
}

export async function setActiveVehicle(userId: string, vehicleId: string): Promise<ProfileDto> {
  const owned = await prisma.vehicle.findFirst({
    where: { id: vehicleId, userId },
    select: { id: true },
  });
  if (owned === null) throw notFound();
  return prisma.profile.update({
    where: { id: userId },
    data: { activeVehicleId: vehicleId },
    select: { id: true, activeVehicleId: true },
  });
}
