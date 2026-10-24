---

description: "Task list for 004-donations"
---

# Tasks: Donaciones con Stripe y PayPal

**Input**: Design documents from `specs/004-donations/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/openapi.yaml,
contracts/payments.md, quickstart.md. Builds on the implemented 001–003.

**Tests**: La spec no pide TDD; research R8 define la estrategia (reglas puras, webhooks firmados
con proveedor falso, e2e con la página local de checkout), así que se incluyen tareas de tests en
cada historia, después de la implementación.

**Organization**: Tasks are grouped by user story to enable independent implementation and testing of each story.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: US1 (donación única, P1), US2 (donación mensual, P2), US3 (historial y comprobante,
  P2), US4 (sin anuncios, P2), US5 (invitación discreta, P3)
- Rutas según plan.md: `backend/`, `frontend/`, `packages/shared/`

---

## Phase 1: Setup (Shared Infrastructure)

- [ ] T001 Add `stripe` to `backend/package.json` and install at the repo root (`npm install`); no new frontend dependencies
- [ ] T002 [P] Document the new variables in `backend/.env.example` (`STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `PAYPAL_CLIENT_ID`, `PAYPAL_CLIENT_SECRET`, `PAYPAL_WEBHOOK_ID`, `PAYPAL_ENV` sandbox|live, `PAYMENTS_PROVIDER_MODE` real|fake, `SUPPORT_EMAIL`) with comments on where to get each one

---

## Phase 2: Foundational (Blocking Prerequisites)

**⚠️ CRITICAL**: No user story work can begin until this phase is complete

### Datos

- [ ] T003 Extend `backend/prisma/schema.prisma` per data-model.md: enums `PaymentProvider {STRIPE PAYPAL}`, `DonationKind {ONE_TIME MONTHLY_CHARGE}`, `DonationStatus {PENDING CONFIRMED CANCELED FAILED REFUNDED DISPUTED}`, `SubscriptionStatus {PENDING ACTIVE PAST_DUE CANCELED}`; `Profile` + `adFreeUntil` (timestamptz, nullable) and `donationCardDismissedAt` (timestamptz, nullable); models `Donation` (`userId` nullable FK `ON DELETE SET NULL`, `amountCents` int "2.000–1.000.000", `currency` default `MXN`, `checkoutKey` UUID nullable with unique `(userId, checkoutKey)`, `providerCheckoutId`, `providerPaymentId` unique per provider, `subscriptionId` nullable FK, `periodStart`/`periodEnd` nullable, `adFreeDays` int, `confirmedAt`), `DonationSubscription` (`userId` nullable FK `ON DELETE SET NULL`, `checkoutKey` unique `(userId, checkoutKey)`, `providerSubscriptionId` unique nullable, `paidUntil`, `nextChargeAt`, `canceledAt`), `PayPalPlan` (PK `(amountCents, env)`, `planId`), `PaymentEvent` (PK `(provider, eventId)`, `type`, `donationId` nullable, `receivedAt`)
- [ ] T004 Create migration `backend/prisma/migrations/<timestamp>_donations/migration.sql` (`--create-only`), then append: partial unique index "una sola con estado ACTIVE/PAST_DUE por usuario" on `donation_subscriptions (user_id) WHERE status IN ('ACTIVE','PAST_DUE')`, CHECK `amount_cents BETWEEN 2000 AND 1000000` on both tables, RLS enabled on the 4 new tables; apply to dev, test and e2e databases

### Compartido

