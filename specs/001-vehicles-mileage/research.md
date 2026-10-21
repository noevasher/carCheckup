# Research: Gestión de Vehículos y Registro Rápido de Kilometraje

**Feature**: `001-vehicles-mileage` | **Date**: 2026-10-20

Cada decisión resuelve un punto abierto del Technical Context de [plan.md](./plan.md). El stack
base (React + Vite PWA, Node + Express, TypeScript, Supabase Postgres, Prisma, Supabase Auth) lo
fija la constitución y no se re-evalúa aquí.

## R1. Estructura del repositorio y tipos compartidos

- **Decision**: Monorepo con npm workspaces: `backend/`, `frontend/` y `packages/shared/`. El
  esquema Prisma vive en `backend/prisma/schema.prisma`; el cliente se genera en
  `packages/shared/src/generated/prisma`. `packages/shared` exporta los DTOs del API derivados de
  los tipos generados (`Pick`/`Omit` sobre los modelos + un tipo utilitario `Serialized<T>` que
  convierte `Date` → `string` ISO) y los esquemas Zod de entrada, anotados con
  `satisfies z.ZodType<Dto>` para que no puedan divergir. El frontend solo hace `import type`
  desde el cliente generado, por lo que no se empaqueta código de Prisma en el navegador.
- **Rationale**: Cumple el Principio II (Prisma como fuente de verdad, sin tipos duplicados a
  mano) y da validación en runtime para toda entrada externa.
- **Alternatives considered**: Generadores Prisma→Zod de terceros (añaden una dependencia de
  generación poco estable); OpenAPI → codegen de tipos (la fuente de verdad pasaría a ser el
  YAML, contradiciendo la constitución); tRPC (cambia el estilo REST obligatorio).

## R2. Verificación de autenticación en el backend

- **Decision**: El frontend usa `@supabase/supabase-js` para login y envía el access token como
  `Authorization: Bearer`. El backend verifica la firma con `jose` contra el JWKS del proyecto
  (`<SUPABASE_URL>/auth/v1/.well-known/jwks.json`, cacheado en memoria) y valida `iss`, `aud` y
  `exp`. El `sub` del token es el `userId`.
- **Rationale**: Verificación local sin llamada de red por request, compatible con las claves de
  firma asimétricas de Supabase y con un backend stateless (Principio III).
- **Alternatives considered**: `supabase.auth.getUser(token)` por request (una llamada de red
  extra por request); secreto JWT compartido HS256 (modelo heredado; obliga a distribuir el
  secreto).

## R3. Autorización y Row Level Security

- **Decision**: Toda consulta del backend se filtra por `userId` del token; los recursos de otro
  usuario responden `404` (no `403`) para no revelar su existencia. Además se habilita RLS sin
  políticas en las tablas de la app, de modo que la API de datos pública de Supabase no pueda
  leerlas con la clave anónima; el backend accede con un rol de base de datos que omite RLS.
- **Rationale**: FR-014 y defensa en profundidad: el único camino a los datos es el API.
- **Alternatives considered**: Delegar la autorización a políticas RLS con el JWT del usuario
  (exige propagar el JWT en cada conexión Prisma; complica el pooling).

## R4. Conexión a la base de datos

- **Decision**: `DATABASE_URL` apunta al pooler de Supabase en modo transacción (puerto 6543,
  `?pgbouncer=true`) para el runtime; `DIRECT_URL` apunta a la conexión directa para
  `prisma migrate`.
- **Rationale**: Permite varias instancias del backend sin agotar conexiones (Principio III).
- **Alternatives considered**: Conexión directa en runtime (límite bajo de conexiones).

## R5. Captura offline e idempotencia

- **Decision**:
  - Service worker con `vite-plugin-pwa` (Workbox) para el app shell y el manifest instalable.
  - Las lecturas se crean en el cliente con un `id` UUID generado en el dispositivo y se guardan
    primero en una cola en IndexedDB (librería `idb`). La UI muestra la lectura de inmediato
    (optimista) marcada como pendiente.
  - Un sincronizador vacía la cola en orden al arrancar la app, en el evento `online`, al volver
    la app a primer plano y con reintentos con backoff exponencial. No se depende de la
    Background Sync API porque Safari/iOS no la soporta.
  - El servidor trata `POST /readings` como idempotente por `id`: si ya existe una lectura con
    ese `id` y el mismo contenido responde `200` con ella; si es nueva, `201`.
  - Las lecturas que llegan por sincronización (`origin: "offline_sync"`) y violan el orden
    cronológico no se rechazan: se guardan con `reviewStatus = NEEDS_REVIEW` y se excluyen del
    cálculo del kilometraje actual hasta que el usuario las corrija o elimine (edge case de la
    spec). Las lecturas online que violan el orden se rechazan con `422` (FR-008).
  - El alta y edición de vehículos requieren conexión; solo la captura de lecturas es offline.
