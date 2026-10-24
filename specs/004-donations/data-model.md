# Data Model: Donaciones con Stripe y PayPal

**Feature**: `004-donations` | **Date**: 2026-10-23

Cambios sobre `backend/prisma/schema.prisma` (fuente de verdad, Principio II).

## Diagrama

```text
Profile ─1──N─ Donation ─N──0..1─ DonationSubscription ─N──1─ Profile
   │                                    │
   └── adFreeUntil (derivado, R5)       └─ PayPalPlan (por monto, solo PayPal)
PaymentEvent (provider, eventId) — registro de idempotencia
```

## Enums nuevos

| Enum | Valores |
|---|---|
| `PaymentProvider` | `STRIPE`, `PAYPAL` |
| `DonationKind` | `ONE_TIME`, `MONTHLY_CHARGE` |
| `DonationStatus` | `PENDING`, `CONFIRMED`, `CANCELED`, `FAILED`, `REFUNDED`, `DISPUTED` |
| `SubscriptionStatus` | `PENDING`, `ACTIVE`, `PAST_DUE`, `CANCELED` |

## Profile (campos nuevos)

| Campo | Tipo | Reglas |
|---|---|---|
| `adFreeUntil` | timestamptz, nullable | derivado (R5); null = sin beneficio |
| `donationCardDismissedAt` | timestamptz, nullable | cierre de la tarjeta (90 días, FR-012a) |

## Donation

| Campo | Tipo | Reglas |
|---|---|---|
| `id` | UUID, PK | |
| `userId` | UUID, FK → Profile, nullable | `ON DELETE SET NULL` (la donación se conserva anónima para contabilidad) |
| `kind` | `DonationKind` | |
| `provider` | `PaymentProvider` | |
| `amountCents` | int | 2.000–1.000.000 (20–10.000 MXN, enteros ×100) |
| `currency` | text | `MXN` |
| `status` | `DonationStatus` | ver transiciones |
| `checkoutKey` | UUID, nullable | único `(userId, checkoutKey)` (R4); solo `ONE_TIME` |
| `providerCheckoutId` | text, nullable | sesión de Stripe / orden de PayPal |
| `providerPaymentId` | text, nullable, único por proveedor | payment_intent / captura / sale / invoice |
| `subscriptionId` | UUID, FK → DonationSubscription, nullable | solo `MONTHLY_CHARGE` |
| `periodStart` / `periodEnd` | timestamptz, nullable | periodo cubierto por un cobro mensual |
| `adFreeDays` | int | `floor(amount × 30 / 50)` para `ONE_TIME`; 0 para cobros mensuales |
| `createdAt` / `confirmedAt` / `updatedAt` | timestamptz | |

Transiciones:

```text
PENDING ──webhook pago completado──► CONFIRMED ──reembolso──► REFUNDED
   │                                    └──disputa──► DISPUTED ──ganada──► CONFIRMED
   ├──cancelado / expirado──► CANCELED              └──perdida──► REFUNDED
   └──pago fallido──► FAILED
REFUNDED es final. Un evento que no es una transición válida se registra y se ignora.
```

## DonationSubscription

| Campo | Tipo | Reglas |
|---|---|---|
| `id` | UUID, PK | |
| `userId` | UUID, FK → Profile, nullable | `ON DELETE SET NULL`; **una sola** con estado `ACTIVE`/`PAST_DUE` por usuario (índice único parcial); puede haber varias `PENDING` |
| `provider` | `PaymentProvider` | |
| `amountCents` | int | mismos límites que Donation |
| `status` | `SubscriptionStatus` | |
| `checkoutKey` | UUID | único `(userId, checkoutKey)` |
| `providerSubscriptionId` | text, nullable, único | |
| `paidUntil` | timestamptz, nullable | fin del último periodo pagado |
| `nextChargeAt` | timestamptz, nullable | |
| `canceledAt` | timestamptz, nullable | |
| `createdAt` / `updatedAt` | timestamptz | |

Transiciones: `PENDING → ACTIVE` (primer cobro confirmado) `→ PAST_DUE` (cobro fallido)
`→ ACTIVE` (cobro posterior correcto) · cualquiera `→ CANCELED` (usuario o proveedor). Un
`PENDING` sin activar en 24 h pasa a `CANCELED` (abandono del checkout). Al iniciar una nueva
mensual, las `PENDING` anteriores del usuario pasan a `CANCELED` (y su sesión de pago se expira en
el proveedor); una `PENDING` con el mismo `checkoutKey` se reutiliza.

## PayPalPlan

| Campo | Tipo | Reglas |
|---|---|---|
| `amountCents` | int, PK | un plan mensual por monto |
| `planId` | text | id del plan en PayPal |
| `env` | text | `sandbox` / `live` (PK compuesta con `amountCents`) |

## PaymentEvent

| Campo | Tipo | Reglas |
|---|---|---|
| `provider` + `eventId` | PK compuesta | idempotencia (FR-007) |
| `type` | text | p. ej. `invoice.paid`, `PAYMENT.CAPTURE.COMPLETED` |
| `donationId` | UUID, nullable | referencia informativa |
| `receivedAt` | timestamptz | |

Sin datos de tarjeta ni del pagador (FR-005). Las tablas tienen RLS activado sin políticas, como
el resto.