- [ ] T005 [P] Implement `packages/shared/src/donations/amounts.ts`: `DONATION_PRESETS = [50, 100, 200]`, `MIN_DONATION = 20`, `MAX_DONATION = 10000`, `toCents`, `adFreeDays(amountMxn) = floor(amount × 30 / 50)`; export from `packages/shared/src/donations/index.ts` and add `./donations` to `packages/shared/package.json` exports
- [ ] T006 [P] Implement `packages/shared/src/donations/benefit.ts`: `computeAdFreeUntil({ grants: {at, days}[], periods: {start, end}[], now })` per research R5 (grants add days from `max(grant date, current end)`, skipping days covered by monthly periods; returns `Date | null`)
- [ ] T007 [P] Create `packages/shared/src/schemas/donations.ts` (Zod): `DonationStartSchema` (`kind` ONE_TIME|MONTHLY, `amount` int 20–10000, `provider` STRIPE|PAYPAL, `checkoutKey` uuid) and `packages/shared/src/dto/donations.ts` (`DonationConfigDto`, `DonationStartResultDto`, `DonationResultDto`, `SubscriptionDto`, `DonationItemDto`, `DonationHistoryDto`) per contracts/openapi.yaml; extend `ProfileDto` with `adFreeUntil` and `showDonationCard`
- [ ] T008 [P] Unit tests in `packages/shared/tests/donations.test.ts`: `adFreeDays` (20→12, 50→30, 100→60, 10000→6000), `computeAdFreeUntil` (single grant, stacked grants, grant during a monthly period saved until it ends — Q2 example "30 jun + 50 MXN → 30 jul", refunded grant removed, expired benefit → null)

### Backend base

- [ ] T009 Extend `backend/src/config/env.ts` with the T002 variables (all optional; `PAYMENTS_PROVIDER_MODE` default `fake` outside production, `real` in production; `superRefine` error if `NODE_ENV=production` and `PAYMENTS_PROVIDER_MODE=fake`) and test values in `backend/vitest.config.ts` (`STRIPE_WEBHOOK_SECRET=whsec_test_…`, `PAYMENTS_PROVIDER_MODE=fake`, `SUPPORT_EMAIL=soporte@test.dev`)
- [ ] T010 Create `backend/src/lib/payments/payment-provider.ts` (interface: `createOneTimeCheckout`, `createSubscriptionCheckout`, `captureOrder?`, `cancelSubscription`, `verifyAndParseWebhook(rawBody, headers) → NormalizedEvent[]`) with a provider-agnostic `NormalizedEvent` union (`one_time_paid`, `one_time_canceled`, `one_time_failed`, `subscription_linked`, `subscription_charge_paid {periodStart, periodEnd, nextChargeAt}`, `subscription_charge_failed`, `subscription_canceled`, `payment_refunded`, `payment_disputed`, `dispute_closed {won}`), and `backend/src/lib/payments/fake-provider.ts` (redirect to `${APP_URL}/support/fake-checkout?...`, HMAC-signed fake webhooks)
- [ ] T011 Create `backend/src/modules/donations/benefit.service.ts`: `recalculateAdFree(tx, userId, now)` loads confirmed non-refunded/non-disputed one-time donations and monthly charge periods, calls `computeAdFreeUntil` and saves `profiles.adFreeUntil`
- [ ] T012 Create `backend/src/modules/donations/apply-event.ts`: `applyPaymentEvent(provider, eventId, type, event)` in one transaction: insert `PaymentEvent` (duplicate → no-op), apply the allowed transitions of data-model.md ("REFUNDED es final"; invalid transitions logged and ignored), call `recalculateAdFree`; return the confirmed donation ids so the caller sends thank-you emails after commit
- [ ] T013 Create `backend/src/modules/donations/webhooks.routes.ts` with `POST /webhooks/stripe` and `POST /webhooks/paypal` (`express.raw`, mounted before the JSON parser like `/webhooks/resend`): verify, normalize, `applyPaymentEvent`, respond 200 (duplicates too) or 400 on invalid signature; plus `POST /webhooks/fake` and the dev-only fake payment endpoint, mounted **only** when `PAYMENTS_PROVIDER_MODE=fake`; mount in `backend/src/app.ts`

### Frontend base

- [ ] T014 [P] Add donation copy to `frontend/src/i18n/es.ts` (`t.donations`: title "Apoya Car Checkup", why text, "Una vez" / "Cada mes", "Otro monto", "Tarjeta" / "PayPal", limits error, offline, results "¡Gracias por tu apoyo!" / "Estamos confirmando tu pago" / "No se realizó ningún cargo", "Sin anuncios hasta el …", history and subscription states "Activa" / "Con problema de pago" / "Cancelada", card text, contact text)
- [ ] T015 [P] Create `frontend/src/features/donations/api.ts` (TanStack Query: `useDonationConfig`, `useDonations`, `useDonationResult(id)` polling every 2 s up to 60 s, `useStartDonation`, `usePayPalReturn`, `useCancelSubscription`, `useDismissDonationCard`)
- [ ] T016 Add the lazy routes `/support`, `/support/result`, `/support/history` (inside `RequireAuth`) and `/support/fake-checkout` (only when `import.meta.env.DEV` or `VITE_FAKE_PAYMENTS=1`) to `frontend/src/app/router.tsx`, and a fixed "Apoya Car Checkup" entry in the app header/menu in `frontend/src/app/` layout (FR-001)

