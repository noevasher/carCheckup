---

description: "Task list for 001-vehicles-mileage"
---

# Tasks: Gestión de Vehículos y Registro Rápido de Kilometraje

**Input**: Design documents from `specs/001-vehicles-mileage/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/openapi.yaml,
contracts/offline-sync.md, quickstart.md

**Tests**: La spec no pide TDD ni tests explícitos, así que no hay tareas de tests por historia.
Phase 1 deja configuradas las herramientas (Vitest, Supertest, Playwright) que usa
`quickstart.md`.

**Organization**: Tasks are grouped by user story to enable independent implementation and testing of each story.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (US1–US4 de spec.md)
- Rutas según plan.md: `backend/`, `frontend/`, `packages/shared/` (monorepo npm workspaces)

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Inicializar el monorepo y las herramientas comunes

- [X] T001 Create root `package.json` with npm workspaces `["backend", "frontend", "packages/shared"]` and scripts `dev`, `build`, `typecheck`, `lint`, `test`, `test:e2e`; add root `.gitignore` (node_modules, dist, .env, generated) and `.nvmrc` with `22`
- [X] T002 Create `tsconfig.base.json` at repo root with `"strict": true`, `"noUncheckedIndexedAccess": true`, `"noImplicitAny": true`, `"exactOptionalPropertyTypes": true`, ES2022 target and module resolution `bundler`
- [X] T003 [P] Create `eslint.config.js` (flat config, typescript-eslint strict-type-checked) with `@typescript-eslint/no-explicit-any: "error"` and `@typescript-eslint/no-unsafe-*: "error"`, plus Prettier config `.prettierrc`
- [X] T004 [P] Initialize `packages/shared/package.json` (name `@car-checkup/shared`, ESM, `exports` for `./dto`, `./schemas`, `./validation`, `./errors`) and `packages/shared/tsconfig.json` extending the base; add dependency `zod`
- [X] T005 [P] Initialize `backend/package.json` (Express 5, `@prisma/client`, `prisma`, `zod`, `jose`, `pino`, `pino-http`, `helmet`, `cors`, `dotenv`; dev: `tsx`, `vitest`, `supertest`) with scripts `dev`, `build`, `db:migrate`, `db:seed`, `test`, and `backend/tsconfig.json` extending the base
- [X] T006 [P] Initialize `frontend/` with Vite React TS template: `frontend/package.json` (React 19, `react-router`, `@tanstack/react-query`, `@supabase/supabase-js`, `idb`, `@radix-ui/react-dialog`, `@radix-ui/react-popover`, `tailwindcss`, `vite-plugin-pwa`; dev: `vitest`, `@testing-library/react`, `@playwright/test`), `frontend/tsconfig.json` extending the base, `frontend/index.html` with `lang="es"` and mobile viewport meta
- [X] T007 [P] Create `backend/.env.example` with `DATABASE_URL` (pooler port 6543 `?pgbouncer=true`), `DIRECT_URL`, `SUPABASE_URL`, `SUPABASE_JWKS_URL`, `CORS_ORIGIN`, `UNUSUAL_KM_PER_DAY=1500`, `PORT`, and `frontend/.env.example` with `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `VITE_API_URL` (no real values)
- [X] T008 [P] Configure Vitest in `backend/vitest.config.ts`, `frontend/vitest.config.ts`, `packages/shared/vitest.config.ts`, and Playwright in `frontend/playwright.config.ts` with a mobile project (viewport 390×844, `isMobile: true`)

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Esquema de datos, tipos compartidos, API base, autenticación y shell de la PWA

**⚠️ CRITICAL**: No user story work can begin until this phase is complete

### Datos y tipos compartidos

