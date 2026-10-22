---

description: "Task list for 003-email-reminders"
---

# Tasks: Recordatorios por Notificación Push y Correo

**Input**: Design documents from `specs/003-email-reminders/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/openapi.yaml,
contracts/notifications.md, quickstart.md. Builds on the implemented 001 and 002.

**Tests**: La spec no pide TDD; research R13 define la estrategia de pruebas (reglas puras,
proceso completo con emisores falsos, endpoints públicos, e2e de los flujos de UI), así que se
incluyen tareas de tests en cada historia, después de la implementación.

**Organization**: Tasks are grouped by user story to enable independent implementation and testing of each story.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: US1 (avisos de mantenimiento, P1), US2 (correo en el alta + permiso push, P1),
  US3 (aviso de kilometraje, P2), US4 (baja del correo, P2)
- Rutas según plan.md: `backend/`, `frontend/`, `packages/shared/`

---

## Phase 1: Setup (Shared Infrastructure)

- [ ] T001 Add dependencies and install at the repo root: `web-push`, `resend`, `svix` (and `@types/web-push` as dev) to `backend/package.json`; `workbox-precaching`, `workbox-routing` to `frontend/package.json`
- [ ] T002 [P] Document the new variables in `backend/.env.example` (`APP_URL`, `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT` "mailto:…", `EMAIL_PROVIDER` "resend|log", `EMAIL_FROM`, `RESEND_API_KEY`, `RESEND_WEBHOOK_SECRET`, `UNSUBSCRIBE_SECRET` and `JOBS_SECRET` "≥ 32 caracteres") and `frontend/.env.example` (`VITE_VAPID_PUBLIC_KEY`), with a comment on `npx web-push generate-vapid-keys`

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Modelo de datos, configuración, emisores intercambiables, suscripción push y service worker que usan todas las historias

**⚠️ CRITICAL**: No user story work can begin until this phase is complete

### Datos

- [ ] T003 Extend `backend/prisma/schema.prisma` per data-model.md: enums `EmailStatus {OK BOUNCED COMPLAINED}`, `NoticeKind {MAINTENANCE_UPCOMING MAINTENANCE_OVERDUE MILEAGE_UPDATE}`, `NotifiedStatus {UPCOMING OVERDUE}`, `DeliveryChannel {PUSH EMAIL}`, `DeliveryStatus {SENT FAILED EXPIRED BOUNCED COMPLAINED}`; `Profile` + `email String?`, `timeZone String @default("America/Mexico_City")`, `nextDigestAt Timestamptz` (index), `emailStatus @default(OK)`, `emailUnsubscribedAt Timestamptz?`; `Vehicle` + `emailReminders Boolean @default(false)`, `lastKmReminderAt Timestamptz?`; models `PushSubscription` (`endpoint` unique "≤ 2.048 caracteres", `p256dh` "≤ 200", `auth` "≤ 100", `userAgent?` "≤ 300", `createdAt`, `lastSuccessAt?`, `lastFailureAt?`, FK user `CASCADE`), `MaintenanceNoticeState` (PK `[vehicleId, typeCode]`, `cycleSignature`, `lastNotifiedStatus NotifiedStatus?`, `updatedAt`, FK vehicle `CASCADE`), `Notice` (`kind`, `typeCode MaintenanceTypeCode?` "null para MILEAGE_UPDATE", `cycleKey`, `remainingKm Int?`, `overdueDays Int?`, `estimatedDueAt Timestamptz?`, `createdAt`, `deliveredAt Timestamptz?`, FKs user/vehicle `CASCADE`, indexes `(userId, deliveredAt)` and `(createdAt)`), `Delivery` (`channel`, `digestDate @db.Date`, `target` "id de la suscripción push o `email`", `status`, `providerMessageId?` (index), `error String? @db.VarChar(500)`, `createdAt` (index), unique `(userId, channel, digestDate, target)`, FK user `CASCADE`), `DeliveryNotice` (PK `[deliveryId, noticeId]`, both `CASCADE`)
- [ ] T004 Create migration `backend/prisma/migrations/<timestamp>_reminders/migration.sql` (`--create-only`), then append: unique index `notices (vehicle_id, kind, type_code, cycle_key) NULLS NOT DISTINCT` (idempotencia, FR-013); backfill `profiles.next_digest_at` to the next 09:00 in `America/Mexico_City` for existing rows; `ENABLE ROW LEVEL SECURITY` on the 5 new tables; apply to `car_checkup_dev`, `car_checkup_test`, `car_checkup_e2e` and regenerate the client

### Compartido

- [ ] T005 [P] Implement `packages/shared/src/reminders/schedule.ts`: `nextDigestAt(timeZone, now, hour = 9)` returning the next instant at 09:00 local strictly after `now` (correct across DST changes) and `localDate(timeZone, instant)`; export from `packages/shared/src/reminders/index.ts` and add `"./reminders"` to `packages/shared/package.json` exports
- [ ] T006 [P] Create `packages/shared/src/schemas/notifications.ts` (Zod): `PushSubscriptionCreateSchema` (`endpoint` https URL "≤ 2.048", `keys.p256dh` "≤ 200", `keys.auth` "≤ 100", `userAgent` "≤ 300" nullable optional), `PushSubscriptionDeleteSchema`, `UnsubscribeSchema` (`token` "≤ 200"), `ResendWebhookSchema` (discriminated by `type`: `email.bounced` with `data.email_id` and `data.bounce.type`, `email.complained` with `data.email_id`; other types passthrough), `JobQuerySchema` (`budgetMs` 1000–3.300.000); add `emailReminders: z.boolean()` (optional, default false on create) to `VehicleCreateSchema`/`VehicleUpdateSchema` in `packages/shared/src/schemas/vehicle.ts`; create `packages/shared/src/dto/notifications.ts` (`JobResultDto`, `UnsubscribeResultDto`) and extend `VehicleDto` (`emailReminders`) and `ProfileDto` (`emailStatus`, `emailUnsubscribed: boolean`)

### Backend base

- [ ] T007 Extend `backend/src/config/env.ts`: `APP_URL` (url), `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT` (`mailto:` or https), `EMAIL_PROVIDER` enum `resend|log` default `log`, `EMAIL_FROM`, `RESEND_API_KEY` and `RESEND_WEBHOOK_SECRET` (required when `EMAIL_PROVIDER=resend`), `UNSUBSCRIBE_SECRET` and `JOBS_SECRET` (min 32 chars); update `backend/vitest.config.ts` test env and `backend/.env` for local development
- [ ] T008 [P] Create `backend/src/lib/email/`: `email-sender.ts` (interface `EmailSender { send(message: { to; subject; html; text; headers }, options: { idempotencyKey }): Promise<{ providerMessageId: string }> }`), `log-email-sender.ts` (logs and keeps sent messages in memory for tests), `resend-email-sender.ts` (Resend SDK with `Idempotency-Key`, maps errors to a typed `EmailSendError`), `index.ts` factory by `EMAIL_PROVIDER` (research R3)
- [ ] T009 [P] Create `backend/src/lib/push/`: `push-sender.ts` (interface `PushSender { send(subscription, payload): Promise<'sent' | 'expired' | 'failed'> }`), `web-push-sender.ts` (`web-push` with VAPID details, TTL 24 h, urgency normal; `404`/`410` → `'expired'`), `fake-push-sender.ts` (records payloads; configurable expired endpoints), `index.ts` factory (research R1)
- [ ] T010 [P] Create `backend/src/lib/unsubscribe-token.ts`: `createUnsubscribeToken(userId)` = `base64url(userId) + "." + base64url(HMAC-SHA256(UNSUBSCRIBE_SECRET, "unsub:" + userId))` and `verifyUnsubscribeToken(token): string | null` with `timingSafeEqual` (research R10)
- [ ] T011 Store notification profile data: in `backend/src/middleware/auth.ts` also expose the JWT `email` claim as `req.userEmail`; in `backend/src/modules/profile/profile.service.ts` `ensureProfile` saves `email` when it changed; in `backend/src/middleware/timezone.ts` persist `profile.timeZone` and recompute `nextDigestAt` (T005) when the header differs from the stored zone (per-instance cache to avoid writes on every request); profile creation sets `nextDigestAt` (FR-019, research R6, R9)
- [ ] T012 Add `emailReminders` to vehicle create/update/DTO (`backend/src/modules/vehicles/vehicles.service.ts`, `vehicle.mapper.ts`) and `emailStatus`/`emailUnsubscribed` to `GET /v1/me` (`backend/src/modules/profile/profile.service.ts`)
- [ ] T013 Create `backend/src/modules/notifications/push-subscriptions.routes.ts` with `POST /v1/push-subscriptions` (upsert by `endpoint`, reassigning it to the current user, `201`) and `DELETE /v1/push-subscriptions` (by endpoint of the current user, `204`); mount in `backend/src/app.ts`

### Frontend base

- [ ] T014 Switch `frontend/vite.config.ts` to `strategies: 'injectManifest'` with `srcDir: 'src'`, `filename: 'sw.ts'`, and create `frontend/src/sw.ts`: `precacheAndRoute(self.__WB_MANIFEST)`, navigation fallback to `/index.html` except `/v1/`, `/public/`, `/webhooks/`; `push` handler showing `payload.title`/`body` with `tag`, icon `/icons/pwa-192x192.png`, `data.url` (no `actions`); `notificationclick` focusing an open window and navigating to `data.url`, else `clients.openWindow`; add `frontend/tsconfig.sw.json` (lib `WebWorker`) included in typecheck (research R2); enable `devOptions: { enabled: true, type: 'module', navigateFallback: 'index.html' }` so the service worker (and push) also works with `npm run dev`
- [ ] T015 [P] Create `frontend/src/features/notifications/push.ts`: `pushSupport()` (`supported` / `needs-install` for iOS Safari not standalone / `unsupported`), `notificationPermission()`, `subscribeToPush()` (request permission, `pushManager.subscribe({ userVisibleOnly: true, applicationServerKey })` with `VITE_VAPID_PUBLIC_KEY`, `POST /v1/push-subscriptions`), `unsubscribeFromPush()` called on sign-out in `frontend/src/features/auth/AuthProvider.tsx`; add `VITE_VAPID_PUBLIC_KEY` to `frontend/src/lib/env.ts` (research R11)
- [ ] T016 Preserve the target after login: `frontend/src/features/auth/RequireAuth.tsx` stores the requested path (pathname + search) in `sessionStorage` before redirecting to `/login`; `frontend/src/features/auth/LoginPage.tsx` passes it as `emailRedirectTo` (`<origin><path>`) and, when already signed in, navigates to the stored path; only same-origin relative paths starting with `/` are accepted (FR-012)
- [ ] T017 [P] Add notification copy to `frontend/src/i18n/es.ts`: email toggle label and hint ("Las notificaciones en el teléfono se envían siempre"), permission explanation, iPhone install steps, "¿Quieres recibir los avisos por correo?", enable-on-this-device button, unsubscribe page texts, invalid-email banner

**Checkpoint**: Datos, configuración, emisores, suscripción y service worker listos.

---

## Phase 3: User Story 1 - Recibir un aviso cuando un mantenimiento se acerca o vence (Priority: P1) 🎯 MVP

**Goal**: Proceso horario que genera avisos únicos por ciclo y los entrega agrupados por push y, si corresponde, por correo.

**Independent Test**: Quickstart escenarios 5–9 (con emisores falsos en local).

- [ ] T018 [P] [US1] Implement `packages/shared/src/reminders/notices.ts`: `cycleSignature(estimate)` = `baselineSource|baselineKm|baselineAt|intervalKm|intervalMonths`; `decideMaintenanceNotices({ estimates, settings, states, currentOdometerKm, today, timeZone })` → `{ notices, nextStates }` per research R7 (reset only on signature change — a transient `OK` with the same signature does not reset; `UPCOMING` once; `OVERDUE` once even if `UPCOMING` was skipped; skip snoozed/disabled)
- [ ] T019 [P] [US1] Implement `packages/shared/src/reminders/digest.ts`: `sortNotices` (overdue, upcoming, mileage), `buildPushPayload(notices, vehicles, localDate)` and `pushUrl` exactly as in `contracts/notifications.md` (vehicle name = nickname or "make model", never the plate, "Y N avisos más", `tag` = `digest-<date>`), `selectEmailNotices(notices, vehicles)` (only `emailReminders` vehicles, max 10, grouped by vehicle)
- [ ] T020 [P] [US1] Unit tests in `packages/shared/tests/reminders.test.ts`: `nextDigestAt` (before/after 09:00, Madrid DST change, Mexico City), cycle transitions (upcoming → overdue once, reset after service, prior history or interval change, upcoming → OK → upcoming with the same signature → a single notice, snoozed skipped), payload texts and URLs for each case, email selection and 10-item cap
- [ ] T021 [US1] Create `backend/src/lib/email/templates.ts`: `renderDigestEmail({ userVehicles, notices, appUrl, unsubscribeUrl })` → `{ subject, html, text }` per `contracts/notifications.md` (≤ 600 px, inline styles with app tokens, HTML-escaped dynamic text, "por qué importa" texts, "Ver en Car Checkup" button, "Y N avisos más", footer with unsubscribe link and push note) and `listUnsubscribeHeaders(token)`
- [ ] T022 [US1] Implement `backend/src/modules/reminders/run-reminders.ts`: `runReminders({ now, budgetMs, emailSender, pushSender })`: loop until budget: claim a batch of ≤ 500 profiles with `nextDigestAt <= now` via `UPDATE … SET next_digest_at = <next 09:00> WHERE id IN (SELECT … FOR UPDATE SKIP LOCKED) RETURNING`; per user (own transaction): load vehicles, estimates, settings, notice states; `decideMaintenanceNotices`; `createMany` notices with `skipDuplicates`; collect undelivered notices; push to each subscription with a `Delivery` row per `(userId, PUSH, digestDate, subscriptionId)` (skip if exists; `expired` → delete subscription); email if eligible (`emailStatus = OK`, not unsubscribed, `email` present, notices of email vehicles) with idempotency key `digest:<userId>:<date>` and `Delivery (EMAIL, 'email')`; set `deliveredAt` when any channel succeeded; on total failure set `nextDigestAt = now + 1 h` if still the same local day (FR-001..FR-004, FR-009..FR-013, FR-016, FR-017); return `JobResultDto` with `hasMore`; concurrency of sends limited to 20
- [ ] T023 [US1] Create triggers: `backend/src/modules/reminders/jobs.routes.ts` with `POST /internal/jobs/reminders` (Bearer `JOBS_SECRET`, timing-safe compare, `budgetMs` query) mounted in `backend/src/app.ts` outside `/v1` auth; CLI `backend/src/jobs/reminders.ts` and script `job:reminders` in `backend/package.json` (research R5)
- [ ] T024 [P] [US1] Integration tests in `backend/tests/integration/reminders.test.ts` using `LogEmailSender`/`FakePushSender`: upcoming oil → 1 push to each subscription + 1 email only when `emailReminders`; second run same day → 0 sends; overdue next day → 1 notice, following day → none; snoozed excluded; service registered and new cycle → new notice; `410` deletes subscription; `nextDigestAt` advanced to next 09:00 local; job endpoint rejects a wrong secret
- [ ] T025 [US1] UX review of the email (render a sample with 3 vehicles to `specs/003-email-reminders/checklists/email-sample.html`, light/dark clients, mobile width) and of the push text, recorded in `specs/003-email-reminders/checklists/ux-review.md` under "US1"

**Checkpoint**: MVP: los avisos de mantenimiento llegan por push (y correo si está activado), sin duplicados.

---

## Phase 4: User Story 2 - Elegir el correo al registrar el vehículo y activar las notificaciones (Priority: P1)

**Goal**: Interruptor de correo en alta/edición y flujo de permiso con la pregunta de correo si se deniega.

**Independent Test**: Quickstart escenarios 1–4.

- [ ] T026 [US2] Add the "Recibir también los avisos por correo" switch (default off, hint that push is always sent) to `frontend/src/features/vehicles/VehicleForm.tsx` for create and edit, and send `emailReminders` from `NewVehiclePage.tsx`/`EditVehiclePage.tsx` (FR-007)
- [ ] T027 [US2] Create `frontend/src/features/notifications/NotificationsPrompt.tsx`: explanation sheet → `subscribeToPush()`; iPhone not installed → install steps; if permission denied/unsupported and the vehicle has no email → `ConfirmDialog` "¿Quieres recibir los avisos por correo?" → `PATCH /v1/vehicles/:id { emailReminders: true }`; afterwards set the per-device flag `car-checkup:notifications-prompted:<userId>` in `localStorage` (try/catch) so the explanation and permission request are not repeated; the email question is still asked on each new vehicle while push is not granted, and never outside vehicle registration (FR-008, FR-008a)
- [ ] T028 [US2] Trigger the prompt after creating a vehicle (navigate with state from `NewVehiclePage.tsx` to `/` and render `NotificationsPrompt` in `frontend/src/features/home/HomePage.tsx`) and once on app open for existing users with vehicles and no flag (`frontend/src/app/AppLayout.tsx`) (edge case "vehículos anteriores")
- [ ] T029 [US2] In `frontend/src/features/vehicles/EditVehiclePage.tsx` add "Activar notificaciones en este dispositivo" when permission is not granted (re-runs the subscription) (US2-6)
- [ ] T030 [P] [US2] Integration tests in `backend/tests/integration/push-subscriptions.test.ts` (create, reassign same endpoint to another user, delete, non-https endpoint → 422) and vehicle `emailReminders` default false / update
- [ ] T031 [US2] E2E in `frontend/tests/e2e/notifications.spec.ts`: switch visible and off by default; after saving with permission denied (headless default) → email question; "Sí" → vehicle has email on; "No" → no permission sheet on the next vehicle, but the email question is asked again for it ; plus a granted-permission case with `context.grantPermissions(['notifications'])` asserting `POST /v1/push-subscriptions` returns 201 (quickstart 1–4)
- [ ] T032 [US2] UX review of the switch, permission sheet and email question in `specs/003-email-reminders/checklists/ux-review.md` under "US2"

---

## Phase 5: User Story 3 - Recordarme actualizar el kilometraje (Priority: P2)

**Goal**: Aviso cada 30 días sin lecturas, que abre directamente la captura.

**Independent Test**: Quickstart escenario 10.

- [ ] T033 [P] [US3] Add `decideMileageNotice({ lastReadingAt, lastKmReminderAt, today, timeZone })` to `packages/shared/src/reminders/notices.ts` (≥ 30 días sin lectura válida y sin aviso en los últimos 30 días o desde la última lectura; `cycleKey` = fecha local) with unit tests in `packages/shared/tests/reminders.test.ts` (FR-005)
- [ ] T034 [US3] Include mileage notices in `backend/src/modules/reminders/run-reminders.ts` (same digest, update `Vehicle.lastKmReminderAt` when delivered) and the mileage block with "Actualizar kilometraje" button in `backend/src/lib/email/templates.ts`
- [ ] T035 [US3] Handle `?capture=<vehicleId>` in `frontend/src/features/home/HomePage.tsx`: set that vehicle active, open `QuickCaptureSheet`, then remove the query param (US3-4)
- [ ] T036 [P] [US3] Tests: mileage cases in `backend/tests/integration/reminders.test.ts` (30 días → aviso; no repetición antes de 30 días; mismo correo que los de mantenimiento) and e2e deep link `/?capture=<id>` in `frontend/tests/e2e/notifications.spec.ts`, including without session: `/?capture=<id>` → login → back to the capture

---

## Phase 6: User Story 4 - Dejar de recibir correos (Priority: P2)

**Goal**: Baja de un clic sin sesión con deshacer; rebotes y quejas.

**Independent Test**: Quickstart escenarios 11, 12 y 14.

- [ ] T037 [US4] Create `backend/src/modules/notifications/public.routes.ts`: `POST /public/unsubscribe` (token in JSON body or `token` query for RFC 8058 one-click; sets `emailUnsubscribedAt`) and `POST /public/resubscribe` (clears it); invalid token → `404`; mounted in `backend/src/app.ts` outside `/v1` with the IP rate limit (FR-014)
- [ ] T038 [US4] Create `backend/src/modules/notifications/webhooks.routes.ts`: `POST /webhooks/resend` with `express.raw` body, `svix` signature verification with `RESEND_WEBHOOK_SECRET` (`401` on failure), `ResendWebhookSchema` validation, `email.bounced` (permanent) → `emailStatus = BOUNCED`, `email.complained` → `COMPLAINED`, matching `Delivery.providerMessageId` and updating its status; `204` otherwise (FR-015, research R4)
- [ ] T039 [US4] Create `frontend/src/features/notifications/UnsubscribePage.tsx` (public lazy route `/unsubscribe` outside `RequireAuth` in `frontend/src/app/router.tsx`): shows a "Confirmar baja" button (never unsubscribes on page load, so link scanners cannot unsubscribe users) that calls `POST /public/unsubscribe` with a plain `fetch` (no Supabase session), then shows confirmation and "Deshacer"; invalid link message
- [ ] T040 [US4] Show a banner on `frontend/src/features/home/HomePage.tsx` when `profile.emailStatus !== 'OK'` ("No pudimos entregar correos a <email>; revísalo") (FR-015)
- [ ] T041 [P] [US4] Tests: `backend/tests/integration/notifications-public.test.ts` (unsubscribe via body and query, resubscribe, tampered token → 404, unsubscribed user gets push but no email, signed bounce webhook → BOUNCED and no more emails, bad signature → 401) and e2e unsubscribe page in `frontend/tests/e2e/notifications.spec.ts`
- [ ] T042 [US4] UX review of the unsubscribe page and invalid-email banner in `specs/003-email-reminders/checklists/ux-review.md` under "US4"

---

## Phase 7: Polish & Cross-Cutting Concerns

- [ ] T043 Implement `backend/src/modules/reminders/retention.ts` (batch delete `notices`/`deliveries` older than 12 months except notices whose `cycleKey` matches the current `maintenance_notice_states.cycleSignature`) called at the end of `runReminders`, with an integration test in `backend/tests/integration/reminders.test.ts` (FR-016)
- [ ] T044 [P] Create `backend/prisma/seed/reminders-load.ts` (N synthetic users with 1 vehicle due today each) and measure a full `runReminders` with fake senders for 100.000 users (SC-003: < 1 h), plus a run of 10.000 users with 3 concurrent `runReminders` processes to verify `SKIP LOCKED` claims each user exactly once and throughput does not degrade; record results in this file's notes
- [ ] T045 [P] Create `.github/workflows/reminders.yml` (hourly `schedule` at minute 5 + manual `workflow_dispatch`, `curl -fsS -X POST -H "Authorization: Bearer ${{ secrets.JOBS_SECRET }}" "${{ secrets.API_URL }}/internal/jobs/reminders?budgetMs=600000"`)
- [ ] T046 [P] Update `render.yaml` (new env vars with `sync: false`; commented paid `cron` service running `npm run job:reminders -w backend`) and `README.md` (variables, VAPID keys, Resend domain + webhook URL `/webhooks/resend`, scheduler options, `VITE_VAPID_PUBLIC_KEY` in Vercel)
- [ ] T047 Final cross-screen UX consistency pass in `specs/003-email-reminders/checklists/ux-review.md`
- [ ] T048 Run `npm run typecheck`, `npm run lint`, `npm test` and `npm run test:e2e` at the repo root and fix any failures
- [ ] T049 Execute `specs/003-email-reminders/quickstart.md` scenarios (local with fake senders; real push/email delivery on the deployed environment with physical devices) and record results

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup** → **Foundational** → historias
- **US1 (P1)**: depende de Foundational (suscripción push T013 y service worker T014 para recibir notificaciones reales)
- **US2 (P1)**: depende de Foundational; es independiente de US1 (sin US1 no hay avisos que recibir, pero el flujo de alta y permiso se prueba solo)
- **US3 (P2)**: depende de US1 (T022 proceso, T019/T021 digest y plantilla)
- **US4 (P2)**: depende de Foundational (token T010) y de US1 para el enlace de baja en el correo (T021)
- **Polish**: depende de las historias entregadas

```text
Setup → Foundational ─┬─► US1 (P1) ─┬─► US3 (P2)
                      │             └─► US4 (P2)
                      └─► US2 (P1)