**Checkpoint**: Foundation ready - user story implementation can now begin

---

## Phase 3: User Story 1 - Hacer una donación con tarjeta o PayPal (Priority: P1) 🎯 MVP

**Goal**: Donar una vez con tarjeta (Stripe) o PayPal y ver el resultado; confirmada solo por webhook firmado.

**Independent Test**: Elegir 100 MXN, pagar en la página del proveedor (falso o Stripe test), volver y ver "¡Gracias!" solo cuando llega la confirmación.

### Implementation for User Story 1

- [ ] T017 [P] [US1] Implement `backend/src/lib/payments/stripe-provider.ts`: Checkout `mode: 'payment'` with `price_data` (`currency: 'mxn'`, `unit_amount` = cents), `metadata.donationId`, `client_reference_id`, success/cancel URLs to `/support/result?donation=<id>`, `idempotencyKey` = checkoutKey; `verifyAndParseWebhook` with `stripe.webhooks.constructEvent` mapping `checkout.session.completed` (payment, paid), `checkout.session.expired`, `charge.refunded`, `charge.dispute.created/closed` per contracts/payments.md
- [ ] T018 [P] [US1] Implement `backend/src/lib/payments/paypal-client.ts` (OAuth `client_credentials` cached until expiry; typed `fetch` wrappers validated with Zod; `PayPal-Request-Id` header) and `backend/src/lib/payments/paypal-provider.ts`: Orders v2 `intent: CAPTURE`, `custom_id` = donationId, `approve` link; `captureOrder`; webhook verification via `POST /v1/notifications/verify-webhook-signature` with `PAYPAL_WEBHOOK_ID`; mapping `CHECKOUT.ORDER.APPROVED` (capture), `PAYMENT.CAPTURE.COMPLETED/DENIED/REFUNDED`, `CUSTOMER.DISPUTE.CREATED/RESOLVED`
- [ ] T019 [US1] Create `backend/src/lib/payments/index.ts`: `getAvailableProviders()` (a real provider only if all its variables exist; `fake` mode exposes both through the fake provider) (FR-015)
- [ ] T020 [US1] Implement `backend/src/modules/donations/donations.service.ts` + `donations.routes.ts`: `GET /v1/donations/config`, `POST /v1/donations` (ONE_TIME: upsert by `(userId, checkoutKey)` returning the same `redirectUrl` while open; 422 out-of-range or unavailable provider; 502 `PROVIDER_UNAVAILABLE`), `GET /v1/donations/{id}`, `POST /v1/donations/{id}/paypal-return` (captures, never confirms); mount under `/v1` in `backend/src/app.ts`
- [ ] T021 [US1] Create `frontend/src/features/donations/SupportPage.tsx`: why text, "Una vez / Cada mes" segmented control (monthly enabled in US2), presets 50/100/200 + "Otro monto" (validated 20–10.000 before leaving), provider buttons only for `config.providers`, `checkoutKey` generated once per visit, buttons disabled offline; `window.location.assign(redirectUrl)` (SC-001: 3 taps); on 502 `PROVIDER_UNAVAILABLE` show "No pudimos conectar con <medio>. Inténtalo de nuevo o usa <otro medio>" keeping the chosen amount (FR-015)
- [ ] T022 [US1] Create `frontend/src/features/donations/ResultPage.tsx` (calls `paypal-return` first for PayPal, then polls; thank-you / "Estamos confirmando tu pago" after 60 s / "No se realizó ningún cargo" with "Intentar de nuevo") and `FakeCheckoutPage.tsx` ("Pagar" posts a signed fake webhook via a dev-only endpoint and redirects to the result; "Cancelar" redirects without paying)
- [ ] T023 [P] [US1] Integration tests in `backend/tests/integration/donations.test.ts`: start one-time (201 + redirect), double tap → same donation, out-of-range → 422, Stripe webhook signed with `stripe.webhooks.generateTestHeaderString` → CONFIRMED + `adFreeUntil` = +60 days for 100 MXN, same event twice → no duplicate (FR-007), bad signature → 400 unchanged, expired session → CANCELED, refund → REFUNDED and benefit removed, PayPal events with a fake verifier, unavailable provider hidden in config, in real mode `/webhooks/fake` → 404
- [ ] T024 [US1] E2E in `frontend/tests/e2e/donations.spec.ts`: from home open "Apoya Car Checkup" in 1 tap, choose 100 MXN + Tarjeta → fake checkout → Pagar → "¡Gracias por tu apoyo!"; Cancelar → "No se realizó ningún cargo"; offline → buttons disabled; fake provider set to fail → error message and the other provider still available
- [ ] T025 [US1] UX review of the support and result screens (light/dark, 390 px) in `specs/004-donations/checklists/ux-review.md` under "US1"

