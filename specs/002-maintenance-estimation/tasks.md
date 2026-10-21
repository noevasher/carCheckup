---

description: "Task list for 002-maintenance-estimation"
---

# Tasks: Motor de Estimación de Mantenimiento

**Input**: Design documents from `specs/002-maintenance-estimation/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/openapi.yaml,
quickstart.md. Builds on the implemented `specs/001-vehicles-mileage`.

**Tests**: La spec no pide TDD, pero research R12 define la estrategia de pruebas y el motor es
puramente numérico; se incluyen tareas de tests (unit del motor, integración del API y e2e) dentro
de cada historia, después de su implementación.

**Organization**: Tasks are grouped by user story to enable independent implementation and testing of each story.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (US1–US4 de spec.md)
- Rutas según plan.md: `backend/`, `frontend/`, `packages/shared/`

---

## Phase 1: Setup (Shared Infrastructure)

- [X] T001 Add `@tanstack/react-query-persist-client`, `@tanstack/query-async-storage-persister` and `idb-keyval` to `frontend/package.json` dependencies and run `npm install` at the repo root

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Modelo de datos, motor puro y recalculo transaccional que usan todas las historias

**⚠️ CRITICAL**: No user story work can begin until this phase is complete

### Modelo de datos

- [X] T002 Extend `backend/prisma/schema.prisma` per data-model.md: add `SERVICE` to enum `ReadingSource`; new enums `MaintenanceTypeCode {OIL_CHANGE ENGINE_AIR_FILTER CABIN_AIR_FILTER TIRE_ROTATION ALIGNMENT_BALANCING TIRE_REPLACEMENT BRAKE_INSPECTION BRAKE_FLUID COOLANT SPARK_PLUGS TIMING_BELT TRANSMISSION_FLUID BATTERY_CHECK}`, `BaselineSource {SERVICE PRIOR VEHICLE_REGISTRATION}`, `IntervalSource {DEFAULT CITY_ADJUSTED CUSTOM}`, `PaceSource {READINGS USAGE_DEFAULT}`, `LimitingFactor {KM TIME}`; models (snake_case `@@map`/`@map`) `MaintenanceType` (`code` PK, `intervalKm Int?`, `intervalMonths Int?`, `fuelTypes FuelType[]`, `appliesWhenFuelUnknown Boolean`, `severeUsageSensitive Boolean`, `sortOrder Int`), `VehicleMaintenanceSetting` (PK `[vehicleId, typeCode]`, `enabled Boolean @default(true)`, `customIntervalKm Int?` "500 ≤ valor ≤ 300.000", `customIntervalMonths Int?` "1 ≤ valor ≤ 120", `priorKm Int?`, `priorDate DateTime? @db.Date`, `priorUnknown Boolean @default(false)`, `snoozedUntil DateTime? @db.Date`, `updatedAt`; FK vehicle `onDelete: Cascade`), `ServiceRecord` (`id` UUID PK without default — "generado en el cliente", `vehicleId` FK `onDelete: Cascade`, `performedAt Timestamptz`, `odometerKm Int`, `notes String? @db.VarChar(500)`, `readingId String? @unique` FK → MileageReading `onDelete: SetNull`, timestamps, index `(vehicleId, performedAt(sort: Desc))`), `ServiceRecordItem` (PK `[serviceRecordId, typeCode]`, FK service `onDelete: Cascade`, index `(typeCode, serviceRecordId)`), `MaintenanceEstimate` (PK `[vehicleId, typeCode]`, `baselineSource`, `baselineKm Int`, `baselineAt Timestamptz`, `intervalKm Int?`, `intervalMonths Int?`, `intervalSource`, `dueKm Int?`, `dueByTimeAt Timestamptz?`, `paceKmPerDay Decimal @db.Decimal(8,2)`, `paceSource`, `paceUsageType UsageType?`, `paceWindowDays Int?`, `estimatedByKmAt Timestamptz?`, `estimatedDueAt Timestamptz?`, `limitingFactor LimitingFactor?`, `computedAt Timestamptz`, index `(estimatedDueAt)`, FK vehicle `onDelete: Cascade`); back-relations on `Vehicle` and `MileageReading`
- [X] T003 Create migration `backend/prisma/migrations/<timestamp>_maintenance/migration.sql` with `npx prisma migrate dev --create-only --name maintenance`, then append: `INSERT` of the 13 catalog rows exactly as in the data-model.md "Valores iniciales" table (e.g. `OIL_CHANGE` 10000 km / 12 months / `{GASOLINE,DIESEL,HYBRID}` / applies when unknown / severe; `SPARK_PLUGS` 40000 / 48 / `{GASOLINE,HYBRID}` / not when unknown; `BRAKE_FLUID` and `BATTERY_CHECK` months only), CHECK constraints (`interval_km > 0`, `interval_months > 0`, at least one interval not null; `custom_interval_km BETWEEN 500 AND 300000`; `custom_interval_months BETWEEN 1 AND 120`; `prior_km >= 0`; `odometer_km BETWEEN 0 AND 2000000` on service_records; `NOT (prior_unknown AND (prior_km IS NOT NULL OR prior_date IS NOT NULL))`), and `ENABLE ROW LEVEL SECURITY` on the 5 new tables; apply it to `car_checkup_dev`, `car_checkup_test` and `car_checkup_e2e` and regenerate the client

### Motor (packages/shared)

- [X] T004 [P] Create `packages/shared/src/maintenance/catalog.ts` exporting `MAINTENANCE_DEFAULTS: Record<MaintenanceTypeCode, { intervalKm: number | null; intervalMonths: number | null; fuelTypes: FuelType[]; appliesWhenFuelUnknown: boolean; severeUsageSensitive: boolean; sortOrder: number }>` mirroring the migration values (used by tests and as the engine's catalog input type), plus constants `UPCOMING_KM = 1000`, `UPCOMING_DAYS = 30`, `CITY_FACTOR = 0.8`, `DEFAULT_PACE_BY_USAGE = { CITY: 30, HIGHWAY: 60, MIXED: 40 }`, `DEFAULT_PACE = 40`, `PACE_WINDOW_DAYS = 90`, `PACE_MIN_SPAN_DAYS = 7`, `SNOOZE_DAYS = 7`
- [X] T005 [P] Create `packages/shared/src/dto/maintenance.ts` with DTOs derived from Prisma types via `Pick`/`Serialized` matching `contracts/openapi.yaml`: `VehicleMaintenanceSummaryDto { overdueCount; upcomingCount }`, `PaceDto`, `MaintenanceItemDto` (fields `typeCode, enabled, status: 'OVERDUE'|'UPCOMING'|'OK'|null, snoozedUntil, askHistory, interval { km, months, source, defaultKm, defaultMonths }, baseline { source, km, at } | null, dueKm, remainingKm, dueByTimeAt, estimatedDueAt, limitingFactor`), `VehicleMaintenanceDto { vehicleId; currentOdometerKm; pace; items }`, `ServiceRecordDto` (incl. `typeCodes`, `createdReading`), `ServiceResultDto { service; vehicle; maintenance }`, `ServicePageDto`; add `maintenance: VehicleMaintenanceSummaryDto` to `VehicleDto` in `packages/shared/src/dto/vehicle.ts`; export all from `packages/shared/src/dto/index.ts`
- [X] T006 [P] Create `packages/shared/src/schemas/maintenance.ts` with Zod: `ServiceCreateSchema` (`id` uuid "generado en el cliente", `performedAt` ISO datetime, `odometerKm` int "0 ≤ valor ≤ 2.000.000", `typeCodes` array of `MaintenanceTypeCode` min 1 unique, `notes` trimmed "≤ 500 caracteres" nullable optional (empty → null), `confirmedUnusual` boolean default false), `ServiceUpdateSchema` (same fields optional, at least one), `ServicesListQuery` (cursor, limit 1–100 default 30), `MaintenanceSettingUpdateSchema` (`enabled` boolean, `customIntervalKm` int "500 ≤ valor ≤ 300.000" nullable, `customIntervalMonths` int "1 ≤ valor ≤ 120" nullable, `resetInterval` boolean, `priorHistory` = object `{ km?: int ≥ 0; date?: ISO date }` with at least one key | literal `"UNKNOWN"` | null, `snooze` boolean; at least one property); `AssertKeysIn` checks against the Prisma models where applicable; export from `packages/shared/src/schemas/index.ts`
- [X] T007 Implement `packages/shared/src/maintenance/pace.ts`: `computePace(readings: {odometerKm; readAt}[] (OK only), usageType: UsageType | null): { kmPerDay; source: 'READINGS' | 'USAGE_DEFAULT'; usageType; windowDays }` per research R4 (90-day window from the latest reading → all readings → usage default; both reading options require ≥ 2 readings spanning ≥ 7 days; keep 0 km/day when computed)
- [X] T008 Implement `packages/shared/src/maintenance/interval.ts`: `resolveInterval(defaults, setting, usageType)` returning `{ km, months, source, defaultKm, defaultMonths }` per research R6 (custom → `CUSTOM` never adjusted; severe-sensitive + `CITY` → km × 0.8 rounded to the nearest 100 → `CITY_ADJUSTED`; else `DEFAULT`; months never adjusted)
- [X] T009 Implement `packages/shared/src/maintenance/baseline.ts`: `resolveBaseline({ latestService, setting, initialReading, readings, pace })` per research R5 (`SERVICE` → `PRIOR` (km from date by linear interpolation between neighbor readings / backward extrapolation with pace, min 0; date from km by inverse method) → `VEHICLE_REGISTRATION`); `priorUnknown` skips `PRIOR`
- [X] T010 Implement `packages/shared/src/maintenance/estimate.ts`: `isApplicable(defaults, fuelType)` (fuel in `fuelTypes`, or `appliesWhenFuelUnknown` when fuel is null) and `estimateMaintenance({ catalog, settings, latestServiceByType, readings, initialReading, vehicle: { fuelType, usageType, currentOdometerKm, lastReadingAt } })` returning one estimate per applicable enabled type with `dueKm`, `dueByTimeAt` (baselineAt + months), `estimatedByKmAt` (lastReadingAt + (dueKm − currentKm)/pace days; null when pace 0 or no km interval), `estimatedDueAt` = earliest, `limitingFactor`, plus baseline/interval/pace data (research R7); dates at local noon UTC-safe helpers
- [X] T011 Implement `packages/shared/src/maintenance/status.ts`: `todayInTimeZone(timeZone, now)` returning the calendar date `YYYY-MM-DD` in that IANA zone, and `deriveItem(estimate, setting, currentOdometerKm, today)` where `today` is that calendar date (not an instant) → `status` (OVERDUE if currentKm ≥ dueKm or today ≥ dueByTimeAt; UPCOMING if dueKm − currentKm ≤ 1.000 or estimatedDueAt − today ≤ 30 days; else OK), `remainingKm`, `snoozed` (snoozedUntil > today), `askHistory` (baseline VEHICLE_REGISTRATION and not priorUnknown); `summarize(items)` → `{ overdueCount, upcomingCount }` excluding snoozed; `sortByUrgency(items)`; export all from `packages/shared/src/maintenance/index.ts` and add `"./maintenance"` to `packages/shared/package.json` exports

### Backend base

- [X] T012 Create `backend/src/modules/maintenance/recompute.ts` with `recomputeVehicleMaintenance(tx, vehicleId)`: load vehicle, OK readings (ordered), initial reading, settings, catalog (cached per process), latest service per type (one query using `DISTINCT ON (type_code)` over service_record_items ⨝ service_records ordered by performed_at desc), run `estimateMaintenance`, then `deleteMany` + `createMany` on `maintenance_estimates` for that vehicle
- [X] T013 Call `recomputeVehicleMaintenance` inside the existing transactions in `backend/src/modules/readings/readings.service.ts` (`createReading`, `updateReading`, `deleteReading`) and `backend/src/modules/vehicles/vehicles.service.ts` (`createVehicle`, and `updateVehicle` when `fuelType` or `usageType` change) (FR-019)
- [X] T014 Create `backend/src/modules/maintenance/maintenance.mapper.ts`: `toVehicleMaintenanceDto(vehicle, estimates, settings, catalog, today)` building `VehicleMaintenanceDto` with `deriveItem`/`sortByUrgency` (disabled applicable types included with `enabled: false`, `status: null`); and `loadSummaries(tx, userId)` returning `Map<vehicleId, VehicleMaintenanceSummaryDto>` with one query over estimates + settings for all the user's vehicles, using today in the request's `X-Timezone` (see `backend/src/middleware/timezone.ts`)
- [X] T015 Add `maintenance` summary to every `VehicleDto` returned by `backend/src/modules/vehicles/vehicles.service.ts` and `vehicle.mapper.ts` (list, get, create, update) and by the readings endpoints (`ReadingResultDto.vehicle`, delete response), using `loadSummaries` (no N+1) and today in the request's `X-Timezone` (see `backend/src/middleware/timezone.ts`)

- [X] T016 Create `backend/src/middleware/timezone.ts` that validates the `X-Timezone` header against `Intl.supportedValuesOf('timeZone')` (fallback `UTC`) and sets a typed `req.timeZone` (extend `backend/src/types/express.d.ts`); mount it in `backend/src/app.ts` before the v1 routers; send the header from `apiFetch` in `frontend/src/lib/api.ts` (research R7)

### Frontend base

- [X] T017 [P] Create `frontend/src/app/persist.ts` persisting the TanStack Query cache in IndexedDB (`idb-keyval` store `car-checkup-query-cache`, `maxAge` 7 days, `buster` = app version) for query keys starting with `vehicles`, `vehicle`, `maintenance`; wrap `frontend/src/app/providers.tsx` with `PersistQueryClientProvider`; clear the persisted cache in `signOut` (`frontend/src/features/auth/AuthProvider.tsx`) (research R10)
- [X] T018 [P] Add maintenance copy to `frontend/src/i18n/es.ts`: for each of the 13 codes a plain-language `name` and `why` description (e.g. `OIL_CHANGE`: "Cambio de aceite y filtro" / "El aceite protege el motor del desgaste; con el uso pierde sus propiedades."; `TIMING_BELT` notes some engines use a chain and the item can be disabled), status labels ("Vencido", "Próximo", "Al día"), "Todo al día", disclaimer "Intervalos generales; si tu manual indica otros, puedes cambiarlos.", and `ReadingSource` label `SERVICE` "Al registrar un servicio"

**Checkpoint**: El motor calcula y persiste estimaciones en cada cambio; el API de vehículos expone el resumen.

---

## Phase 3: User Story 1 - Ver qué mantenimiento toca y cuándo (Priority: P1) 🎯 MVP

**Goal**: Alertas explicables en la pantalla principal, detalle completo, posponer y marcas en el selector.

**Independent Test**: Quickstart escenarios 1–5, 12, 15 y 16.

- [X] T019 [US1] Implement `getVehicleMaintenance(userId, vehicleId)` in `backend/src/modules/maintenance/maintenance.service.ts` (404 if not owned) and `GET /vehicles/:vehicleId/maintenance` in `backend/src/modules/maintenance/maintenance.routes.ts`; mount in `backend/src/app.ts`
- [X] T020 [US1] Implement `updateMaintenanceSetting(userId, vehicleId, typeCode, input)` in `backend/src/modules/maintenance/maintenance.service.ts` handling `snooze` (true → `snoozedUntil = hoy + 7 días`, false → null) via upsert of `VehicleMaintenanceSetting`, returning `VehicleMaintenanceDto`; route `PATCH /vehicles/:vehicleId/maintenance/:typeCode` (FR-007a)
- [X] T021 [P] [US1] Unit tests in `packages/shared/tests/maintenance.test.ts` for pace (window, fallback, usage defaults 30/60/40, 0 km/day), interval (city 10.000 → 8.000, custom not adjusted), applicability (electric excludes oil/engine filter/coolant/spark plugs/timing belt/transmission; unknown fuel excludes spark plugs), estimate (km vs time limiting factor, registration baseline 45.000 → 55.000) and status thresholds (1.000 km / 30 days, overdue by km and by time, snooze), and SC-004: with daily readings at a constant 40 km/day over 120 days, the estimated date for the oil change differs < 15 days from the day the simulated odometer reaches `dueKm`
- [X] T022 [P] [US1] Integration tests in `backend/tests/integration/maintenance.test.ts`: new vehicle → all OK and oil `dueKm` 55.000; usage CITY → 53.000; fuel ELECTRIC → excluded types; reading 54.500 → UPCOMING; 55.500 → OVERDUE with `remainingKm` −500; summary counts in `GET /vehicles`; snooze hides from summary; other user → 404
- [X] T023 [P] [US1] Create `frontend/src/features/maintenance/api.ts`: `useVehicleMaintenance(vehicleId)` (key `['maintenance', vehicleId]`; re-derives status with `deriveItem` and today's date when served from persisted cache) and `useUpdateMaintenanceSetting(vehicleId)` (updates `['maintenance', vehicleId]` and invalidates `['vehicles']`); invalidate `['maintenance', vehicleId]` from the reading mutations and sync results in `frontend/src/features/readings/api.ts` and `frontend/src/offline/sync.ts`
- [X] T024 [P] [US1] Create `frontend/src/features/maintenance/explain.ts` composing the explanation sentences from a `MaintenanceItemDto` + `PaceDto` (research R11: interval and its source, baseline and its source, current km, pace and its source, limiting factor, "no sustituye el manual", and the zero-pace sentence "El vehículo no se ha movido según tus lecturas; la fecha dependerá de cuándo vuelvas a usarlo") and unit tests in `frontend/tests/unit/explain.test.ts`
- [X] T025 [US1] Create `frontend/src/features/maintenance/ExplanationSheet.tsx` (bottom `Sheet` with `why` text and the `explain.ts` sentences)
- [X] T026 [US1] Create `frontend/src/features/maintenance/MaintenanceAlerts.tsx`: up to 3 non-snoozed OVERDUE/UPCOMING items by urgency, each with name, status chip (danger/warning tokens), "Faltan 500 km" / "Te pasaste 2.500 km", estimated date ("hacia el 12 mar 2027"; when `estimatedDueAt` is null "Sin fecha estimada: depende de cuánto uses el vehículo"), actions "¿Por qué?" (ExplanationSheet) and "Recuérdamelo en una semana"; if none: "Todo al día" + next item (name and date) and link "Ver todos" to `/vehicles/:id/maintenance` (FR-007, FR-007a, US1-1..US1-4, US1-8, US1-11)
- [X] T027 [US1] Create `frontend/src/features/maintenance/MaintenanceDetailPage.tsx` (route `/vehicles/:id/maintenance`, lazy in `frontend/src/app/router.tsx`): all enabled applicable items sorted by urgency with status, km and date ("Sin fecha estimada: depende de cuánto uses el vehículo" when `estimatedDueAt` is null), "pospuesto hasta <fecha>" when snoozed, "¿Por qué?" per item, and the disclaimer (FR-009)
- [X] T028 [US1] Integrate `MaintenanceAlerts` below the active vehicle card in `frontend/src/features/home/HomePage.tsx`
- [X] T029 [US1] Add maintenance badges to `frontend/src/features/vehicles/VehicleSwitcher.tsx`: danger badge with `overdueCount` when > 0, else discreet warning dot when `upcomingCount` > 0, with accessible text ("2 mantenimientos vencidos") (FR-007b)
- [X] T030 [US1] E2E in `frontend/tests/e2e/maintenance.spec.ts` for quickstart scenarios 1–5, 12, 15 and 16
- [X] T031 [US1] UX/UI review of MaintenanceAlerts, ExplanationSheet, MaintenanceDetailPage and switcher badges (light/dark screenshots via `frontend/tests/e2e/ux-screens.spec.ts`), recorded in `specs/002-maintenance-estimation/checklists/ux-review.md` under "US1"

**Checkpoint**: MVP: el usuario ve qué toca, cuándo y por qué.

---

## Phase 4: User Story 2 - Registrar que hice un mantenimiento (Priority: P1)

**Goal**: "Ya lo hice" en 2 toques, varios servicios por visita, lectura automática si el km del taller es mayor, historial de servicios editable.

**Independent Test**: Quickstart escenarios 6–9.

- [X] T032 [US2] Implement `createService(userId, vehicleId, input)` in `backend/src/modules/services/services.service.ts`: ownership (404); idempotent by `id` (same vehicle/performedAt/odometerKm/typeCodes → 200 replay, else `409 ID_CONFLICT`); `performedAt` not future (5-min tolerance); in one transaction with `lockVehicle`: `findNeighbors`/`checkOrder` against OK readings at `performedAt` (→ `422 READING_OUT_OF_ORDER` with `validRange`); if `odometerKm > currentOdometerKm` and `performedAt ≥ lastReadingAt`: `isUnusual` check unless `confirmedUnusual` (→ `409 UNUSUAL_DISTANCE`) and create `MileageReading` (`source = SERVICE`, `origin = ONLINE`, `readAt = performedAt`) linked via `readingId`; insert record + items; clear `snoozedUntil` for its types; `recalculateVehicleOdometer` + `recomputeVehicleMaintenance`; return `ServiceResultDto` (FR-010..FR-012a)
- [X] T033 [US2] Implement `listServices` (keyset on `performedAt DESC, id DESC`), `updateService` (re-validate as in T032; update or delete the linked reading when km/date change so it stays consistent, create one if the new km now exceeds the current) and `deleteService` (delete the linked reading if still linked, unless it is the vehicle's last OK reading, in which case unlink it) in `backend/src/modules/services/services.service.ts`, each followed by odometer + maintenance recompute (FR-013, FR-014)
- [X] T034 [US2] Create `backend/src/modules/services/services.routes.ts` with `GET/POST /vehicles/:vehicleId/services` and `PATCH/DELETE /vehicles/:vehicleId/services/:serviceId` per `contracts/openapi.yaml` and mount it in `backend/src/app.ts`
- [X] T035 [P] [US2] Integration tests in `backend/tests/integration/services.test.ts`: oil overdue → service today → OK from new baseline; multiple types in one record; km above current creates SERVICE reading and updates odometer; out-of-order km → 422 with range; unusual → 409 then confirmed; idempotent replay; delete restores registration baseline and removes the generated reading; other user → 404
- [X] T036 [P] [US2] Create `frontend/src/features/services/api.ts`: `useServicesInfinite(vehicleId)`, `useCreateService`, `useUpdateService`, `useDeleteService` (update `['maintenance', vehicleId]` from the result, replace the vehicle in `['vehicles']`, invalidate `['readings', vehicleId]` and `['services', vehicleId]`)
- [X] T037 [US2] Create `frontend/src/features/maintenance/RecordServiceSheet.tsx`: opened with the tapped type preselected, date "hoy" (optional "Fue otro día" date input ≤ today) and km = current odometer (editable, `parseKmInput`), other types as toggle chips, optional notes (≤ 500), single "Guardar" (2 taps total, FR-010); id generated once per sheet with `crypto.randomUUID()`; handles `READING_OUT_OF_ORDER` (range message), `UNUSUAL_DISTANCE` (ConfirmDialog → resend with `confirmedUnusual`) and offline/`NetworkError`: keep every field and the same `id`, show "Sin conexión: guardaremos el servicio cuando vuelvas a tener señal" with a "Reintentar" button, and retry automatically on the `online` event while the sheet is open (idempotent by `id`, FR-010)
- [X] T038 [US2] Add "Ya lo hice" to each item in `frontend/src/features/maintenance/MaintenanceAlerts.tsx` and `MaintenanceDetailPage.tsx` opening `RecordServiceSheet`
- [X] T039 [US2] Create `frontend/src/features/services/ServicesHistoryPage.tsx` (route `/vehicles/:id/services`, lazy): newest first with date, km, maintenance names, notes and "también se registró como lectura" when `createdReading`; tap → edit in `RecordServiceSheet` (edit mode) with delete + ConfirmDialog; link from `MaintenanceDetailPage.tsx`
- [X] T040 [US2] Show the `SERVICE` reading source label in `frontend/src/features/readings/HistoryPage.tsx`
- [X] T041 [US2] Extend `frontend/tests/e2e/maintenance.spec.ts` with quickstart scenarios 6–9 (asserting 2 taps for "Ya lo hice")
- [X] T042 [US2] UX/UI review of RecordServiceSheet and ServicesHistoryPage in `specs/002-maintenance-estimation/checklists/ux-review.md` under "US2"

**Checkpoint**: US1 + US2 cubren el ciclo completo (ver → hacer → reiniciar).

---

## Phase 5: User Story 3 - Indicar el historial previo de mantenimientos (Priority: P2)

**Goal**: Afinar el punto de partida con fecha y/o km aproximados, o "No lo sé".

**Independent Test**: Quickstart escenarios 10–11.

- [X] T043 [US3] Handle `priorHistory` in `updateMaintenanceSetting` (`backend/src/modules/maintenance/maintenance.service.ts`): object → validate `km ≤ currentOdometerKm` and `date ≤ hoy` (422 with field codes), set `priorKm`/`priorDate`, `priorUnknown = false`; `"UNKNOWN"` → clear km/date, `priorUnknown = true`; `null` → clear all three; then `recomputeVehicleMaintenance` (FR-016)
- [X] T044 [P] [US3] Add prior-history cases to `backend/tests/integration/maintenance.test.ts` (date only 10 months ago → UPCOMING by time with `limitingFactor` TIME; km only; UNKNOWN → `askHistory` false; invalid km/date → 422) and to `packages/shared/tests/maintenance.test.ts` (interpolation/extrapolation in `baseline.ts`)
- [X] T045 [US3] Create `frontend/src/features/maintenance/PriorHistorySheet.tsx`: "¿Cuándo se hizo por última vez?" with optional month/year (`type="month"`, max current month → stored as the 15th of that month, or today if that would be in the future) and optional approximate km, "Guardar" and "No lo sé" (FR-016, US3-2, US3-3)
- [X] T046 [US3] Show "Indicar cuándo se hizo" when `askHistory` in `MaintenanceAlerts.tsx`, `MaintenanceDetailPage.tsx` and `ExplanationSheet.tsx`, opening `PriorHistorySheet` (US3-1)
- [X] T047 [US3] Extend `frontend/tests/e2e/maintenance.spec.ts` with quickstart scenarios 10–11
- [X] T048 [US3] UX/UI review of PriorHistorySheet in `specs/002-maintenance-estimation/checklists/ux-review.md` under "US3"

---

## Phase 6: User Story 4 - Ajustar mantenimientos a mi vehículo (Priority: P3)

**Goal**: Intervalos personalizados, volver al recomendado, desactivar/reactivar.

**Independent Test**: Quickstart escenarios 13–14.

- [X] T049 [US4] Handle `customIntervalKm`, `customIntervalMonths`, `resetInterval` (both custom → null) and `enabled` in `updateMaintenanceSetting` (`backend/src/modules/maintenance/maintenance.service.ts`); any of them clears `snoozedUntil`; recompute (disabled types get no estimate row) (FR-018)
- [X] T050 [P] [US4] Add customization cases to `backend/tests/integration/maintenance.test.ts`: custom 15.000 km → `interval.source` CUSTOM and not city-adjusted; reset → DEFAULT/CITY_ADJUSTED; disable → `enabled: false`, `status: null`, excluded from summary; re-enable; out-of-range custom → 422
- [X] T051 [US4] Create `frontend/src/features/maintenance/MaintenanceSettingsSheet.tsx`: numeric km and months fields prefilled with the applied interval (hint with the recommended values), "Guardar", "Volver al recomendado" (only when CUSTOM) and "No aplica a mi vehículo" (disable); validation with `MaintenanceSettingUpdateSchema` and plain-language messages
- [X] T052 [US4] In `frontend/src/features/maintenance/MaintenanceDetailPage.tsx` add an "Ajustar" action per item opening `MaintenanceSettingsSheet`, and a collapsed "Desactivados" section listing disabled items with "Reactivar"
- [X] T053 [US4] Extend `frontend/tests/e2e/maintenance.spec.ts` with quickstart scenarios 13–14
- [X] T054 [US4] UX/UI review of MaintenanceSettingsSheet and the disabled section in `specs/002-maintenance-estimation/checklists/ux-review.md` under "US4"

---

## Phase 7: Polish & Cross-Cutting Concerns

- [X] T055 Add quickstart scenario 17 (offline reload shows cached vehicles, km and maintenance; registering a service offline keeps the form and saves it once back online without duplicates) to `frontend/tests/e2e/maintenance.spec.ts`
- [X] T056 [P] Extend `backend/prisma/seed/perf-seed.ts` with 10 service records per vehicle and recompute, then measure `GET /v1/vehicles` and `GET /v1/vehicles/:id/maintenance` latency (SC-006) and record the result in `specs/002-maintenance-estimation/tasks.md` notes
- [X] T057 [P] Create `backend/prisma/seed/recompute-all.ts`: iterate vehicles in batches of 500 ordered by id (keyset), call `recomputeVehicleMaintenance` per vehicle in its own transaction, idempotent and resumable (`--after <vehicleId>`), logging progress; add script `db:recompute-maintenance` to `backend/package.json`
- [X] T058 [P] Update `README.md` (new endpoints, applying migrations to the test/e2e databases, maintenance catalog is seeded by migration, and the rule "after any migration that changes `maintenance_types`, run `npm run db:recompute-maintenance -w backend`")
- [X] T059 Final cross-screen UX/UI consistency pass (tokens, copy tone, dark mode) consolidating the per-story reviews in `specs/002-maintenance-estimation/checklists/ux-review.md`
- [X] T060 Run `npm run typecheck`, `npm run lint`, `npm test` and `npm run test:e2e` at the repo root and fix any failures
- [X] T061 Execute all scenarios in `specs/002-maintenance-estimation/quickstart.md` (1–18 + performance) on a mobile viewport and record results

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)** → **Foundational (Phase 2)** → historias
- **US1 (P1)**: depende de Foundational
- **US2 (P1)**: depende de Foundational; T038 añade "Ya lo hice" a componentes de US1 (T026, T027)
- **US3 (P2)**: depende de US1 (T020 endpoint de configuración, T026/T027 donde se muestra la acción)
- **US4 (P3)**: depende de US1 (T020, T027)
- **Polish**: depende de las historias que se entreguen

```text
Setup → Foundational ─┬─► US1 (P1) ─┬─► US3 (P2)
                      │             ├─► US4 (P3)
                      └─► US2 (P1) ─┘ (T038 integra en componentes de US1)
