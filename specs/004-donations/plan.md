# Implementation Plan: Donaciones con Stripe y PayPal

**Branch**: `004-donations` (git: `feature004`) | **Date**: 2026-10-23 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `specs/004-donations/spec.md`

## Summary

Pantalla "Apoya Car Checkup" con donaciones únicas y mensuales en MXN, pagadas en la página
alojada del proveedor: **Stripe Checkout** (tarjeta, Apple/Google Pay) o **PayPal** (Orders v2 y
Subscriptions con cliente REST propio). Las donaciones solo se confirman por **webhooks con firma
verificada** e idempotentes (`payment_events`). Cada confirmación recalcula con una función pura
el beneficio **sin anuncios** (`profiles.adFreeUntil`: 30 días por cada 50 MXN, días guardados
mientras haya una mensual pagada), que la futura feature de anuncios leerá. Incluye historial
"Mis donaciones", cancelación de la mensual, correo de agradecimiento con el `EmailSender` de 003
y una tarjeta de invitación discreta que nunca ven los donantes con beneficio vigente.

## Technical Context

**Language/Version**: TypeScript 6 (`strict`), Node.js 22+ (igual que 001–003)

**Primary Dependencies**: Backend: `stripe` (SDK oficial: Checkout, suscripciones, verificación
de webhooks). PayPal con `fetch` + Zod (sin SDK, R2). Frontend: sin dependencias nuevas.

**Storage**: PostgreSQL (Supabase): `profiles` + `adFreeUntil`, `donationCardDismissedAt`;
tablas nuevas `donations`, `donation_subscriptions`, `paypal_plans`, `payment_events`.

**Testing**: Vitest (cálculo del beneficio, montos, transiciones), Supertest + PostgreSQL (inicio
de pago con proveedor falso, webhooks de Stripe firmados con `generateTestHeaderString`, PayPal
con verificador falso, idempotencia, cancelación, reembolsos), Playwright (flujo completo con el
proveedor falso y su página local de checkout, tarjeta de invitación).

**Target Platform**: PWA (móvil) + API Node en Render; webhooks públicos en el API.

**Project Type**: Aplicación web (monorepo existente).

**Performance Goals**: Webhook respondido en < 5 s; confirmación visible en la app en < 1 min
(SC-003) con consulta cada 2 s en la pantalla de resultado.

**Constraints**: Nunca datos de tarjeta (FR-005); confirmación solo por webhook firmado
(constitución); idempotencia ante doble toque y eventos repetidos; una mensual activa por
usuario; montos enteros 20–10.000 MXN.

**Scale/Scope**: 5 historias; 8 endpoints `/v1` + 2 webhooks; 3 pantallas nuevas (Apoya, Mis
donaciones, Resultado) + tarjeta en la pantalla principal + página del proveedor falso (solo
dev/e2e).

Sin puntos abiertos: resueltos en [research.md](./research.md) (R1–R13).

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principio / Regla | Cómo se cumple | Estado |
|---|---|---|
| I. Fricción Cero | Donar con monto sugerido: acceso (1) + monto (1) + medio (1) = 3 toques hasta el proveedor (SC-001); la invitación nunca aparece en flujos de captura (FR-012) | ✅ |
| II. Tipado Estricto | DTOs y esquemas Zod en `packages/shared`; respuestas de PayPal y eventos validados con Zod; tipos de Stripe del SDK; sin `any` | ✅ |
| III. Escalabilidad | Webhooks stateless e idempotentes; beneficio desnormalizado en el perfil (lectura O(1) para anuncios); sin procesos masivos | ✅ |
| IV. Mobile-First, PWA, diseño supervisado | Páginas alojadas de Stripe/PayPal adaptadas a móvil; pantallas nuevas mobile-first con revisión UX por historia | ✅ |
| V. Usuarios no expertos | Textos sencillos ("Una vez / Cada mes", "Sin anuncios hasta…"); estados explicados | ✅ |
| Monetización (donaciones) | Stripe y PayPal seleccionables por el usuario; **confirmación solo por webhooks verificados por firma** (R3) | ✅ |
| Monetización (anuncios) | Esta feature solo registra el beneficio; la feature de anuncios deberá respetarlo | ✅ |
| Correos transaccionales | Agradecimiento con el `EmailSender` de 003 | ✅ |
| Secretos | Claves de Stripe/PayPal, ids de webhook y correo de soporte solo por variables de entorno | ✅ |

**Post-design re-check**: ✅ Sin violaciones.

## Project Structure

### Documentation (this feature)

```text
specs/004-donations/
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── contracts/
│   ├── openapi.yaml
│   └── payments.md
├── checklists/requirements.md
└── tasks.md             # /speckit-tasks
```

### Source Code (repository root)

```text
packages/shared/src/
├── donations/
│   ├── amounts.ts          # presets, límites, centavos, adFreeDays(amount)
│   ├── benefit.ts          # computeAdFreeUntil (R5)
│   └── index.ts
├── dto/donations.ts        # DonationConfigDto, DonationHistoryDto, DonationResultDto…
└── schemas/donations.ts    # DonationStartSchema, eventos de PayPal (Zod)

backend/
├── prisma/migrations/<ts>_donations/
├── src/
│   ├── config/env.ts       # + STRIPE_*, PAYPAL_*, PAYMENTS_PROVIDER_MODE, SUPPORT_EMAIL
│   ├── lib/payments/
│   │   ├── payment-provider.ts   # interfaz (R8)
│   │   ├── stripe-provider.ts
│   │   ├── paypal-client.ts      # REST + OAuth + Zod
│   │   ├── paypal-provider.ts
│   │   ├── fake-provider.ts
│   │   └── index.ts              # proveedores disponibles según variables
│   ├── lib/email/templates.ts    # + renderDonationThanksEmail
│   └── modules/donations/
│       ├── donations.routes.ts   # /v1/donations…
│       ├── donations.service.ts  # inicio, consulta, cancelación, tarjeta
│       ├── apply-event.ts        # transiciones + PaymentEvent + recálculo (común a proveedores)
│       ├── benefit.service.ts    # carga grants/periodos y guarda adFreeUntil
│       └── webhooks.routes.ts    # /webhooks/stripe, /webhooks/paypal (raw body)

frontend/src/features/donations/
├── api.ts                  # queries y mutaciones
├── SupportPage.tsx         # /support: montos, una vez/cada mes, medio
├── ResultPage.tsx          # /support/result: espera de confirmación (R7)
├── MyDonationsPage.tsx     # /support/history: lista, mensual, cancelar, contacto
├── DonationCard.tsx        # tarjeta discreta en HomePage
└── FakeCheckoutPage.tsx    # /support/fake-checkout (solo dev/e2e)
```

**Structure Decision**: Monorepo existente. Proveedores intercambiables detrás de
`PaymentProvider` (como `EmailSender`/`PushSender` en 003); lógica de estados y beneficio común en
`apply-event.ts` y `packages/shared/src/donations` para que Stripe y PayPal solo traduzcan eventos.

## Complexity Tracking

Sin violaciones de la constitución.
