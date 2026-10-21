# Research: Motor de Estimación de Mantenimiento

**Feature**: `002-maintenance-estimation` | **Date**: 2026-10-20

Resuelve los puntos abiertos del Technical Context de [plan.md](./plan.md). El stack lo fija la
constitución y ya está implementado en `001-vehicles-mileage` (monorepo `backend`, `frontend`,
`packages/shared`; Express 5, Prisma 7, React 19, TanStack Query, IndexedDB).

## R1. Dónde vive el cálculo

- **Decision**: El motor es una función pura `estimateMaintenance(input, now)` en
  `packages/shared/src/maintenance/`. Recibe el catálogo, las configuraciones del vehículo, sus
  servicios y sus lecturas válidas, y devuelve una estimación por mantenimiento (incluidos todos
  los datos de la explicación). El backend la ejecuta y persiste el resultado; el frontend solo
  presenta (y reutiliza los helpers de estado para la caché offline).
- **Rationale**: Testeable sin base de datos (los criterios de la spec son reglas numéricas),
  un único lugar para las reglas (FR-004..FR-006, FR-015, FR-017) y tipos compartidos
  (Principio II).
- **Alternatives considered**: Calcular en SQL (difícil de explicar y probar); calcular solo en
  el cliente (el futuro cron de recordatorios no tendría los datos).

## R2. Estimaciones persistidas vs. calculadas al vuelo

- **Decision**: Se persiste una fila `maintenance_estimates` por (vehículo, mantenimiento) con
  los valores que **no dependen de "hoy"**: km objetivo, fecha límite por tiempo, fecha estimada
  por km (anclada a la fecha de la última lectura), fecha estimada final (la menor), ritmo y su
  origen, línea base, intervalo aplicado y su origen. El **estado** (Vencido / Próximo / Al día)
  y los km/días restantes se derivan al leer, comparando con el km actual y la fecha actual.
  Se recalcula dentro de la misma transacción de cualquier cambio que lo afecte (FR-019):
  lecturas (create/update/delete de 001), edición del vehículo (combustible, uso), servicios,
  configuraciones.
- **Rationale**: El paso de los días no exige recalcular nada (el estado se deriva); el futuro
  cron masivo de recordatorios podrá consultar `estimated_due_at` indexado sin ejecutar el motor
  (Principio III: índice por "fecha de próximo mantenimiento"). Recalcular 13 mantenimientos es
  barato (< 1 ms) y ocurre solo en escrituras.
- **Alternatives considered**: Solo al vuelo (el cron tendría que ejecutar el motor para cada
  vehículo); recálculo nocturno por lotes (las estimaciones quedarían desfasadas tras cada
  lectura, contradice SC-005).

## R3. Catálogo de mantenimientos

- **Decision**: Tabla `maintenance_types` con clave natural `code` (p. ej. `OIL_CHANGE`) e
  intervalos, combustibles aplicables, si aplica con combustible desconocido, sensibilidad a uso
  severo y orden. Se siembra **en una migración** (no en el seed opcional), porque el motor no
  funciona sin él. Los textos (nombre, descripción "por qué importa", notas como la de banda vs.
  cadena) viven en el frontend (`i18n/es.ts`) indexados por `code` (Principio V; mismo patrón que
  los mensajes de error).
- **Rationale**: Cambiar un intervalo por defecto = nueva migración versionada y auditable;
  textos editables sin tocar la base de datos.
- **Alternatives considered**: Catálogo en código (no permitiría consultas del cron por SQL);
  textos en la base de datos (dos fuentes de copy en español).

## R4. Ritmo de uso (FR-005 + clarificación Q1)

- **Decision**: Sobre lecturas `OK` ordenadas por fecha:
  1. Ventana: lecturas con `readAt ≥ última lectura − 90 días`. Si hay ≥ 2 y abarcan ≥ 7 días:
     `ritmo = (km última − km primera de la ventana) / días entre ellas`, origen `READINGS`.
  2. Si no, todas las lecturas `OK`; misma condición de ≥ 2 lecturas y ≥ 7 días.
  3. Si no, promedio por uso habitual: `CITY` 30, `HIGHWAY` 60, `MIXED`/sin indicar 40 km/día,
     origen `USAGE_DEFAULT` (+ el uso usado, para la explicación).
  Un ritmo calculado de 0 km/día se mantiene (edge case "vehículo parado": sin fecha por km).
