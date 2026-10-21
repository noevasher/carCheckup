import type { MaintenanceItemDto, PaceDto } from '@car-checkup/shared/dto';
import { describe, expect, it } from 'vitest';
import { describeInterval, explain } from '../../src/features/maintenance/explain';
import { monthToDate } from '../../src/lib/format';

const item = (overrides: Partial<MaintenanceItemDto> = {}): MaintenanceItemDto => ({
  typeCode: 'OIL_CHANGE',
  sortOrder: 10,
  enabled: true,
  status: 'OK',
  snoozedUntil: null,
  snoozed: false,
  askHistory: true,
  interval: { km: 8000, months: 12, source: 'CITY_ADJUSTED', defaultKm: 10_000, defaultMonths: 12 },
  baseline: { source: 'VEHICLE_REGISTRATION', km: 45_000, at: '2026-10-20T18:00:00Z' },
  dueKm: 53_000,
  remainingKm: 8000,
  dueByTimeAt: '2027-10-20T18:00:00Z',
  estimatedDueAt: '2027-07-13T18:00:00Z',
  limitingFactor: 'KM',
  ...overrides,
});
const usagePace: PaceDto = { kmPerDay: 30, source: 'USAGE_DEFAULT', usageType: 'CITY', windowDays: null };

describe('describeInterval', () => {
  it('formats km, months and years', () => {
    expect(describeInterval(10_000, 12)).toBe('10.000 km o 1 año (lo que ocurra primero)');
    expect(describeInterval(null, 24)).toBe('2 años');
    expect(describeInterval(8000, null)).toBe('8.000 km');
    expect(describeInterval(null, 18)).toBe('18 meses');
  });
});

describe('explain (FR-008)', () => {
  it('explains a city-adjusted interval from registration with a usage-based pace', () => {
    expect(explain(item(), usagePace, 45_000)).toEqual([
      'Se recomienda cada 8.000 km o 1 año (lo que ocurra primero) porque usas el coche en ciudad (normalmente 10.000 km o 1 año (lo que ocurra primero)).',
      'Lo calculamos desde que registraste el vehículo (20 oct 2026, 45.000 km). Indica cuándo se hizo para afinarlo.',
      'Ahora tiene 45.000 km.',
      'Estimamos unos 30 km al día por tu uso en ciudad; se ajustará cuando registres más kilometraje.',
      'Llegarás a 53.000 km hacia el 13 jul 2027.',
      'El kilometraje llegará antes que el plazo por tiempo.',
    ]);
  });

  it('explains a time limit, a service baseline and a reading-based pace', () => {
    const lines = explain(
      item({ interval: { km: 15_000, months: 12, source: 'CUSTOM', defaultKm: 10_000, defaultMonths: 12 }, baseline: { source: 'SERVICE', km: 50_000, at: '2026-05-01T12:00:00Z' }, limitingFactor: 'TIME', dueByTimeAt: '2027-05-01T12:00:00Z' }),
      { kmPerDay: 35.4, source: 'READINGS', usageType: null, windowDays: 90 },
      52_000,
    );
    expect(lines).toContain('Lo tienes configurado cada 15.000 km o 1 año (lo que ocurra primero) (intervalo personalizado).');
    expect(lines).toContain('La última vez lo registraste el 1 may 2026, con 50.000 km.');
    expect(lines).toContain('Recorres unos 35 km al día según tus lecturas de los últimos 90 días.');
    expect(lines).toContain('Por tiempo, toca a más tardar el 1 may 2027, y eso llega antes que el kilometraje.');
  });

  it('explains a parked vehicle', () => {
    const lines = explain(item({ estimatedDueAt: null, limitingFactor: null }), { kmPerDay: 0, source: 'READINGS', usageType: null, windowDays: 30 }, 45_000);
    expect(lines).toContain('El vehículo no se ha movido según tus lecturas; la fecha dependerá de cuándo vuelvas a usarlo.');
  });
});

describe('monthToDate (US3)', () => {
  it('uses the 15th, or today when that is in the future', () => {
    expect(monthToDate('2026-03', new Date('2026-10-20T12:00:00'))).toBe('2026-03-15');
    expect(monthToDate('2026-10', new Date('2026-10-05T12:00:00'))).toBe('2026-10-05');
  });
});