- [X] T009 Write `backend/prisma/schema.prisma` per data-model.md: generator `prisma-client` with output `../../packages/shared/src/generated/prisma`, datasource with `url = env("DATABASE_URL")` and `directUrl = env("DIRECT_URL")`; enums `FuelType {GASOLINE DIESEL HYBRID ELECTRIC}`, `UsageType {CITY HIGHWAY MIXED}`, `ReadingSource {INITIAL UPDATE}`, `ReadingOrigin {ONLINE OFFLINE_SYNC}`, `ReviewStatus {OK NEEDS_REVIEW}`; models `Profile` (`id` UUID PK = Supabase `sub`, `activeVehicleId` nullable FK → Vehicle `ON DELETE SET NULL`), `Vehicle` (`make`/`model` "obligatorio, 1–60 caracteres", `catalogModelId` nullable, `year` int, `nickname` "≤ 40 caracteres", `licensePlate` "≤ 15 caracteres", `fuelType`/`usageType` nullable, `currentOdometerKm` int, `lastReadingAt` timestamptz, `userId` FK `ON DELETE CASCADE`, index `(userId, createdAt)`), `MileageReading` (`id` UUID PK without default — "generado en el cliente", `odometerKm` int, `readAt` timestamptz, `source`, `origin`, `reviewStatus @default(OK)`, `confirmedUnusual @default(false)`, `vehicleId` FK `ON DELETE CASCADE`, index `(vehicleId, readAt(sort: Desc))`), `CatalogMake` (`name` unique), `CatalogModel` (`makeId` FK, `@@unique([makeId, name])`); `createdAt`/`updatedAt` on all
- [X] T010 Generate initial migration in `backend/prisma/migrations/` and append raw SQL to it: `CREATE EXTENSION IF NOT EXISTS pg_trgm; CREATE EXTENSION IF NOT EXISTS unaccent;`, an immutable `f_unaccent(text)` wrapper, GIN trigram indexes on `f_unaccent(lower(name))` for `CatalogMake` and `CatalogModel`, partial index on `MileageReading(vehicleId) WHERE "reviewStatus" = 'NEEDS_REVIEW'`, CHECK constraints `year >= 1950`, `"odometerKm" BETWEEN 0 AND 2000000`, and `ALTER TABLE ... ENABLE ROW LEVEL SECURITY` (no policies) on every app table (research R3)
- [X] T011 [P] Create `packages/shared/src/dto/serialized.ts` with utility type `Serialized<T>` (recursively maps `Date` → `string`, keeps `null`), and export it from `packages/shared/src/dto/index.ts`
- [X] T012 [P] Create `packages/shared/src/errors.ts` with `ApiErrorCode` union `"UNAUTHORIZED" | "NOT_FOUND" | "VALIDATION_ERROR" | "READING_OUT_OF_ORDER" | "UNUSUAL_DISTANCE" | "LAST_READING_UNDELETABLE" | "ID_CONFLICT" | "INTERNAL"` and `ApiError` type `{ error: { code; fields?: Record<string, string>; validRange?: { minKm: number; maxKm: number | null } } }` matching `contracts/openapi.yaml` `Error` schema
- [X] T013 Create `packages/shared/src/dto/vehicle.ts`, `reading.ts`, `profile.ts`, `catalog.ts` deriving DTOs with `import type` from `../generated/prisma` (`Pick`/`Omit` + `Serialized`): `VehicleDto` (fields of openapi `Vehicle` incl. `pendingReviewCount: number`), `MileageReadingDto`, `ProfileDto`, `CatalogMakeDto`, `CatalogModelDto`, `ReadingResultDto = { reading; vehicle }` (depends on T009, T011)

### API base

- [X] T014 [P] Create `backend/src/config/env.ts` parsing `process.env` with a Zod schema (all vars from T007; `UNUSUAL_KM_PER_DAY` coerced to number, default 1500) and exporting a typed frozen `env`; fail fast on invalid config
- [X] T015 [P] Create `backend/src/lib/prisma.ts` exporting a singleton `PrismaClient` from the generated client
- [X] T016 [P] Create `backend/src/lib/http-error.ts` with class `HttpError(status, code: ApiErrorCode, extras?)` and helpers `notFound()`, `validationError(fields)`, `conflict(code, extras?)`
- [X] T017 Create `backend/src/middleware/auth.ts`: read `Authorization: Bearer`, verify with `jose.jwtVerify` against `createRemoteJWKSet(env.SUPABASE_JWKS_URL)` (module-level, cached), check `iss = ${SUPABASE_URL}/auth/v1`, `aud = "authenticated"`, `exp`; set typed `req.userId = payload.sub`; on failure throw `HttpError(401, "UNAUTHORIZED")`; extend Express `Request` type in `backend/src/types/express.d.ts` (research R2)
- [X] T018 [P] Create `backend/src/middleware/validate.ts` with generic `validateBody<S extends z.ZodTypeAny>(schema)` / `validateQuery` middlewares that replace `req.body`/`req.query` with parsed data and map Zod issues to `VALIDATION_ERROR` with `fields` (path → issue code)
- [X] T019 [P] Create `backend/src/middleware/error-handler.ts` serializing `HttpError` to the `ApiError` shape, mapping Prisma `P2025` to `NOT_FOUND`, and everything else to `500 INTERNAL` without leaking details; plus `backend/src/middleware/logging.ts` with `pino-http` (request id, `userId`, duration, error code) (research R11)
- [X] T020 Create `backend/src/modules/profile/profile.service.ts` with `ensureProfile(userId)` (Prisma `upsert`) and a middleware `backend/src/middleware/ensure-profile.ts` that calls it once per request after auth
- [X] T021 Create `backend/src/app.ts` (helmet, CORS restricted to `env.CORS_ORIGIN`, JSON body limit 10kb, logging, `/v1` router with auth + ensure-profile, `GET /health` unauthenticated, error handler last) and `backend/src/server.ts` (listen on `env.PORT`, graceful shutdown disconnecting Prisma) (depends on T014–T020)

### Shell de la PWA