**Checkpoint**: One-time donations work end-to-end with webhook confirmation

---

## Phase 4: User Story 2 - Donar cada mes y poder cancelarlo (Priority: P2)

**Goal**: Donación mensual con tarjeta o PayPal, una activa por usuario, cancelable desde la app.

**Independent Test**: Activar 50 MXN mensual, ver "Donación mensual activa" con siguiente cargo; cancelar con confirmación y comprobar que sigue sin anuncios hasta `paidUntil` y sin nuevos cargos.

### Implementation for User Story 2

- [ ] T026 [P] [US2] Stripe subscriptions in `backend/src/lib/payments/stripe-provider.ts`: Checkout `mode: 'subscription'` with `price_data.recurring.interval: 'month'`, `subscription_data.metadata.subscriptionId`; `cancelSubscription` = `cancel_at_period_end: true`; `createPortalLink` (Stripe Billing Portal) for `POST /v1/donations/subscription/manage-link`; map `checkout.session.completed` (subscription), `invoice.paid` (period from the invoice line), `invoice.payment_failed`, `customer.subscription.deleted`
- [ ] T027 [P] [US2] PayPal subscriptions in `backend/src/lib/payments/paypal-provider.ts`: product "Donación mensual" and plan per amount created on first use and stored in `PayPalPlan`; `POST /v1/billing/subscriptions` with `custom_id`; cancel via `/cancel`; map `BILLING.SUBSCRIPTION.ACTIVATED/PAYMENT.FAILED/CANCELLED/SUSPENDED/EXPIRED`, `PAYMENT.SALE.COMPLETED/REFUNDED` (1-month period from the sale)
- [ ] T028 [US2] Extend `donations.service.ts`/`apply-event.ts`: `POST /v1/donations` with `kind: MONTHLY` (409 `ACTIVE_SUBSCRIPTION_EXISTS` only if one is ACTIVE/PAST_DUE; a new start cancels the user's previous PENDING ones and expires their provider session, except the one with the same `checkoutKey`, which is reused), monthly charge → new `Donation MONTHLY_CHARGE` CONFIRMED with `periodStart/End`, subscription ACTIVE + `paidUntil` + `nextChargeAt`, PAST_DUE / CANCELED transitions; `POST /v1/donations/subscription/cancel`; `POST /v1/donations/subscription/manage-link` (Stripe portal URL; 404 for PayPal); PENDING subscriptions older than 24 h treated as CANCELED
- [ ] T029 [US2] Enable "Cada mes" in `SupportPage.tsx` (provider shows it is a monthly charge; if a subscription exists, show "Ya tienes una donación mensual" with a link to manage it)
- [ ] T030 [P] [US2] Integration tests in `backend/tests/integration/donations-subscriptions.test.ts`: start monthly, second one while ACTIVE → 409, abandon checkout and retry → 201 with the previous PENDING CANCELED, `invoice.paid` → ACTIVE + charge + benefit until period end, payment failed → PAST_DUE, cancel → CANCELED with benefit until `paidUntil`, one-time during monthly saved until the end (Q2), provider cancellation, refunded charge recalculated
- [ ] T031 [US2] E2E in `frontend/tests/e2e/donations.spec.ts`: monthly 50 MXN via fake checkout → active in "Mis donaciones"; cancel with confirmation → "Cancelada", benefit date unchanged

**Checkpoint**: Monthly donations and cancellation work

---

## Phase 5: User Story 3 - Ver mis donaciones y su comprobante (Priority: P2)

**Goal**: Historial con estados y correo de agradecimiento.

**Independent Test**: Tras una donación confirmada, "Mis donaciones" la muestra y llega el correo (también con baja de recordatorios).

### Implementation for User Story 3

- [ ] T032 [US3] `GET /v1/donations` in `donations.service.ts` (CONFIRMED, REFUNDED, DISPUTED and PENDING from the last 24 h; newest first; subscription; `adFreeUntil`; `supportEmail`)
- [ ] T033 [US3] Add `renderDonationThanksEmail({ donation, appUrl, supportEmail })` to `backend/src/lib/email/templates.ts` (date, amount, provider, no card data, contact) and send it after commit from the webhook handler with `idempotencyKey` `donation-thanks:<donationId>`: always, even with `emailUnsubscribedAt`; never when `emailStatus ≠ OK` or no email (FR-011, Q1)
- [ ] T034 [US3] Create `frontend/src/features/donations/MyDonationsPage.tsx`: list (date, amount, provider, status; PENDING shown as "Confirmando tu pago…"), monthly block (amount, next charge, state, "Cancelar donación mensual" with confirm dialog, note that changing the amount = cancel and create another; when PAST_DUE an "Con problema de pago" notice with "Actualizar tarjeta" (Stripe manage-link) or instructions for PayPal), "Sin anuncios hasta el …", contact email for questions or refunds; empty state
- [ ] T035 [P] [US3] Tests: history filtering/order (PENDING 23 h shown, 25 h hidden) and thank-you email rules (unsubscribed → sent; bounced → not sent; duplicate event → one email) in `backend/tests/integration/donations.test.ts`; e2e history list in `frontend/tests/e2e/donations.spec.ts`
- [ ] T036 [US3] UX review of "Mis donaciones" and the thank-you email (render a sample to `specs/004-donations/checklists/thanks-email-sample.html`) under "US3" in `specs/004-donations/checklists/ux-review.md`

**Checkpoint**: Donors can see and prove their donations

---

## Phase 6: User Story 4 - Usar la app sin anuncios después de donar (Priority: P2)

**Goal**: El beneficio se calcula, se expone y se muestra con su fecha de fin.

**Independent Test**: 100 MXN única → "Sin anuncios hasta" hoy + 60 días en Apoya, Mis donaciones y `GET /v1/me`.

### Implementation for User Story 4

- [ ] T037 [US4] Expose `adFreeUntil` in `GET /v1/me` (`backend/src/modules/profile/profile.service.ts`) and document in `backend/src/modules/donations/README.md` (or a code comment in `benefit.service.ts`) that the ads feature must not show ads while `adFreeUntil > now`
- [ ] T038 [US4] Show "Sin anuncios hasta el <fecha>" in `SupportPage.tsx` and `MyDonationsPage.tsx` when `adFreeUntil` is in the future (FR-016)
- [ ] T039 [P] [US4] Integration tests for stacking (two one-time donations add up), dispute removes days and won dispute restores them, `GET /v1/me` value, in `backend/tests/integration/donations.test.ts`

**Checkpoint**: Benefit is stored and visible, ready for the ads feature

---

## Phase 7: User Story 5 - Descubrir que se puede apoyar sin que estorbe (Priority: P3)

**Goal**: Tarjeta discreta en la pantalla principal; nada para donantes con beneficio vigente.

**Independent Test**: Con un servicio registrado y sin beneficio, la tarjeta aparece al final de la pantalla principal; cerrada no vuelve; con beneficio no aparece.

### Implementation for User Story 5

- [ ] T040 [US5] Compute `showDonationCard` in `profile.service.ts` (no active benefit ∧ ≥ 1 `ServiceRecord` ∧ (`donationCardDismissedAt` null or ≥ 90 days ago)) and `POST /v1/donations/card/dismiss` (204) (FR-012a, R9)
- [ ] T041 [US5] Create `frontend/src/features/donations/DonationCard.tsx` and render it at the end of `frontend/src/features/home/HomePage.tsx` only when `profile.showDonationCard`; never inside sheets or forms (FR-012); hide the fixed entry's promotional styling for donors (entry itself stays, FR-012b)
- [ ] T042 [P] [US5] Tests: `showDonationCard` rules (no service → false, dismissed 89 vs 90 days, benefit → false) in `backend/tests/integration/donations.test.ts`; e2e card visible → close → gone after reload; donor sees no card; the reminders digest email contains no donation mention (assert on `renderDigestEmail` output) in `backend/tests/integration/reminders.test.ts`
- [ ] T043 [US5] UX review of the card and the fixed entry under "US5" in `specs/004-donations/checklists/ux-review.md`

**Checkpoint**: All user stories are independently functional

---

## Phase 8: Polish & Cross-Cutting Concerns

- [ ] T044 [P] Update `render.yaml` (new variables with `sync: false`, `PAYMENTS_PROVIDER_MODE=real`) and the README "Despliegue" section: Stripe (keys, webhook endpoint `https://<api>/webhooks/stripe` with the events of contracts/payments.md), PayPal (app, webhook id, `PAYPAL_ENV`), `SUPPORT_EMAIL`, Stripe CLI for local testing
- [ ] T045 [P] Update `frontend/playwright.config.ts` backend env (`PAYMENTS_PROVIDER_MODE=fake`, `SUPPORT_EMAIL`) and web env (`VITE_FAKE_PAYMENTS=1`)
- [ ] T046 Final cross-screen UX consistency pass in `specs/004-donations/checklists/ux-review.md`
- [ ] T047 Run `npm run typecheck`, `npm run lint`, `npm test` and `npm run test:e2e` at the repo root and fix any failures
- [ ] T048 Execute `specs/004-donations/quickstart.md` scenarios (fake provider locally; Stripe test mode with `stripe listen`; PayPal sandbox on the deployed environment)

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: no dependencies
- **Foundational (Phase 2)**: depends on Setup; blocks all stories (schema, shared rules, `apply-event`, webhooks, routes)
- **US1 (Phase 3)**: depends on Foundational — MVP
- **US2 (Phase 4)**: depends on US1 (providers, start endpoint, support page)
- **US3 (Phase 5)**: depends on US1 (confirmed donations); the monthly block needs US2
- **US4 (Phase 6)**: depends on US1 (benefit recalculation already runs from Foundational)
- **US5 (Phase 7)**: depends on US4 (`adFreeUntil` decides visibility)
- **Polish (Phase 8)**: after the desired stories

### Within Each User Story

- Providers → service/routes → UI → tests → UX review
- Story complete before moving to the next priority

### Parallel Opportunities

- T002 with T001; T005–T008 together; T014–T015 together
- US1: T017 and T018 (different providers) in parallel; T023 alongside the UI
- US2: T026 and T027 in parallel
- Polish: T044 and T045 in parallel

---

## Parallel Example: User Story 1

```bash
Task: "T017 Stripe one-time checkout + webhook mapping in backend/src/lib/payments/stripe-provider.ts"
Task: "T018 PayPal client + Orders v2 in backend/src/lib/payments/paypal-*.ts"
```

## Parallel Example: Foundational

```bash
Task: "T005 amounts in packages/shared/src/donations/amounts.ts"
Task: "T006 computeAdFreeUntil in packages/shared/src/donations/benefit.ts"
Task: "T007 schemas and DTOs in packages/shared/src/{schemas,dto}/donations.ts"
```

---

## Implementation Strategy

### MVP First

1. Setup + Foundational
2. US1 (one-time donations, webhook confirmation)
3. **STOP and VALIDATE** with the fake provider and Stripe test mode

### Incremental Delivery

1. US1 → MVP (donations work)
2. US2 → recurring income
3. US3 → trust (history + receipt)
4. US4 → benefit visible (needed before the ads feature)
5. US5 → discoverability

---

## Notes

- [P] tasks = different files, no dependencies
- Never store card or payer data (FR-005); confirmation only through verified webhooks
- Commit after each phase; keep the fake provider as the default outside production