- **Rationale**: Promedio simple de extremos de ventana = fácil de explicar ("recorres unos
  35 km al día según tus últimos 3 meses"), robusto ante muchas lecturas intermedias.
- **Alternatives considered**: Regresión lineal (más precisa con datos ruidosos pero difícil de
  explicar a un usuario no experto); media móvil exponencial (idem).

## R5. Línea base de cada mantenimiento (FR-013, FR-015, FR-016)

- **Decision**: Orden de preferencia:
  1. Servicio registrado más reciente (por `performedAt`) que incluya el mantenimiento →
     origen `SERVICE`.
  2. Historial previo indicado por el usuario (si no marcó "No lo sé") → origen `PRIOR`.
     - Solo fecha: km base = km estimado en esa fecha (interpolación lineal entre lecturas
       vecinas; si la fecha es anterior a la primera lectura, extrapolación hacia atrás con el
       ritmo, con mínimo 0).
     - Solo km: fecha base = fecha estimada en que el vehículo tenía ese km (mismo método
       inverso; si el km es menor que el de la primera lectura, extrapolación con el ritmo).
  3. Registro del vehículo en la app (lectura `INITIAL`) → origen `VEHICLE_REGISTRATION`.
- **Rationale**: Cumple la clarificación Q1 (opción A) y permite datos aproximados (US3-3).

## R6. Intervalo aplicado (FR-017, FR-018, clarificación Q2)

- **Decision**: Personalizado del usuario (origen `CUSTOM`, nunca se ajusta) → si no, el del
  catálogo; si el mantenimiento es sensible a uso severo y el vehículo tiene uso `CITY`, el
  intervalo en km se multiplica por 0,8 y se redondea a la centena (origen `CITY_ADJUSTED`,
  p. ej. 10.000 → 8.000); si no, origen `DEFAULT`. El intervalo en meses no se ajusta.

## R7. Fechas y estado (FR-004, FR-006)

- **Decision**:
  - `dueKm = baseKm + intervalKm` (si hay intervalo en km).
  - `dueByTimeAt = baseDate + intervalMonths` (si hay intervalo en meses).
  - `estimatedByKmAt = lastReadingAt + (dueKm − currentKm) / ritmo` días (sin valor si ritmo 0;
    si `dueKm ≤ currentKm`, la fecha en que se cruzó, estimada hacia atrás).
  - `estimatedDueAt = min(dueByTimeAt, estimatedByKmAt)`; `limitingFactor` = cuál ganó.
  - Al leer: **Vencido** si `currentKm ≥ dueKm` o `hoy ≥ dueByTimeAt`; **Próximo** si
    `dueKm − currentKm ≤ 1.000` o `estimatedDueAt − hoy ≤ 30 días`; si no, **Al día**.
  - "Hoy" se calcula en la zona horaria del usuario: el cliente envía la cabecera
    `X-Timezone` (nombre IANA de `Intl.DateTimeFormat().resolvedOptions().timeZone`); el
    backend la valida (lista de `Intl.supportedValuesOf('timeZone')`) y usa UTC si falta o es
    inválida.
  - Las fechas se manejan como fechas de calendario en la zona horaria del usuario para mostrar
    ("15 mar 2027"); se almacenan como instantes UTC a mediodía local para evitar saltos de día.
- **Rationale**: Reglas literales de la spec; todos los valores necesarios para la explicación
  (FR-008) quedan disponibles.

## R8. Registro de servicios (FR-010..FR-014, FR-012a, clarificación Q1 de /speckit-clarify)

- **Decision**:
  - `POST /services` con `id` generado en el cliente (idempotente como las lecturas, R5 de 001),
    `performedAt` (fecha), `odometerKm`, `typeCodes[]` (≥ 1), `notes` (≤ 500) y
    `confirmedUnusual`.
  - Validación con las reglas compartidas de 001 (`findNeighbors`/`checkOrder`/`isUnusual`)
    contra las lecturas `OK` en la fecha del servicio.
  - Si `odometerKm > currentOdometerKm` y la fecha del servicio es ≥ la de la última lectura, se
    crea en la misma transacción una `MileageReading` con `source = SERVICE` (nuevo valor del
    enum) y el servicio guarda `readingId`. Editar o borrar el servicio actualiza o borra esa
    lectura si sigue siendo la generada por él.
  - Registrar un servicio que incluye un mantenimiento pospuesto anula el aplazamiento.
- **Rationale**: Sin pasos extra para el caso habitual de ir al taller sin actualizar el km
  (Principio I).

## R9. Posponer y marcas del selector (FR-007a, FR-007b)

- **Decision**: `snoozedUntil = hoy + 7 días` en la configuración por vehículo; cambiar intervalo,
  desactivar o registrar el servicio lo pone a `null`. `GET /vehicles` añade a cada vehículo un
  resumen `maintenance: { overdueCount, upcomingCount }` calculado con una única consulta
  agregada sobre `maintenance_estimates` + configuraciones (sin N+1), excluyendo pospuestos y
  desactivados.

## R10. Visualización offline (spec: "consultar las últimas estimaciones funciona sin conexión")

- **Decision**: Persistir en IndexedDB la caché de TanStack Query de las consultas `vehicles` y
  `maintenance` con `@tanstack/react-query-persist-client` + `@tanstack/query-async-storage-persister`
  (almacenamiento `idb-keyval`, máx. 7 días). Al leer desde caché offline, el estado se vuelve a
  derivar con la fecha actual usando el helper compartido de R7.
- **Rationale**: Hoy (feature 001) la pantalla principal no carga tras recargar sin conexión;
  esta persistencia lo corrige también para vehículos y kilometraje.
- **Alternatives considered**: Guardar a mano en IndexedDB (duplica lógica de caché).

## R11. Textos y explicación (FR-008, FR-020)

- **Decision**: El API devuelve datos estructurados de la explicación (códigos y números); el
  frontend compone las frases ("Toca cada 8.000 km porque usas el coche en ciudad (normalmente
  10.000 km). La última vez fue al registrar el vehículo, con 45.000 km. Recorres unos 35 km al
  día según tus últimos 3 meses, así que llegarás a 53.000 km hacia el 12 mar 2027.").
- **Rationale**: Copy en un solo sitio, testeable con unit tests de formato.

## R12. Testing

- **Decision**: Unit tests exhaustivos del motor en `packages/shared` (tabla de casos por regla);
  integración del API (recalculo en cada disparador, idempotencia de servicios, creación de
  lectura, propiedad); e2e con Playwright para alertas, "Ya lo hice" en 2 toques, posponer,
  marcas del selector y "Todo al día", reutilizando el emulador de auth de 001.