- [X] T022 [P] Configure `frontend/vite.config.ts` with React plugin and `VitePWA` (`registerType: "autoUpdate"`, manifest: `name: "Car Checkup"`, `short_name`, `lang: "es"`, `display: "standalone"`, `start_url: "/"`, theme/background colors from design tokens, icons 192/512/maskable in `frontend/public/icons/`; Workbox precache of app shell, `navigateFallback: "/index.html"`)
- [X] T023 [P] Create design tokens and Tailwind setup in `frontend/src/design/tokens.css` and `frontend/src/index.css`: sober, serious-but-friendly palette (neutral base + one calm accent + semantic success/warning/danger), legible type scale (base ≥ 16px), spacing scale, `--tap-min: 44px`; light/dark via `prefers-color-scheme` (Principle IV)
- [X] T024 [P] Create accessible base components in `frontend/src/design/components/`: `Button.tsx` (min height 44px, variants primary/secondary/danger, loading state), `TextField.tsx` (label, hint, error text, `inputMode` prop), `Sheet.tsx` (bottom sheet on Radix Dialog), `ConfirmDialog.tsx`, `Banner.tsx`, `Spinner.tsx`
- [X] T025 [P] Create `frontend/src/lib/supabase.ts` (client from `VITE_SUPABASE_URL`/`VITE_SUPABASE_ANON_KEY`, session persisted) and `frontend/src/lib/env.ts` validating `import.meta.env` with Zod
- [X] T026 Create `frontend/src/lib/api.ts`: typed `apiFetch<T>(path, init)` adding the Supabase access token, parsing JSON, throwing a typed `ApiRequestError` carrying `status` and the shared `ApiError` body; network failures throw `NetworkError` (used by the offline queue) (depends on T012, T025)
- [X] T027 [P] Create `frontend/src/i18n/es.ts` with all UI copy and a `messageForError(code, extras)` mapping every `ApiErrorCode` and field validation code to plain, non-technical Spanish telling the user which field to fix and how (FR-015, Principle V)
- [X] T028 Create auth feature in `frontend/src/features/auth/`: `AuthProvider.tsx` (session state from Supabase, exposes `userId`), `LoginPage.tsx` (minimal: email magic link via Supabase Auth only, mobile layout; full account management is out of scope per spec Assumptions), `RequireAuth.tsx` route guard (depends on T024, T025)
- [X] T029 Create `frontend/src/app/` with `providers.tsx` (QueryClient, AuthProvider), `router.tsx` (routes `/login`, `/`, `/vehicles/new`, `/vehicles/:id/edit`, `/vehicles/:id/history` behind `RequireAuth`), `AppLayout.tsx` (mobile-first single column, safe-area insets) and `frontend/src/main.tsx` wiring them (depends on T028)

**Checkpoint**: API arranca con auth y perfil; la PWA se instala, inicia sesión y muestra una pantalla vacía protegida.

---

## Phase 3: User Story 1 - Registrar mi primer vehículo (Priority: P1) 🎯 MVP

**Goal**: Un usuario nuevo da de alta su vehículo (catálogo o texto libre, combustible/uso opcionales) y lo ve en la pantalla principal con su kilometraje inicial.

**Independent Test**: Con un usuario sin vehículos, iniciar sesión → se abre el alta → completar marca, modelo, año y km → la pantalla principal muestra el vehículo con ese km (quickstart escenarios 1–3).

### Catálogo

- [X] T030 [P] [US1] Create catalog seed data `backend/prisma/seed/catalog.csv` (columns `make,model`; passenger cars and SUVs from NHTSA vPIC plus brands common in Latin America and Spain, e.g. SEAT, Renault, Peugeot, Chevrolet, Nissan, Volkswagen, Kia, Hyundai, Toyota, Mazda, BYD, Chery, MG) and `backend/prisma/seed/seed.ts` that idempotently upserts `CatalogMake` and `CatalogModel` (research R6); register it as the Prisma seed command in `backend/package.json`
- [X] T031 [P] [US1] Create `packages/shared/src/schemas/catalog.ts` with Zod `CatalogMakesQuery` (`q` string, min 1, max 60, trimmed) and `CatalogModelsQuery` (`q` optional, max 60)
- [X] T032 [US1] Implement `backend/src/modules/catalog/catalog.service.ts`: `searchMakes(q)` returning up to 10 and `searchModels(makeId, q?)` returning up to 20, using `$queryRaw` tagged templates with `f_unaccent(lower(name)) LIKE f_unaccent(lower(${q})) || '%'` ranked before `%q%` / trigram similarity; `searchModels` throws `notFound()` if make missing (depends on T010, T031)
- [X] T033 [US1] Implement `backend/src/modules/catalog/catalog.routes.ts` with `GET /catalog/makes` and `GET /catalog/makes/:makeId/models` per `contracts/openapi.yaml`, mounted in `backend/src/app.ts`

### Alta de vehículo (API)