```

### Within Each User Story

- Backend service → rutas → tests de integración; hooks de API → componentes → integración en pantallas → e2e → revisión UX
- `maintenance.service.ts` (T019, T020, T043, T049) y `MaintenanceDetailPage.tsx` (T027, T038, T046, T052) se tocan en varias historias: hacerlo en ese orden, no en paralelo

### Parallel Opportunities

- Phase 2: T004, T005, T006 en paralelo; T017 y T018 en paralelo con todo el bloque backend
- US1: T021, T022, T023, T024 en paralelo tras T019/T020
- US2: T035 y T036 en paralelo tras T034
- US3/US4: tests T044/T050 en paralelo con sus componentes
- Polish: T056, T057 y T058 en paralelo

---

## Parallel Example: User Story 1

```bash
Task: "Unit tests in packages/shared/tests/maintenance.test.ts"
Task: "Integration tests in backend/tests/integration/maintenance.test.ts"
Task: "Create frontend/src/features/maintenance/api.ts"
Task: "Create frontend/src/features/maintenance/explain.ts + tests"
```

## Parallel Example: User Story 2

```bash
Task: "Integration tests in backend/tests/integration/services.test.ts"
Task: "Create frontend/src/features/services/api.ts"
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Phase 1 + Phase 2 (motor y recalculo)
2. Phase 3 (US1): alertas, explicación, detalle, posponer, marcas
3. **STOP and VALIDATE**: quickstart 1–5, 12, 15, 16

