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
  common: {
    back: 'Volver',
    cancel: 'Cancelar',
    close: 'Cerrar',
    loadError: 'No pudimos cargar tus datos. Revisa tu conexión e inténtalo de nuevo.',
    retry: 'Reintentar',
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