- [X] T034 [P] [US1] Create `packages/shared/src/schemas/vehicle.ts` with Zod `VehicleCreateSchema`: `catalogModelId` uuid nullable optional; `make`, `model` trimmed string "1–60 caracteres"; `year` int "1950 ≤ year ≤ año actual + 1" (computed at parse time); `odometerKm` int "0 ≤ valor ≤ 2 000 000" (accepts only integers); `initialReadingId` uuid; `nickname` "≤ 40 caracteres" nullable optional; `licensePlate` "≤ 15 caracteres, mayúsculas, sin espacios extremos" (transform trim + uppercase) nullable optional; `fuelType` enum `GASOLINE|DIESEL|HYBRID|ELECTRIC` nullable optional; `usageType` enum `CITY|HIGHWAY|MIXED` nullable optional; annotate with `satisfies` against a type derived from the Prisma `Vehicle` input so fields cannot diverge (research R1)
- [X] T035 [P] [US1] Create `backend/src/modules/vehicles/vehicle.mapper.ts` with `toVehicleDto(vehicle, pendingReviewCount)` returning `VehicleDto`
- [X] T036 [US1] Implement `createVehicle(userId, input)` in `backend/src/modules/vehicles/vehicles.service.ts`: in one `prisma.$transaction`, if `catalogModelId` is set load it (404 if missing) and overwrite `make`/`model` with catalog names; create `Vehicle` with `currentOdometerKm = odometerKm`, `lastReadingAt = now`; create `MileageReading` with `id = initialReadingId`, `source = INITIAL`, `origin = ONLINE`, `readAt = now`; set `Profile.activeVehicleId` to the new vehicle (FR-001, FR-003, US3-1) (depends on T034, T035)
- [X] T037 [US1] Implement `listVehicles(userId)` in `backend/src/modules/vehicles/vehicles.service.ts`: single query filtered by `userId` ordered by `createdAt`, with `_count` of readings where `reviewStatus = NEEDS_REVIEW` for `pendingReviewCount` (no N+1, research R7)
- [X] T038 [US1] Implement `backend/src/modules/vehicles/vehicles.routes.ts` with `GET /vehicles` and `POST /vehicles` (validated with `VehicleCreateSchema`, responds `201`) and mount it in `backend/src/app.ts`; implement `GET /me` in `backend/src/modules/profile/profile.routes.ts` returning `ProfileDto`

### Alta de vehículo (UI)

- [X] T039 [P] [US1] Create `frontend/src/features/catalog/useCatalogSearch.ts` (TanStack Query, 200 ms debounce, `enabled` only when `q` non-empty) and `frontend/src/features/catalog/Autocomplete.tsx` (accessible combobox: typing filters suggestions, selecting returns `{ id, name }`, free text allowed and returns `{ id: null, name }`) (FR-002)
- [X] T040 [P] [US1] Create `frontend/src/features/vehicles/api.ts` with `useVehicles()`, `useCreateVehicle()` (generates `initialReadingId` with `crypto.randomUUID()`; on success invalidates vehicles and profile) and `useProfile()`
- [X] T041 [US1] Create `frontend/src/features/vehicles/VehicleForm.tsx`: required fields make (Autocomplete), model (Autocomplete scoped to selected make; free text if make uncatalogued), year (`inputMode="numeric"`), current km (`inputMode="numeric"`, accepts thousand separators, strips them, ignores decimals); a collapsed "Más datos (opcional)" section with nickname, plate, fuel type and usage type as segmented choices that can be skipped with no extra step; client-side validation with `VehicleCreateSchema` and messages from `messageForError`; when offline (`navigator.onLine === false` or `NetworkError`), keep the entered values, show a plain-language "Sin conexión: guardaremos tu vehículo cuando vuelvas a tener señal" banner and enable a retry that resubmits the same `initialReadingId` (FR-001, FR-001a, US1-3, US1-4, US1-5) (depends on T039)
- [X] T042 [US1] Create `frontend/src/features/vehicles/NewVehiclePage.tsx` using `VehicleForm` + `useCreateVehicle`, navigating to `/` on success, showing API errors inline, and preserving form state on `NetworkError` (no data loss) (depends on T040, T041)
- [X] T043 [US1] Create `frontend/src/features/home/HomePage.tsx`: if `useVehicles()` returns empty, redirect to `/vehicles/new` (FR-016); otherwise show the active vehicle card (`nickname` or `make model`, year, `currentOdometerKm` formatted with thousand separators + "km", last reading date as relative text) with skeleton while loading (FR-005) and wire it as the `/` route
- [X] T044 [US1] UX/UI review of LoginPage, NewVehiclePage, VehicleForm and HomePage against Principle IV (sober, serious-but-friendly look; touch targets ≥ 44px; base text ≥ 16px; WCAG AA contrast; plain-language copy); record findings and fixes in `specs/001-vehicles-mileage/checklists/ux-review.md` under "US1"

**Checkpoint**: MVP funcional: alta de vehículo y visualización en la pantalla principal.

---

## Phase 4: User Story 2 - Actualizar el kilometraje en segundos (Priority: P1)

**Goal**: Registrar una lectura en 2 toques desde la pantalla principal, con fecha pasada opcional, validación de orden y plausibilidad, y funcionamiento offline sin duplicados.

**Independent Test**: Con un vehículo existente: tocar "Actualizar km", escribir valor, confirmar → km actualizado; probar valor menor (rechazo), valor inusual (confirmación), fecha pasada, y modo offline con sincronización posterior (quickstart escenarios 4–9).