### Incremental Delivery

1. Foundation → US1 (MVP: ver qué toca)
2. US2 → ciclo completo; **recomendado como primer release** (sin registrar servicios las alertas quedarían vencidas para siempre)
3. US3 → mejor precisión inicial
4. US4 → personalización
5. Polish → offline, rendimiento, quickstart completo

---

## Notes

- [P] = archivos distintos, sin dependencias pendientes
- Las restricciones de campos entre comillas provienen literalmente de data-model.md
- Ningún tipo de dominio se escribe a mano fuera de `packages/shared` (Principio II)
- Commit tras cada tarea o grupo lógico; validar cada checkpoint antes de avanzar

## Implementation Notes (2026-10-20)

Verificado con: 41 unit tests (`packages/shared`, motor y reglas), 40 tests de integración del API
contra PostgreSQL, 5 unit tests del frontend y 16 escenarios e2e de Playwright (7 de esta feature,
quickstart 1–17; el 18 —404 entre usuarios— y el comportamiento de servicios se cubren en
integración). Desviaciones y hallazgos durante la implementación:

- **Estado "Próximo" por tiempo**: `deriveStatus` también considera la fecha límite por tiempo para
  el umbral de 30 días (un test unitario lo detectó).
- **Quickstart escenario 10 corregido**: con solo la fecha de hace 10 meses, el km de entonces se
  extrapola con el ritmo (~33.000 km) y el aceite sale "Vencido" por km; el escenario ahora indica
  fecha + km (44.000) para el caso "límite por tiempo".