```

### Within Each User Story

- Reglas puras (shared) → servicios/proceso (backend) → rutas → UI → tests → revisión UX
- `run-reminders.ts` (T022, T034, T043), `notices.ts` (T018, T033), `templates.ts` (T021, T034) y `HomePage.tsx` (T028, T035, T040) se tocan en varias historias: en ese orden, no en paralelo

### Parallel Opportunities

- Phase 2: T005, T006 en paralelo; T008, T009, T010 en paralelo tras T007; T015, T017 en paralelo con el backend
- US1: T018, T019, T020 en paralelo; T024 tras T022–T023
- US2: T030 en paralelo con la UI (T026–T029)
- Polish: T044, T045, T046 en paralelo

---

## Parallel Example: User Story 1

```bash
Task: "Implement packages/shared/src/reminders/notices.ts"
Task: "Implement packages/shared/src/reminders/digest.ts"
Task: "Unit tests in packages/shared/tests/reminders.test.ts"
```

## Parallel Example: Foundational

```bash
Task: "Create backend/src/lib/email/ (EmailSender, Log, Resend)"
Task: "Create backend/src/lib/push/ (PushSender, WebPush, Fake)"
Task: "Create backend/src/lib/unsubscribe-token.ts"
```

---

## Implementation Strategy

### MVP First

1. Setup + Foundational
2. US1 (proceso y entrega) + US2 (interruptor y permiso): sin US2 nadie tendría suscripción push ni correo activado en la app, así que el **primer release útil es US1 + US2**
3. **STOP and VALIDATE**: quickstart 1–9

### Incremental Delivery

1. US1 + US2 → avisos de mantenimiento funcionando
2. US4 → baja y rebotes (necesario antes de enviar correos reales a usuarios)
3. US3 → aviso de kilometraje
4. Polish → retención, carga, programador, despliegue

---

## Notes

- [P] = archivos distintos, sin dependencias pendientes
- Las restricciones de campos entre comillas provienen literalmente de data-model.md
- Ningún tipo de dominio se escribe a mano fuera de `packages/shared` (Principio II)
- Antes de enviar correos reales (Resend) a usuarios, US4 debe estar completa