### Validación compartida y API

- [X] T045 [P] [US2] Create `packages/shared/src/schemas/reading.ts` with Zod `ReadingCreateSchema`: `id` uuid ("generado en el cliente; clave de idempotencia"); `odometerKm` int "0 ≤ valor ≤ 2 000 000"; `readAt` ISO datetime **required** ("≤ ahora + 5 min"), set on the device at capture time; `origin` enum `ONLINE|OFFLINE_SYNC`; `confirmedUnusual` boolean default false; and `ReadingUpdateSchema` (`odometerKm`, `readAt`, `confirmedUnusual`, at least one property)
- [X] T046 [P] [US2] Implement pure functions in `packages/shared/src/validation/readings.ts`: `findNeighbors(readings, readAt)` over readings with `reviewStatus = OK` sorted by `readAt`; `checkOrder(value, prev, next)` returning `{ ok: true } | { ok: false, validRange: { minKm, maxKm } }` ("prev.odometerKm ≤ odometerKm ≤ next.odometerKm"); `isUnusual(value, prev, readAt, kmPerDayThreshold)` implementing "(odometerKm − prev.odometerKm) / max(díasEntre, 1) > 1500"; `isFutureDate(readAt, now)` with 5-minute tolerance (research R8)
- [X] T047 [US2] Create `backend/src/modules/readings/recalculate.ts` with `recalculateVehicleOdometer(tx, vehicleId)` that sets `Vehicle.currentOdometerKm`/`lastReadingAt` from the latest `reviewStatus = OK` reading by `readAt` (data-model rule 5)
- [X] T048 [US2] Implement `createReading(userId, vehicleId, input)` in `backend/src/modules/readings/readings.service.ts`: verify vehicle belongs to `userId` (else 404); if a reading with `input.id` exists → return it with status 200 when `vehicleId`, `odometerKm` and `readAt` match (`readAt` compared at millisecond precision as received; never substituted by server time), else `409 ID_CONFLICT`; reject future `readAt` with `422 VALIDATION_ERROR`; in a serializable `$transaction` load neighbors, apply `checkOrder` (ONLINE → `422 READING_OUT_OF_ORDER` with `validRange`; OFFLINE_SYNC → save with `reviewStatus = NEEDS_REVIEW`), apply `isUnusual` with `env.UNUSUAL_KM_PER_DAY` (ONLINE and not `confirmedUnusual` → `409 UNUSUAL_DISTANCE`), insert with `source = UPDATE`, call `recalculateVehicleOdometer`, return `ReadingResultDto` (FR-007..FR-010, research R5) (depends on T045–T047)
- [X] T049 [US2] Implement `POST /vehicles/:vehicleId/readings` in `backend/src/modules/readings/readings.routes.ts` (201 new / 200 replay) and mount it in `backend/src/app.ts`
- [X] T050 [US2] Implement `updateReading` in `backend/src/modules/readings/readings.service.ts`: verify the vehicle belongs to `userId` and the reading to the vehicle (404 otherwise); apply `ReadingUpdateSchema`, re-run `checkOrder` excluding the reading itself (failure → `422 READING_OUT_OF_ORDER`) and `isUnusual` (→ `409 UNUSUAL_DISTANCE` unless confirmed); on success set `reviewStatus = OK` (NEEDS_REVIEW → OK transition) and `recalculateVehicleOdometer`; route `PATCH /vehicles/:vehicleId/readings/:readingId`

### Cola offline (cliente)

- [X] T051 [P] [US2] Create `frontend/src/offline/queue.ts` on `idb`: database `car-checkup`, store `pendingReadings` keyed by `id`, indexes `byUser` and `byQueuedAt`; item fields exactly per `contracts/offline-sync.md` (`id`, `vehicleId`, `odometerKm`, `readAt`, `confirmedUnusual`, `queuedAt`, `attempts`, `lastError`) plus `userId` and `origin`; functions `enqueue`, `listPending(userId)`, `remove(id)`, `markAttempt(id, error)`
- [X] T052 [US2] Create `frontend/src/offline/sync.ts`: `syncPending(userId)` sends items FIFO by `queuedAt`, one at a time per vehicle, through `apiFetch`; handles each response exactly per the table in `contracts/offline-sync.md` (201/200 remove + refresh; NEEDS_REVIEW remove + notify; 422/409 remove + surface error; 404 discard + notify; 401 pause; network/5xx keep with exponential backoff 1 s → 2 s → … max 5 min); triggers on app start, `online` event and `visibilitychange` to visible; exposes a `usePendingReadings(vehicleId)` hook (depends on T026, T051)

### Captura rápida (UI)

