import { describe, expect, it } from 'vitest';
import {
  buildPushPayload,
  cycleSignature,
  decideMaintenanceNotices,
  decideMileageNotice,
  type DigestNotice,
  type DigestVehicle,
  nextDigestAt,
  type NoticeEstimate,
  type NoticeState,
  selectEmailNotices,
  zonedTimeToUtc,
} from '../src/reminders';

const d = (iso: string) => new Date(iso);

describe('schedule (FR-001, FR-019)', () => {
  it('returns today 09:00 local if still ahead, else tomorrow (Mexico City, UTC−6)', () => {
    expect(nextDigestAt('America/Mexico_City', d('2026-10-22T14:00:00Z')).toISOString()).toBe('2026-10-22T15:00:00.000Z');
    expect(nextDigestAt('America/Mexico_City', d('2026-10-22T15:00:00Z')).toISOString()).toBe('2026-10-23T15:00:00.000Z');
  });

  it('handles the DST change in Madrid (CEST → CET on 2026-10-25)', () => {
    expect(nextDigestAt('Europe/Madrid', d('2026-10-24T08:00:00Z')).toISOString()).toBe('2026-10-25T08:00:00.000Z');
    expect(nextDigestAt('Europe/Madrid', d('2026-10-25T08:00:00Z')).toISOString()).toBe('2026-10-26T08:00:00.000Z');
    expect(zonedTimeToUtc('2026-07-01', 9, 'Europe/Madrid').toISOString()).toBe('2026-07-01T07:00:00.000Z');
  });
});

const estimate = (overrides: Partial<NoticeEstimate> = {}): NoticeEstimate => ({
  typeCode: 'OIL_CHANGE',
  baselineSource: 'VEHICLE_REGISTRATION',
  baselineKm: 45_000,
  baselineAt: '2026-01-01T12:00:00Z',
  intervalKm: 10_000,
  intervalMonths: 12,
  dueKm: 55_000,
  dueByTimeAt: '2027-01-01T12:00:00Z',
  estimatedDueAt: '2026-12-20T12:00:00Z',
  ...overrides,
});
const tz = 'America/Mexico_City';

function run(states: NoticeState[], km: number, e = estimate(), snoozed = new Set<never>()) {
  return decideMaintenanceNotices({ estimates: [e], snoozedTypes: snoozed, states, currentOdometerKm: km, today: '2026-10-22', timeZone: tz });
}

describe('decideMaintenanceNotices (FR-002..FR-004, R7)', () => {
  it('notifies upcoming once, then overdue once, never repeating', () => {
    const first = run([], 54_500);
    expect(first.notices.map((n) => n.kind)).toEqual(['MAINTENANCE_UPCOMING']);
    expect(run(first.nextStates, 54_600).notices).toEqual([]);
    const overdue = run(first.nextStates, 55_500);
    expect(overdue.notices).toMatchObject([{ kind: 'MAINTENANCE_OVERDUE', remainingKm: -500 }]);
    expect(run(overdue.nextStates, 56_000).notices).toEqual([]);
  });

  it('sends overdue even if upcoming was never notified', () => {
    expect(run([], 56_000).notices.map((n) => n.kind)).toEqual(['MAINTENANCE_OVERDUE']);
  });

  it('a transient "Al día" with the same signature does not restart the cycle', () => {
    const first = run([], 54_500);
    const backToOk = run(first.nextStates, 50_000, estimate({ dueKm: 60_000 }));
    expect(backToOk.notices).toEqual([]);
    expect(run(backToOk.nextStates, 54_500).notices).toEqual([]);
  });

  it('restarts the cycle on a new service, prior history or interval change', () => {
    const notified = run([], 55_500).nextStates;
    const afterService = estimate({ baselineSource: 'SERVICE', baselineKm: 55_500, baselineAt: '2026-10-21T12:00:00Z', dueKm: 65_500 });
    const reset = run(notified, 65_000, afterService);
    expect(reset.notices.map((n) => n.kind)).toEqual(['MAINTENANCE_UPCOMING']);
    expect(cycleSignature(afterService)).not.toBe(cycleSignature(estimate()));
    expect(cycleSignature(estimate({ intervalKm: 15_000 }))).not.toBe(cycleSignature(estimate()));
  });

  it('skips snoozed maintenance without consuming the notice', () => {
    const snoozed = run([], 56_000, estimate(), new Set(['OIL_CHANGE'] as never[]));
    expect(snoozed.notices).toEqual([]);
    expect(run(snoozed.nextStates, 56_000).notices.map((n) => n.kind)).toEqual(['MAINTENANCE_OVERDUE']);
  });

  it('reports overdue days for time-only items', () => {
    const r = run([], 0, estimate({ typeCode: 'BRAKE_FLUID', intervalKm: null, dueKm: null, dueByTimeAt: '2026-10-19T12:00:00Z', estimatedDueAt: '2026-10-19T12:00:00Z' }));
    expect(r.notices).toMatchObject([{ kind: 'MAINTENANCE_OVERDUE', overdueDays: 3, remainingKm: null }]);
  });
});