- **Perfil atómico**: `ensureProfile` usa `INSERT … ON CONFLICT DO NOTHING`; con el nuevo
  refresco tras restaurar la caché, las primeras peticiones simultáneas de un usuario nuevo podían
  chocar en el `upsert` (500 intermitente en e2e).
- **Caché persistente**: tras restaurarla se invalidan las consultas (la copia en IndexedDB puede
  ir hasta 1 s por detrás) y las pantallas muestran los datos en caché aunque falle el refresco.
- **Servicios sin conexión**: TanStack pausa la mutación y la reanuda al volver la conexión; la
  hoja lo muestra como "Sin conexión: guardaremos el servicio…" (mismo `id`, sin duplicados).
- **Filtro `X-Timezone`**: validado con `Intl.DateTimeFormat` (acepta todos los nombres IANA y
  `UTC`) en lugar de `Intl.supportedValuesOf`.
- **Rendimiento (T056)** con 20 vehículos × 1.000 lecturas × 10 servicios: `GET /v1/vehicles`
  p50 16 ms / p95 27 ms; `GET /maintenance` p50 4 ms / p95 6 ms (SC-006 ✓). Recalcular un
  vehículo: p50 23 ms / p95 34 ms, por encima del objetivo interno de 5 ms del plan (domina la
  carga de 1.000 lecturas); no afecta a SC-006, se puede optimizar cargando solo la ventana de
  lecturas necesaria.
- **Revisión UX**: 3 hallazgos corregidos (ver `checklists/ux-review.md`).
- **No verificado**: dispositivos físicos iOS/Android (igual que en 001).

