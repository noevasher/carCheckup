# Data Model: Recordatorios por Notificación Push y Correo

**Feature**: `003-email-reminders` | **Date**: 2026-10-22

Cambios sobre `backend/prisma/schema.prisma` (fuente de verdad, Principio II), sumados a los de
[001](../001-vehicles-mileage/data-model.md) y [002](../002-maintenance-estimation/data-model.md).

## Diagrama

```text
Profile ─1──N─ PushSubscription
   │ 1
   ├──N─ Notice ─N──1─ Vehicle ─1──N─ MaintenanceNoticeState ─N──1─ MaintenanceType
   │       │ N
   │       └──N─ DeliveryNotice ─N──1─ Delivery
   └──N─ Delivery
```

## Enums nuevos

| Enum | Valores |
|---|---|
| `EmailStatus` | `OK`, `BOUNCED`, `COMPLAINED` |
| `NoticeKind` | `MAINTENANCE_UPCOMING`, `MAINTENANCE_OVERDUE`, `MILEAGE_UPDATE` |
| `NotifiedStatus` | `UPCOMING`, `OVERDUE` |
| `DeliveryChannel` | `PUSH`, `EMAIL` |
| `DeliveryStatus` | `SENT`, `FAILED`, `EXPIRED`, `BOUNCED`, `COMPLAINED` |

## Cambios en modelos existentes

### Profile

| Campo nuevo | Tipo | Reglas |
|---|---|---|
| `email` | text, nullable | claim `email` del JWT (R9) |
| `timeZone` | text, default `America/Mexico_City` | IANA, del `X-Timezone` (FR-019) |
| `nextDigestAt` | timestamptz | próximo 09:00 local; índice (R6) |
| `emailStatus` | `EmailStatus`, default `OK` | webhooks de rebote/queja (FR-015) |
| `emailUnsubscribedAt` | timestamptz, nullable | baja de un clic (FR-014) |

### Vehicle

| Campo nuevo | Tipo | Reglas |
|---|---|---|
| `emailReminders` | boolean, default `false` | interruptor del alta/edición (FR-007); `false` para vehículos existentes |
| `lastKmReminderAt` | timestamptz, nullable | último aviso de kilometraje (FR-005) |

## PushSubscription

| Campo | Tipo | Reglas |
|---|---|---|
| `id` | UUID, PK | |
| `userId` | UUID, FK → Profile | `ON DELETE CASCADE` |
| `endpoint` | text, único | ≤ 2.048 caracteres; URL https |
| `p256dh` | text | ≤ 200 |
| `auth` | text | ≤ 100 |
| `userAgent` | text, nullable | ≤ 300, solo informativo |
| `createdAt` / `lastSuccessAt` / `lastFailureAt` | timestamptz | |

Reglas: registrar el mismo `endpoint` lo reasigna al usuario actual (upsert). `404`/`410` del
servicio push → se borra.

## MaintenanceNoticeState

| Campo | Tipo | Reglas |
|---|---|---|
| `vehicleId` + `typeCode` | PK compuesta | FK a Vehicle (`CASCADE`) y MaintenanceType |
| `cycleSignature` | text | `baselineSource|baselineKm|baselineAt|intervalKm|intervalMonths` de la estimación |
| `lastNotifiedStatus` | `NotifiedStatus`, nullable | null = nada avisado en este ciclo |
| `updatedAt` | timestamptz | |

Transiciones (R7):

```text
firma distinta (servicio, historial previo o intervalo) ──► reset (lastNotifiedStatus = null)
(un OK pasajero con la misma firma NO reinicia)
null      + UPCOMING ──► aviso MAINTENANCE_UPCOMING ──► UPCOMING
null|UPCOMING + OVERDUE ──► aviso MAINTENANCE_OVERDUE ──► OVERDUE   (nunca se repite)
```

## Notice

| Campo | Tipo | Reglas |
|---|---|---|
| `id` | UUID, PK | |
| `userId` | UUID, FK → Profile | `CASCADE` |
| `vehicleId` | UUID, FK → Vehicle | `CASCADE` |
| `kind` | `NoticeKind` | |
| `typeCode` | `MaintenanceTypeCode`, nullable | null para `MILEAGE_UPDATE` |
| `cycleKey` | text | firma del ciclo o fecha local `YYYY-MM-DD` (kilometraje) |
| `remainingKm` / `overdueDays` / `estimatedDueAt` | int / int / timestamptz, nullable | instantánea para el texto |
| `createdAt` | timestamptz | |
| `deliveredAt` | timestamptz, nullable | al enviarse por al menos un canal |

**Únicos**: `(vehicleId, kind, typeCode, cycleKey)` (NULLS NOT DISTINCT) → idempotencia (FR-013).
**Índices**: `(userId, deliveredAt)`, `(createdAt)` para la retención.

## Delivery

| Campo | Tipo | Reglas |
|---|---|---|
| `id` | UUID, PK | |
| `userId` | UUID, FK → Profile | `CASCADE` |
| `channel` | `DeliveryChannel` | |
| `digestDate` | date | fecha local del envío |
| `target` | text | id de la suscripción push o `email` |
| `status` | `DeliveryStatus` | |
| `providerMessageId` | text, nullable | id de Resend (para el webhook) |
| `error` | text, nullable | ≤ 500 |
| `createdAt` | timestamptz | |

**Únicos**: `(userId, channel, digestDate, target)` → como máximo 1 push por dispositivo y 1 correo
por día (FR-001, SC-002). **Índices**: `(providerMessageId)`, `(createdAt)`.

## DeliveryNotice

| Campo | Tipo |
|---|---|
| `deliveryId` + `noticeId` | PK compuesta, ambos `CASCADE` |