- [X] T053 [US2] Create `frontend/src/features/readings/useCaptureReading.ts`: validates locally with `packages/shared/src/validation/readings.ts` against cached readings/vehicle, generates `id` with `crypto.randomUUID()` and fixes `readAt` (now, or the user-chosen past date) at capture time before enqueueing, sets `origin` from `navigator.onLine`, writes to the queue, optimistically updates the vehicle in the TanStack Query cache, and triggers `syncPending` (depends on T046, T052)
- [X] T054 [US2] Create `frontend/src/features/readings/QuickCaptureSheet.tsx` (bottom `Sheet`): opens with the km field already focused and `inputMode="numeric"` (numeric keyboard), shows last known km and date as reference, single "Guardar" button; optional "Cambiar fecha" link opening a date picker restricted to today and past dates (default now; does not add taps to the main flow); order violations show the valid range in plain language with a "Corregir última lectura" action that edits the previous reading in place via `PATCH /vehicles/:vehicleId/readings/:readingId` (US2-3); unusual distance shows a `ConfirmDialog` and resubmits with `confirmedUnusual: true` (FR-009); main flow = 2 taps (FR-006) (depends on T053)
- [X] T055 [US2] Integrate in `frontend/src/features/home/HomePage.tsx`: prominent "Actualizar km" button on the active vehicle card opening `QuickCaptureSheet`, "Pendiente de sincronizar" badge when `usePendingReadings` is non-empty, and a `Banner` "Revisa N lecturas" when `pendingReviewCount > 0` (FR-005, FR-010)
- [X] T056 [US2] UX/UI review of QuickCaptureSheet (focus and numeric keyboard behaviour, order-error and unusual-distance dialogs, in-place correction, pending badge, review banner) against Principle IV; record findings and fixes in `specs/001-vehicles-mileage/checklists/ux-review.md` under "US2"

**Checkpoint**: US1 + US2 cubren el núcleo del producto, incluido offline.

---

## Phase 5: User Story 3 - Gestionar varios vehículos (Priority: P2)

**Goal**: Varios vehículos por usuario, cambio del vehículo activo con un toque y persistencia del último activo.

**Independent Test**: Añadir un segundo vehículo (queda activo), cambiar de vehículo con un toque, registrar km en cada uno y recargar: sigue activo el último usado (quickstart escenario 10).

- [X] T057 [P] [US3] Create `packages/shared/src/schemas/profile.ts` with Zod `ProfileUpdateSchema` (`activeVehicleId` uuid, required)
- [X] T058 [US3] Implement `setActiveVehicle(userId, vehicleId)` in `backend/src/modules/profile/profile.service.ts` (vehicle must belong to `userId`, else 404) and `PATCH /me` in `backend/src/modules/profile/profile.routes.ts` (depends on T057)
- [X] T059 [P] [US3] Create `frontend/src/features/vehicles/useActiveVehicle.ts`: resolves the active vehicle from `localStorage` cache (key per `userId`, read/write wrapped in try/catch) for instant render, then reconciles with `Profile.activeVehicleId`; `setActive(id)` updates cache optimistically and calls `PATCH /me`; falls back to the first vehicle if the stored id no longer exists (FR-011)
- [X] T060 [US3] Create `frontend/src/features/vehicles/VehicleSwitcher.tsx`: horizontal chip/segmented list of the user's vehicles on the home screen, one tap switches the active vehicle, plus an "Añadir vehículo" chip linking to `/vehicles/new`; scales to many vehicles with horizontal scroll (depends on T059)
- [X] T061 [US3] Integrate `VehicleSwitcher` and `useActiveVehicle` into `frontend/src/features/home/HomePage.tsx` so the card and `QuickCaptureSheet` always target the active vehicle; after creating a vehicle in `NewVehiclePage.tsx`, set it active (US3-1, US3-2, US3-3)
- [X] T062 [US3] UX/UI review of VehicleSwitcher with 1, 3 and 10+ vehicles against Principle IV; record findings and fixes in `specs/001-vehicles-mileage/checklists/ux-review.md` under "US3"

**Checkpoint**: Multivehículo completo.

---

## Phase 6: User Story 4 - Editar, consultar historial y eliminar (Priority: P3)

**Goal**: Editar datos del vehículo, consultar el historial, corregir/eliminar lecturas (incl. las marcadas para revisión) y eliminar vehículos con confirmación.

**Independent Test**: Editar el año, abrir el historial, eliminar una lectura intermedia (km recalculado), intentar eliminar la única lectura (rechazo) y eliminar un vehículo tras confirmar (quickstart escenarios 11–13).

### API

- [X] T063 [P] [US4] Add `VehicleUpdateSchema` to `packages/shared/src/schemas/vehicle.ts`: same field constraints as `VehicleCreateSchema` minus `odometerKm` and `initialReadingId`, all optional, at least one property
- [X] T064 [US4] Implement `getVehicle`, `updateVehicle` (re-resolve catalog names when `catalogModelId` changes) and `deleteVehicle` (cascade) in `backend/src/modules/vehicles/vehicles.service.ts`, all scoped by `userId` (404 otherwise), and routes `GET/PATCH/DELETE /vehicles/:vehicleId` (`204` on delete) in `backend/src/modules/vehicles/vehicles.routes.ts` (FR-012, FR-013, FR-014) (depends on T063)
- [X] T065 [US4] Implement `listReadings(userId, vehicleId, cursor, limit)` in `backend/src/modules/readings/readings.service.ts`: ordered by `readAt DESC, id DESC`, keyset cursor (base64 of `readAt|id`), `limit` 1–100 default 30, returns `{ items, nextCursor }`; route `GET /vehicles/:vehicleId/readings`
- [X] T066 [US4] Implement `deleteReading` in `backend/src/modules/readings/readings.service.ts`: verify the vehicle belongs to `userId` and the reading to the vehicle (404 otherwise); if it is the last remaining `reviewStatus = OK` reading → `409 LAST_READING_UNDELETABLE`; otherwise delete, `recalculateVehicleOdometer`, return the updated `VehicleDto`; route `DELETE /vehicles/:vehicleId/readings/:readingId`

