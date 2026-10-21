import type { ApiErrorCode, ValidRange } from '@car-checkup/shared/errors';
import { formatKm } from '../lib/format';

/** UI copy (Constitution, Principle V: plain, non-technical language). */
export const t = {
  appName: 'Car Checkup',
  signOut: 'Salir',
  login: {
    title: 'Entra a Car Checkup',
    subtitle: 'Te enviaremos un enlace a tu correo para entrar, sin contraseñas.',
    email: 'Correo electrónico',
    submit: 'Enviarme el enlace',
    sent: (email: string) => `Listo. Abre el enlace que enviamos a ${email} desde este teléfono.`,
    invalidEmail: 'Escribe un correo válido, por ejemplo nombre@correo.com.',
  },
  vehicle: {
    newTitle: 'Agrega tu vehículo',
    newSubtitle: 'Solo necesitamos 4 datos para empezar.',
    editTitle: 'Editar vehículo',
    make: 'Marca',
    makePlaceholder: 'Ej. Toyota',
    model: 'Modelo',
    modelPlaceholder: 'Ej. Corolla',
    year: 'Año',
    km: 'Kilometraje actual',
    kmHint: 'Lo que marca el tablero (odómetro).',
    more: 'Más datos (opcional)',
    nickname: 'Apodo',
    nicknameHint: 'Para reconocerlo rápido, ej. "El rojo".',
    plate: 'Matrícula / placa',
    fuel: 'Combustible',
    usage: 'Uso habitual',
    notSet: 'Sin indicar',
    save: 'Guardar vehículo',
    saveChanges: 'Guardar cambios',
    deleteTitle: '¿Eliminar este vehículo?',
    deleteBody: 'También se borrará todo su historial de kilometraje. No se puede deshacer.',
    delete: 'Eliminar vehículo',
    deleteConfirm: 'Sí, eliminar',
    offline: 'Sin conexión: guardaremos tu vehículo cuando vuelvas a tener señal.',
    retry: 'Reintentar',
    add: 'Añadir vehículo',
    badgeOverdue: (n: number) => (n === 1 ? '1 mantenimiento vencido' : `${String(n)} mantenimientos vencidos`),
    badgeUpcoming: (n: number) => (n === 1 ? '1 mantenimiento próximo' : `${String(n)} mantenimientos próximos`),
    uncatalogued: 'No está en nuestra lista; lo guardaremos tal cual lo escribiste.',
  },
  fuelType: { GASOLINE: 'Gasolina', DIESEL: 'Diésel', HYBRID: 'Híbrido', ELECTRIC: 'Eléctrico' },
  usageType: { CITY: 'Ciudad', HIGHWAY: 'Carretera', MIXED: 'Mixto' },
  home: {
    lastReading: (when: string) => `Última lectura: ${when}`,
    updateKm: 'Actualizar km',
    history: 'Historial',
    edit: 'Editar',
    pendingSync: 'Pendiente de enviar',
    pendingSyncHint: 'Guardado en este teléfono. Se enviará solo cuando haya conexión.',
    review: (n: number) =>
      n === 1 ? 'Hay 1 lectura que no cuadra con las demás. Revísala.' : `Hay ${String(n)} lecturas que no cuadran con las demás. Revísalas.`,
    reviewAction: 'Revisar',
    switcher: 'Tus vehículos',
  },
  capture: {
    title: 'Actualizar kilometraje',
    km: 'Kilometraje actual',
    reference: (km: string, when: string) => `Último registrado: ${km} (${when})`,
    save: 'Guardar',
    changeDate: 'Fue otro día',
    date: 'Fecha de la lectura',
    today: 'Usar hoy',
    savedOffline: 'Guardado en el teléfono. Se enviará cuando haya conexión.',
    saved: 'Kilometraje actualizado.',
    savedNeedsReview: 'Guardado, pero no cuadra con otras lecturas. Revísalo en el historial.',
    unusualTitle: '¿Seguro que es correcto?',
    unusualBody: (km: string, days: string) =>
      `Son ${km} recorridos en ${days}. Es mucho más de lo habitual; revisa que no sobre ningún número.`,
    unusualConfirm: 'Sí, es correcto',
    unusualCancel: 'Corregir',
    correctLast: 'Corregir la última lectura',
    correctingLast: (km: string) => `Estás corrigiendo la última lectura (${km}).`,
    correctSave: 'Guardar corrección',
  },
  history: {
    title: 'Historial de kilometraje',
    empty: 'Aún no hay lecturas.',
    pending: 'Pendiente',
    needsReview: 'No cuadra',
    needsReviewHint: 'Esta lectura no encaja con las anteriores o posteriores. Corrige el valor o la fecha, o elimínala.',
    initial: 'Al registrar el vehículo',
    loadMore: 'Ver más',
    onlyReview: 'Solo las que no cuadran',
    all: 'Ver todas',
    editTitle: 'Corregir lectura',
    save: 'Guardar',
    delete: 'Eliminar lectura',
    deleteTitle: '¿Eliminar esta lectura?',
    deleteBody: 'Se recalculará el kilometraje actual del vehículo.',
    deleteConfirm: 'Sí, eliminar',
  },
  maintenance: {
    title: 'Mantenimientos',
    allTitle: 'Todos los mantenimientos',
    seeAll: 'Ver todos los mantenimientos',
    allGood: 'Todo al día',
    next: (name: string, when: string) => `Lo próximo: ${name}, ${when}.`,
    status: { OVERDUE: 'Vencido', UPCOMING: 'Próximo', OK: 'Al día' },
    kmLeft: (km: string) => `Faltan ${km}`,
    kmOver: (km: string) => `Te pasaste ${km}`,
    daysLeft: (days: string) => `Vence en ${days}`,
    daysOver: (days: string) => `Venció hace ${days}`,
    around: (date: string) => `hacia el ${date}`,
    wasDue: (date: string) => `Tocaba hacia el ${date}`,
    addOther: 'Añadir otro mantenimiento de la misma visita',
    noDate: 'Sin fecha estimada: depende de cuánto uses el vehículo',
    why: '¿Por qué?',
    done: 'Ya lo hice',
    snooze: 'Recuérdamelo en una semana',
    snoozeShort: 'Posponer 1 semana',
    snoozedUntil: (date: string) => `Pospuesto hasta el ${date}`,
    askHistory: 'Indicar cuándo se hizo',
    adjust: 'Ajustar',
    disabledTitle: 'Desactivados',
    enable: 'Reactivar',
    services: 'Historial de servicios',
    disclaimer: 'Intervalos generales para turismos. Si tu manual o tu taller indican otros, puedes ajustarlos.',
    names: {
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
    },
    whyText: {
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
    },
    explain: {
      interval: {
        DEFAULT: (every: string) => `Se recomienda cada ${every}.`,
        CITY_ADJUSTED: (every: string, normal: string) =>
          `Se recomienda cada ${every} porque usas el coche en ciudad (normalmente ${normal}).`,
        CUSTOM: (every: string) => `Lo tienes configurado cada ${every} (intervalo personalizado).`,
      },
      baseline: {
        SERVICE: (km: string, date: string) => `La última vez lo registraste el ${date}, con ${km}.`,
        PRIOR: (km: string, date: string) => `Nos dijiste que la última vez fue hacia el ${date}, con unos ${km}.`,
        VEHICLE_REGISTRATION: (km: string, date: string) =>
          `Lo calculamos desde que registraste el vehículo (${date}, ${km}). Indica cuándo se hizo para afinarlo.`,
      },
      current: (km: string) => `Ahora tiene ${km}.`,
      paceReadings: (km: string, days: string) => `Recorres unos ${km} al día según tus lecturas de los últimos ${days}.`,
      paceUsage: (km: string, usage: string) => `Estimamos unos ${km} al día por tu uso en ${usage}; se ajustará cuando registres más kilometraje.`,
      paceUnknown: (km: string) => `Estimamos unos ${km} al día; se ajustará cuando registres más kilometraje.`,
      parked: 'El vehículo no se ha movido según tus lecturas; la fecha dependerá de cuándo vuelvas a usarlo.',
      dueKm: (km: string, date: string) => `Llegarás a ${km} hacia el ${date}.`,
      limitTime: (date: string) => `Por tiempo, toca a más tardar el ${date}, y eso llega antes que el kilometraje.`,
      limitKm: 'El kilometraje llegará antes que el plazo por tiempo.',
      usage: { CITY: 'ciudad', HIGHWAY: 'carretera', MIXED: 'mixto' },
    },
    record: {
      title: 'Registrar servicio',
      editTitle: 'Corregir servicio',
      date: 'Fecha del servicio',
      today: 'Hoy',
      otherDay: 'Fue otro día',
      km: 'Kilometraje en el taller',
      kmHint: 'Si es mayor que el último que registraste, lo guardamos también como lectura.',
      notes: 'Notas (opcional)',
      save: 'Guardar',
      saved: 'Servicio registrado.',
      offline: 'Sin conexión: guardaremos el servicio cuando vuelvas a tener señal.',
      retry: 'Reintentar',
      delete: 'Eliminar servicio',
      deleteTitle: '¿Eliminar este servicio?',
      deleteBody: 'Los mantenimientos volverán a calcularse sin él.',
    },
    servicesPage: {
      title: 'Historial de servicios',
      empty: 'Aún no has registrado servicios.',
      createdReading: 'También se guardó como lectura de kilometraje',
    },
    prior: {
      title: '¿Cuándo se hizo por última vez?',
      intro: 'Si lo recuerdas aunque sea aproximado, las recomendaciones serán más precisas.',
      month: 'Mes y año aproximados',
      km: 'Kilometraje aproximado (opcional)',
      save: 'Guardar',
      unknown: 'No lo sé',
      needOne: 'Indica al menos el mes o el kilometraje.',
    },
    settings: {
      title: (name: string) => `Ajustar: ${name}`,
      km: 'Cada cuántos km',
      months: 'Cada cuántos meses',
      recommended: (km: string, months: string) => `Recomendado: ${km} / ${months}.`,
      save: 'Guardar',
      reset: 'Volver al recomendado',
      disable: 'No aplica a mi vehículo',
      kmRange: 'Entre 500 y 300.000 km.',
      monthsRange: 'Entre 1 y 120 meses.',
    },
    readingSourceService: 'Al registrar un servicio',
  },
  common: {
    back: 'Volver',
    cancel: 'Cancelar',
    close: 'Cerrar',
    loadError: 'No pudimos cargar tus datos. Revisa tu conexión e inténtalo de nuevo.',
    retry: 'Reintentar',
    signInAgain: 'Volver a entrar',
  },
} as const;