- **Rationale**: Cumple FR-010 y SC-004 (sin pérdidas ni duplicados) en todos los navegadores
  móviles objetivo.
- **Alternatives considered**: Background Sync API (sin soporte en iOS); cola en `localStorage`
  (síncrona, sin transacciones, límite bajo); IDs generados por el servidor (imposibilitan la
  deduplicación de reintentos).

## R6. Catálogo de marcas y modelos

- **Decision**: Tablas `CatalogMake` y `CatalogModel` sembradas con un seed versionado en el
  repositorio (CSV curado a partir del listado público de marcas/modelos de NHTSA vPIC, filtrado
  a turismos y SUV y ampliado con marcas habituales en Latinoamérica y España). Búsqueda por
  prefijo/subcadena insensible a mayúsculas y acentos con la extensión `pg_trgm` y la función
  `unaccent`. El vehículo guarda siempre el texto de marca/modelo y, opcionalmente, el
  `catalogModelId`.
- **Rationale**: Sin dependencia externa en runtime (fallos de terceros no bloquean el alta); el
  catálogo se puede ampliar con una migración de datos.
- **Alternatives considered**: Consultar vPIC en vivo (latencia, disponibilidad, cobertura
  centrada en EE. UU.); APIs comerciales (coste); solo texto libre (descartado en
  clarificaciones).

## R7. Kilometraje actual y rendimiento de la pantalla principal

- **Decision**: `Vehicle` guarda campos denormalizados `currentOdometerKm` y `lastReadingAt`,
  recalculados en la misma transacción que crea, edita o elimina una lectura (ignorando las
  lecturas `NEEDS_REVIEW`). La lista de vehículos se obtiene con una única consulta indexada por
  `userId`.
- **Rationale**: SC-006 (pantalla principal < 2 s con cualquier número de vehículos) y el futuro
  cron masivo de recordatorios leerá el kilometraje actual sin agregaciones (Principio III).
- **Alternatives considered**: Calcular `MAX` sobre las lecturas en cada consulta (N+1 o
  agregaciones caras a escala).

## R8. Validación de lecturas

- **Decision**:
  - Orden: el valor debe ser ≥ la lectura inmediatamente anterior (por `readAt`) y ≤ la
    inmediatamente posterior. En el error `READING_OUT_OF_ORDER` el servidor devuelve el rango
    válido `{ minKm, maxKm }` para que la UI lo explique.
  - Plausibilidad (FR-009): `(valor − anterior) / max(días transcurridos, 1) > 1500` exige
    `confirmedUnusual: true`; si no viene, responde `409 UNUSUAL_DISTANCE`. El umbral es
    configurable por variable de entorno.
  - `readAt` no puede ser futuro (tolerancia de 5 minutos por desfase de reloj del dispositivo).
  - La UI aplica las mismas reglas con los datos locales antes de enviar, para dar respuesta
    inmediata incluso offline.
- **Rationale**: Mensajes claros (FR-015) y misma lógica en cliente y servidor gracias a
  `packages/shared`.

## R9. Frontend: librerías de UI y estado

- **Decision**: React 19 + React Router; TanStack Query para el estado del servidor;
  Tailwind CSS con design tokens propios (paleta sobria, tipografía legible, objetivos táctiles
  ≥ 44 px) y primitivas accesibles de Radix UI para diálogos y selectores. El vehículo activo se
  guarda en el servidor (`Profile.activeVehicleId`) y se cachea en `localStorage` para mostrarlo
  sin esperar a la red.
- **Rationale**: Principio IV (mobile-first, diseño sobrio y amigable supervisado por UX) y
  FR-011.
- **Alternatives considered**: Librerías de componentes completas tipo MUI (estética menos
  controlable, más peso en móvil).

## R10. Testing

- **Decision**: Vitest en todos los paquetes; Supertest para tests de contrato/integración del
  API contra un Postgres local (Supabase CLI o Docker) con migraciones aplicadas; React Testing
  Library para componentes; Playwright con viewport móvil y emulación offline para los flujos
  end-to-end (alta, actualización en 2 toques, sincronización offline).
- **Rationale**: Cubre los criterios SC-002 y SC-004 de forma automatizada.

## R11. Observabilidad

- **Decision**: Logs estructurados en JSON con `pino` (request id, userId, duración, código de
  error); métricas mínimas de sincronización en el cliente (lecturas pendientes, reintentos)
  registradas en consola en desarrollo.
- **Rationale**: Punto marcado como "de bajo impacto" en la clarificación; suficiente para
  diagnosticar errores de sincronización sin infraestructura extra.