### UI

- [X] T067 [P] [US4] Extend `frontend/src/features/vehicles/api.ts` with `useVehicle(id)`, `useUpdateVehicle()`, `useDeleteVehicle()` and create `frontend/src/features/readings/api.ts` with `useReadingsInfinite(vehicleId)`, `useUpdateReading()`, `useDeleteReading()` (invalidate vehicle + readings on success)
- [X] T068 [US4] Create `frontend/src/features/vehicles/EditVehiclePage.tsx` reusing `VehicleForm` in edit mode (no km field), plus a danger-zone "Eliminar vehículo" button opening `ConfirmDialog` that states the reading history will be deleted; after delete, switch active to another vehicle or go to `/vehicles/new` if none (US4-1, US4-4, FR-013) (depends on T067)
- [X] T069 [US4] Create `frontend/src/features/readings/HistoryPage.tsx`: infinite list newest first with date and km, pending (queued) items shown on top with a "pendiente" tag, `NEEDS_REVIEW` items highlighted with a plain-language explanation; tapping a reading opens an edit sheet (value/date) with delete action; delete of the last reading shows the `LAST_READING_UNDELETABLE` message (US4-2, US4-3, FR-012) (depends on T067)
- [X] T070 [US4] Add navigation entries from the active vehicle card in `frontend/src/features/home/HomePage.tsx` to `/vehicles/:id/edit` and `/vehicles/:id/history`, and make the "Revisa N lecturas" banner link to the history filtered to review items
- [X] T071 [US4] UX/UI review of EditVehiclePage, HistoryPage, reading edit sheet and delete confirmations against Principle IV; record findings and fixes in `specs/001-vehicles-mileage/checklists/ux-review.md` under "US4"

**Checkpoint**: Todas las historias funcionales de forma independiente.

---

## Phase 7: Polish & Cross-Cutting Concerns

**Purpose**: Calidad transversal, revisión UX/UI y validación final

- [ ] T072 [P] Add PWA icons (192, 512, maskable) and Apple touch icon in `frontend/public/icons/` and verify install on iOS Safari and Chrome Android (quickstart escenario 15)
- [X] T073 [P] Add basic rate limiting (`express-rate-limit`, per `userId` after auth, per IP before) in `backend/src/middleware/rate-limit.ts` and mount in `backend/src/app.ts`
- [X] T074 [P] Create `backend/prisma/seed/perf-seed.ts` that creates a test user with 20 vehicles × 1 000 readings for the SC-006 performance check in `quickstart.md`
- [X] T075 Final cross-screen UX/UI consistency pass (tokens, spacing, copy tone, dark mode) consolidating the per-story reviews in `specs/001-vehicles-mileage/checklists/ux-review.md`
- [X] T076 Run `npm run typecheck` and `npm run lint` at repo root and remove any `any`/unsafe usage reported
- [X] T077 [P] Write root `README.md` with setup steps mirroring `specs/001-vehicles-mileage/quickstart.md` and deployment notes (Vercel frontend, Node host backend, Supabase pooler vs direct URL)
- [ ] T078 Execute all scenarios in `specs/001-vehicles-mileage/quickstart.md` (1–15 + performance) on a mobile viewport and record results

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: sin dependencias
- **Foundational (Phase 2)**: depende de Setup; BLOQUEA todas las historias
- **US1 (Phase 3)**: depende de Foundational
- **US2 (Phase 4)**: depende de Foundational; para probarla de punta a punta necesita un vehículo, que puede crearse por API/seed, aunque en la práctica se hace tras US1
- **US3 (Phase 5)**: depende de Foundational; usa el alta de US1 para crear el segundo vehículo
- **US4 (Phase 6)**: depende de Foundational; usa `recalculate.ts` (T047), `validation/readings.ts` (T046) y `updateReading` (T050) de US2
- **Polish (Phase 7)**: depende de las historias que se quieran entregar

### User Story Dependencies

```text
Setup → Foundational ─┬─► US1 (P1) ─┬─► US3 (P2)
                      │             │
                      └─► US2 (P1) ─┴─► US4 (P3)
```

### Within Each User Story

- Schemas compartidos → servicios → rutas → hooks de UI → pantallas → integración en Home
- `HomePage.tsx` se toca en T043, T055, T061 y T070: hacerlo en ese orden, no en paralelo

