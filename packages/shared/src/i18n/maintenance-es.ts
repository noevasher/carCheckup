import type { MaintenanceTypeCode } from '../generated/prisma/enums';

/** Plain-language maintenance names (Principle V), shared by the PWA, push and email. */
export const MAINTENANCE_NAMES_ES: Readonly<Record<MaintenanceTypeCode, string>> = {
  OIL_CHANGE: 'Cambio de aceite y filtro',
  ENGINE_AIR_FILTER: 'Filtro de aire del motor',
  CABIN_AIR_FILTER: 'Filtro de aire de cabina',
  TIRE_ROTATION: 'Rotación de llantas',
  ALIGNMENT_BALANCING: 'Alineación y balanceo',
  TIRE_REPLACEMENT: 'Cambio de llantas',
  BRAKE_INSPECTION: 'Revisión de frenos',
  BRAKE_FLUID: 'Cambio de líquido de frenos',
  COOLANT: 'Cambio de anticongelante',
  SPARK_PLUGS: 'Cambio de bujías',
  TIMING_BELT: 'Banda de distribución',
  TRANSMISSION_FLUID: 'Aceite de transmisión',
  BATTERY_CHECK: 'Revisión de batería',
};

/** Why each maintenance matters, in plain language (FR-008 of 002, FR-011 of 003). */
export const MAINTENANCE_WHY_ES: Readonly<Record<MaintenanceTypeCode, string>> = {
  OIL_CHANGE: 'El aceite protege el motor del desgaste. Con el uso pierde sus propiedades y el filtro se satura.',
  ENGINE_AIR_FILTER: 'Evita que entre polvo al motor. Sucio, el coche gasta más combustible y pierde fuerza.',
  CABIN_AIR_FILTER: 'Limpia el aire que respiras dentro del coche y ayuda a que el aire acondicionado funcione bien.',
  TIRE_ROTATION: 'Cambiar las llantas de posición hace que se gasten parejo y duren más.',
  ALIGNMENT_BALANCING: 'Mantiene el coche recto y sin vibraciones; evita que las llantas se gasten de un lado.',
  TIRE_REPLACEMENT: 'Las llantas gastadas o viejas agarran menos el piso, sobre todo con lluvia.',
  BRAKE_INSPECTION: 'Revisar balatas (pastillas) y discos a tiempo evita frenadas largas y reparaciones caras.',
  BRAKE_FLUID: 'El líquido de frenos absorbe humedad con el tiempo y frena peor aunque no uses mucho el coche.',
  COOLANT: 'El anticongelante evita que el motor se sobrecaliente o se congele y protege contra la corrosión.',
  SPARK_PLUGS: 'Las bujías encienden el combustible. Gastadas, el motor arranca mal y consume más.',
  TIMING_BELT:
    'Sincroniza las piezas internas del motor; si se rompe, la reparación es muy cara. Algunos motores usan cadena en lugar de banda: si es tu caso, puedes desactivar este mantenimiento.',
  TRANSMISSION_FLUID: 'Lubrica la caja de cambios para que los cambios entren suaves y no se desgaste.',
  BATTERY_CHECK: 'Una revisión anual evita quedarte sin arranque, sobre todo en frío o calor extremos.',
};