const plural = (n: number, one: string, many: string) => `${String(n)} ${n === 1 ? one : many}`;
export const daysLabel = (days: number) => plural(Math.max(1, Math.round(days)), 'día', 'días');

/** Message for an API error code (FR-015). */
export function messageForError(code: ApiErrorCode | 'NETWORK' | undefined, validRange?: ValidRange): string {
  switch (code) {
    case 'NETWORK':
      return 'No hay conexión. Inténtalo de nuevo cuando tengas señal.';
    case 'UNAUTHORIZED':
      return 'Tu sesión terminó. Vuelve a entrar.';
    case 'NOT_FOUND':
      return 'Ese vehículo o lectura ya no existe.';
    case 'READING_OUT_OF_ORDER':
      return validRange !== undefined ? outOfOrderMessage(validRange) : 'El kilometraje no cuadra con tus otras lecturas.';
    case 'UNUSUAL_DISTANCE':
      return 'Es una distancia muy grande para tan poco tiempo. Confírmala o corrígela.';
    case 'LAST_READING_UNDELETABLE':
      return 'Es la única lectura del vehículo: puedes corregirla, pero no eliminarla.';
    case 'ID_CONFLICT':
      return 'Hubo un conflicto al guardar. Vuelve a intentarlo.';
    case 'RATE_LIMITED':
      return 'Demasiados intentos seguidos. Espera un minuto.';
    case 'VALIDATION_ERROR':
      return 'Revisa los datos marcados.';
    case 'INTERNAL':
    case undefined:
      return 'Algo salió mal de nuestro lado. Inténtalo de nuevo en un momento.';
  }
}