### Parallel Opportunities

- Phase 1: T003–T008 en paralelo tras T001–T002
- Phase 2: T011, T012, T014–T016, T018, T019 en paralelo; T022–T025 y T027 en paralelo con el bloque de API
- US1: T030, T031, T034, T035 en paralelo; T039 y T040 en paralelo
- US2: T045, T046 y T051 en paralelo
- US4: T063 y T067 en paralelo; T065 y T066 tocan el mismo servicio → secuenciales
- Polish: T072, T073, T074, T077 en paralelo

---

## Parallel Example: User Story 1

```bash
# Esquemas, seed y mapper en paralelo:
Task: "Create catalog seed data backend/prisma/seed/catalog.csv and seed.ts"
Task: "Create packages/shared/src/schemas/catalog.ts"
Task: "Create packages/shared/src/schemas/vehicle.ts with VehicleCreateSchema"
Task: "Create backend/src/modules/vehicles/vehicle.mapper.ts"

# Hooks de UI en paralelo:
Task: "Create frontend/src/features/catalog/useCatalogSearch.ts and Autocomplete.tsx"
Task: "Create frontend/src/features/vehicles/api.ts"
```

## Parallel Example: User Story 2

```bash
Task: "Create packages/shared/src/schemas/reading.ts"
Task: "Implement packages/shared/src/validation/readings.ts"
Task: "Create frontend/src/offline/queue.ts"
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Phase 1 Setup → Phase 2 Foundational
2. Phase 3 (US1): alta de vehículo + pantalla principal
3. **STOP and VALIDATE**: quickstart escenarios 1–3
4. Demo

### Incremental Delivery

1. Setup + Foundational → base lista
2. US1 → validar → demo (MVP)
3. US2 → validar escenarios 4–9 → primera versión útil (recomendado como primer release público: alta + captura rápida + offline)
4. US3 → validar escenario 10
5. US4 → validar escenarios 11–13
6. Polish → quickstart completo

### Parallel Team Strategy

1. Equipo completo en Setup + Foundational
2. Después: Dev A → US1 (alta + catálogo); Dev B → US2 (API de lecturas + cola offline)
3. Cuando US1 y US2 estén listas: Dev A → US3; Dev B → US4

---

## Notes

- [P] = archivos distintos, sin dependencias pendientes
- Las restricciones de campos entre comillas provienen literalmente de data-model.md
- Ningún tipo de dominio se escribe a mano fuera de `packages/shared` (Principio II)
- Commit tras cada tarea o grupo lógico; validar cada checkpoint antes de avanzar

## Implementation Notes (2026-10-20)

Desviaciones respecto al texto de las tareas, todas verificadas con tests:

- **T009/T010 (Prisma 7)**: Prisma 7 ya no admite `url`/`directUrl` en el `datasource` del
  esquema; la URL de migraciones (`DIRECT_URL`) está en `backend/prisma.config.ts` y el runtime
  usa `DATABASE_URL` con el adaptador `@prisma/adapter-pg`. Las extensiones se crean en el
  esquema `extensions` (como en Supabase). Las tablas usan nombres snake_case (`@@map`).
- **T018**: en lugar de middlewares que reescriben `req.query` (de solo lectura en Express 5),
  `parseInput(schema, input)` valida body, query y params dentro de cada handler.
- **T020**: el upsert del perfil se cachea por instancia (hallazgo P1 del análisis).
- **T030**: el catálogo es una lista curada (49 marcas, 396 modelos) de marcas habituales en
  Latinoamérica, España y EE. UU., no una descarga literal de NHTSA vPIC.
- **T048/T050/T066**: la concurrencia por vehículo se serializa con `SELECT … FOR UPDATE` sobre
  el vehículo en vez de transacciones `Serializable` (sin reintentos por conflictos).
- **T053**: la UI muestra el kilometraje de las lecturas aún en cola directamente desde
  IndexedDB en lugar de mutar la caché de TanStack Query, para que una recarga del servidor no
  "pierda" lecturas pendientes. Las lecturas que fallan por red pasan a `origin: OFFLINE_SYNC`.
- **T065 + contrato**: se añadió el filtro opcional `reviewStatus` a
  `GET /vehicles/{id}/readings` (documentado en `contracts/openapi.yaml`) para "Revisa N lecturas".
- **Frontend**: se usa `@supabase/auth-js` en vez de `supabase-js` completo (solo se necesita
  Auth) y las pantallas secundarias se cargan bajo demanda.
- **Tests añadidos** (no pedidos por las tareas): 22 unit tests de reglas de lectura, 22 tests de
  integración del API contra PostgreSQL y 9 escenarios e2e de Playwright (quickstart 1–8, 10–13)
  con un emulador local de Supabase Auth.

Pendiente:

- **T072 / T078**: falta comprobar en dispositivos físicos (instalación de la PWA en iOS Safari
  y Chrome Android, teclado numérico al abrir la hoja en iOS, escenario 15 de quickstart). Todo
  lo demás del quickstart está cubierto por las pruebas automatizadas.