describe('decideMileageNotice (FR-005)', () => {
  const base = { today: '2026-10-22', timeZone: tz };
  it('reminds after 30 days without readings, not again within 30 days', () => {
    expect(decideMileageNotice({ ...base, lastReadingAt: d('2026-10-01T12:00:00Z'), lastKmReminderAt: null })).toBeNull();
    expect(decideMileageNotice({ ...base, lastReadingAt: d('2026-09-22T12:00:00Z'), lastKmReminderAt: null })).toMatchObject({ kind: 'MILEAGE_UPDATE', cycleKey: '2026-10-22' });
    expect(decideMileageNotice({ ...base, lastReadingAt: d('2026-08-01T12:00:00Z'), lastKmReminderAt: d('2026-10-01T15:00:00Z') })).toBeNull();
    expect(decideMileageNotice({ ...base, lastReadingAt: d('2026-08-01T12:00:00Z'), lastKmReminderAt: d('2026-09-20T15:00:00Z') })).not.toBeNull();
  });
});

const vehicles = new Map<string, DigestVehicle>([
  ['v1', { id: 'v1', make: 'Toyota', model: 'Corolla', nickname: null, emailReminders: true }],
  ['v2', { id: 'v2', make: 'Mazda', model: '3', nickname: 'El rojo', emailReminders: false }],
]);
const notice = (overrides: Partial<DigestNotice>): DigestNotice => ({
  id: 'n', vehicleId: 'v1', kind: 'MAINTENANCE_UPCOMING', typeCode: 'OIL_CHANGE', remainingKm: 500, overdueDays: null, estimatedDueAt: null, ...overrides,
});

describe('buildPushPayload (FR-010a, contracts/notifications.md)', () => {
  it('shows the most urgent notice with the vehicle name and counts the rest', () => {
    const p = buildPushPayload(
      [notice({ id: 'a' }), notice({ id: 'b', kind: 'MAINTENANCE_OVERDUE', remainingKm: -500 }), notice({ id: 'c', vehicleId: 'v2', kind: 'MILEAGE_UPDATE', typeCode: null, remainingKm: null })],
      vehicles,
      '2026-10-22',
      tz,
    );
    expect(p).toEqual({
      title: 'Car Checkup',
      body: 'Toyota Corolla: cambio de aceite y filtro vencido, te pasaste 500 km. Y 2 avisos más.',
      url: '/',
      tag: 'digest-2026-10-22',
    });
  });

  it('links a single mileage notice to the capture and uses the nickname', () => {
    const p = buildPushPayload([notice({ vehicleId: 'v2', kind: 'MILEAGE_UPDATE', typeCode: null, remainingKm: null })], vehicles, '2026-10-22', tz);
    expect(p?.body).toBe('¿Cuánto marca hoy tu El rojo? Actualízalo para afinar tus recomendaciones.');
    expect(p?.url).toBe('/?capture=v2');
  });

  it('links notices of a single vehicle to its maintenance page', () => {
    const p = buildPushPayload([notice({ remainingKm: 1000 })], vehicles, '2026-10-22', tz);
    expect(p).toMatchObject({ body: 'Toyota Corolla: cambio de aceite y filtro próximo, faltan 1.000 km.', url: '/vehicles/v1/maintenance' });
  });
});

describe('selectEmailNotices (FR-009, FR-010)', () => {
  it('keeps only email-enabled vehicles and caps at 10', () => {
    const many = Array.from({ length: 12 }, (_, i) => notice({ id: String(i) }));
    const r = selectEmailNotices([...many, notice({ id: 'x', vehicleId: 'v2' })], vehicles);
    expect(r.shown).toHaveLength(10);
    expect(r.hiddenCount).toBe(2);
    expect(r.groups.map((g) => g.vehicle.id)).toEqual(['v1']);
  });
});