export function outOfOrderMessage({ minKm, maxKm }: ValidRange): string {
  if (maxKm === null) {
    return `El kilometraje no puede ser menor que el anterior (${formatKm(minKm)}).`;
  }
  return `Para esa fecha, el kilometraje debe estar entre ${formatKm(minKm)} y ${formatKm(maxKm)}.`;
}

/** Message for a field validation code returned by the API or the shared schemas. */
export function fieldMessage(field: string, code: string): string {
  const messages: Record<string, Record<string, string> | undefined> = {
    make: { too_small: 'Escribe la marca.', too_big: 'La marca es demasiado larga (máx. 60).' },
    model: { too_small: 'Escribe el modelo.', too_big: 'El modelo es demasiado largo (máx. 60).' },
    year: {
      too_small: 'El año debe ser 1950 o posterior.',
      too_big: 'El año no puede ser posterior al próximo año.',
      invalid_type: 'Escribe el año con 4 números, ej. 2019.',
    },
    odometerKm: {
      too_small: 'El kilometraje no puede ser negativo.',
      too_big: 'Ese kilometraje es demasiado alto. Revisa que no sobre ningún número.',
      invalid_type: 'Escribe solo números, ej. 45.350.',
    },
    nickname: { too_big: 'El apodo es demasiado largo (máx. 40).' },
    licensePlate: { too_big: 'La matrícula es demasiado larga (máx. 15).' },
    readAt: { future: 'La fecha no puede ser futura.' },
  };
  return messages[field]?.[code] ?? 'Revisa este dato.';
}
