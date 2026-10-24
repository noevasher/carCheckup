import type { ProfileDto } from '@car-checkup/shared/dto';
import { notFound } from '../../lib/http-error';
import { prisma } from '../../lib/prisma';
import { DEFAULT_TIME_ZONE, nextDigestAt } from '@car-checkup/shared/reminders';

// Per-instance cache of known profiles (email + time zone), so the database is only touched when
// something changed. Losing it (restart, other instance) only costs one extra read.
const KNOWN_PROFILES_MAX = 10_000;
const knownProfiles = new Map<string, { email: string | null; timeZone: string }>();

export interface ProfileContext {
  /** Email claim of the JWT, if any. */
  email: string | null;
  /** Valid time zone sent by the device, if any. */
  timeZone: string | null;
}

export async function ensureProfile(
  userId: string,
  context: ProfileContext = { email: null, timeZone: null },
): Promise<void> {
  const cached = knownProfiles.get(userId);
  const emailChanged = context.email !== null && cached?.email !== context.email;
  const zoneChanged = context.timeZone !== null && cached?.timeZone !== context.timeZone;
  if (cached !== undefined && !emailChanged && !zoneChanged) return;

  const timeZone = context.timeZone ?? DEFAULT_TIME_ZONE;
  // INSERT … ON CONFLICT DO NOTHING: atomic even when a new user's first requests arrive together
  // (a Prisma upsert can race and fail with a unique violation).
  await prisma.profile.createMany({
    data: [{ id: userId, email: context.email, timeZone, nextDigestAt: nextDigestAt(timeZone, new Date()) }],
    skipDuplicates: true,
  });
  const stored = await prisma.profile.findUniqueOrThrow({
    where: { id: userId },
    select: { email: true, timeZone: true },
  });
  const data: { email?: string; timeZone?: string; nextDigestAt?: Date } = {};
  if (context.email !== null && stored.email !== context.email) data.email = context.email;
  if (context.timeZone !== null && stored.timeZone !== context.timeZone) {
    // The digest time follows the device's time zone (FR-019).
    data.timeZone = context.timeZone;
    data.nextDigestAt = nextDigestAt(context.timeZone, new Date());
  }
  if (Object.keys(data).length > 0) await prisma.profile.update({ where: { id: userId }, data });

  if (knownProfiles.size >= KNOWN_PROFILES_MAX) knownProfiles.clear();
  knownProfiles.set(userId, { email: data.email ?? stored.email, timeZone: data.timeZone ?? stored.timeZone });
}

/** Test helper: forget cached profiles (e.g. after truncating tables). */
export function resetProfileCache(): void {
  knownProfiles.clear();
}

const profileSelect = { id: true, activeVehicleId: true, emailStatus: true, emailUnsubscribedAt: true } as const;

function toProfileDto(p: { id: string; activeVehicleId: string | null; emailStatus: ProfileDto['emailStatus']; emailUnsubscribedAt: Date | null }): ProfileDto {
  return {
    id: p.id,
    activeVehicleId: p.activeVehicleId,
    emailStatus: p.emailStatus,
    emailUnsubscribed: p.emailUnsubscribedAt !== null,
  };
}

export async function getProfile(userId: string): Promise<ProfileDto> {
  return toProfileDto(await prisma.profile.findUniqueOrThrow({ where: { id: userId }, select: profileSelect }));
}

export async function setActiveVehicle(userId: string, vehicleId: string): Promise<ProfileDto> {
  const owned = await prisma.vehicle.findFirst({
    where: { id: vehicleId, userId },
    select: { id: true },
  });
  if (owned === null) throw notFound();
  return toProfileDto(
    await prisma.profile.update({
      where: { id: userId },
      data: { activeVehicleId: vehicleId },
      select: profileSelect,
    }),
  );
}
