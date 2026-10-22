# Implementation Plan: Recordatorios por Notificación Push y Correo

**Branch**: `003-email-reminders` | **Date**: 2026-10-22 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `specs/003-email-reminders/spec.md`

## Summary

Un proceso horario idempotente toma los usuarios a los que les toca su envío diario (09:00 en su
zona horaria, `nextDigestAt` indexado), deriva el estado de sus mantenimientos a partir de las
estimaciones persistidas de 002, genera avisos únicos por ciclo (próximo, vencido una sola vez,
kilometraje cada 30 días) y los entrega agrupados: una notificación **Web Push** por dispositivo
(obligatoria, sin botones) y un correo por **Resend** (opcional por vehículo, elegido al darlo de
alta), con baja de un clic sin sesión, rebotes y quejas vía webhook firmado, y retención de 12
meses. En la PWA: interruptor de correo en el alta y edición, flujo de permiso con la pregunta de
correo si se deniega, service worker con manejo de push y página pública de baja.

## Technical Context

**Language/Version**: TypeScript 6 (`strict`), Node.js 22+ (igual que 001/002)

**Primary Dependencies**: Backend: `web-push` (Web Push + VAPID), `resend` (correo), `svix`
(verificación de webhooks). Frontend: `workbox-precaching`, `workbox-routing` (service worker con
`injectManifest`). Sin cambios de stack.

**Storage**: PostgreSQL (Supabase): `profiles` + `email`, `timeZone`, `nextDigestAt`,
`emailStatus`, `emailUnsubscribedAt`; `vehicles` + `emailReminders`, `lastKmReminderAt`; tablas
nuevas `push_subscriptions`, `maintenance_notice_states`, `notices`, `deliveries`,
`delivery_notices`.

**Testing**: Vitest (reglas de avisos, horario, plantillas, tokens), Supertest + PostgreSQL
(proceso completo con emisores falsos, webhooks, baja pública), Playwright (interruptor, flujo de
permiso con permiso denegado/concedido simulado, página de baja).

**Target Platform**: PWA (Chrome/Edge/Firefox Android, iOS 16.4+ instalada) + API Node; proceso
programado como Render Cron Job (CLI) o programador externo vía HTTP.

**Project Type**: Aplicación web (monorepo existente).

**Performance Goals**: 100.000 usuarios por pasada en < 1 h (SC-003): lotes de 500 con
`SKIP LOCKED`, concurrencia limitada de envíos (p. ej. 20 en paralelo).

**Constraints**: Máx. 1 push por dispositivo y 1 correo por usuario y día; idempotente ante
reintentos; push sin acciones; correo solo con opt-in por vehículo; baja sin sesión segura.

**Scale/Scope**: 4 historias; ~6 endpoints nuevos; 1 proceso; 3 piezas de UI nuevas (flujo de
permiso, página de baja, aviso de correo inválido) y cambios en el formulario de vehículo.

Sin puntos abiertos: resueltos en [research.md](./research.md) (R1–R13).

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principio / Regla | Cómo se cumple | Estado |
|---|---|---|
| I. Fricción Cero | Correo = 1 interruptor opcional en el alta (0–1 toques); permiso = 1 toque del sistema; baja en 1 clic; el aviso de km abre la captura de 2 toques | ✅ |
| II. Tipado Estricto | DTOs y esquemas en `packages/shared`; payload push y webhooks validados con Zod; sin `any` | ✅ |
| III. Escalabilidad | `nextDigestAt` indexado + lotes `SKIP LOCKED`; idempotencia por claves únicas; reanudable; envíos con concurrencia limitada; backend stateless | ✅ |
| IV. Mobile-First, PWA, diseño supervisado | Push vía service worker de la PWA; flujo de permiso adaptado a iOS; correos legibles en móvil; revisión UX por historia | ✅ |
| V. Usuarios no expertos | Avisos con qué/cuándo/por qué, reutilizando los textos de 002 | ✅ |
| Correos transaccionales | Resend detrás de la interfaz `EmailSender` (intercambiable por Brevo/SMTP) | ✅ |
| Secretos | VAPID, Resend, webhook, baja y jobs solo por variables de entorno | ✅ |
| Notificaciones push | **No listadas en la constitución.** Web Push es un estándar del navegador sin proveedor externo, así que no contradice ninguna regla; se recomienda enmendar la sección de Infraestructura para incluir el canal | ⚠️ nota |

**Post-design re-check**: ✅ Sin violaciones. Pendiente recomendado (no bloqueante):
`/speckit-constitution` para añadir "Notificaciones push: Web Push (VAPID) desde la PWA".

## Project Structure

### Documentation (this feature)

```text
specs/003-email-reminders/
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── contracts/
│   ├── openapi.yaml
│   └── notifications.md
├── checklists/requirements.md
└── tasks.md             # /speckit-tasks
```

### Source Code (repository root)

```text
packages/shared/src/
├── reminders/
│   ├── schedule.ts         # nextDigestAt (09:00 local, DST)
│   ├── notices.ts          # reglas de ciclo y avisos (R7)
│   ├── digest.ts           # agrupación, orden, límite 10, payload push (R8)
│   └── index.ts
├── dto/notifications.ts    # ProfileDto + emailStatus, JobResultDto...
└── schemas/notifications.ts # PushSubscriptionCreate, Unsubscribe, webhook Resend (Zod)

backend/
├── prisma/migrations/<ts>_reminders/
├── src/
│   ├── config/env.ts       # + APP_URL, VAPID_*, EMAIL_*, RESEND_*, UNSUBSCRIBE_SECRET, JOBS_SECRET
│   ├── lib/
│   │   ├── email/          # EmailSender, ResendEmailSender, LogEmailSender, templates
│   │   └── push/           # PushSender, WebPushSender, FakePushSender
│   ├── middleware/         # timezone.ts guarda timeZone/nextDigestAt; ensure-profile guarda email
│   └── modules/
│       ├── notifications/  # push-subscriptions routes, unsubscribe (public), webhooks
│       └── reminders/      # run-reminders.ts (proceso), retention.ts, jobs.routes.ts
└── src/jobs/reminders.ts   # CLI para Render Cron Job

frontend/src/
├── sw.ts                   # service worker (injectManifest): precache + push + notificationclick
├── features/notifications/
│   ├── push.ts             # soporte, permiso, suscripción
│   ├── NotificationsPrompt.tsx  # hoja explicativa + pregunta de correo (FR-008)
│   └── UnsubscribePage.tsx      # /unsubscribe (pública)
└── features/vehicles/VehicleForm.tsx  # interruptor emailReminders
```

**Structure Decision**: Monorepo existente; reglas puras en `packages/shared/src/reminders`,
emisores intercambiables detrás de interfaces en `backend/src/lib/{email,push}`.

## Complexity Tracking

Sin violaciones de la constitución. Nota: el canal push no figura en la constitución; se justifica
como estándar del navegador sin proveedor externo y se propone enmienda.
