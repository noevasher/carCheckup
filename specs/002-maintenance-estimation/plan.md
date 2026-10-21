# Implementation Plan: Motor de Estimación de Mantenimiento

**Branch**: `002-maintenance-estimation` | **Date**: 2026-10-20 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `specs/002-maintenance-estimation/spec.md`

## Summary

Añade a cada vehículo un catálogo de 13 mantenimientos con intervalos por km y meses, calcula
para cada uno km objetivo, fecha estimada y estado (Vencido / Próximo / Al día) a partir del
último servicio (o el registro del vehículo), el ritmo de uso derivado de las lecturas (o un
promedio por uso habitual) y el ajuste por uso en ciudad, y lo muestra con explicación en la
pantalla principal. Permite registrar servicios en 2 toques (creando una lectura si el km del
taller es mayor), indicar historial previo, personalizar, desactivar y posponer.

El motor es una función pura en `packages/shared`; el backend persiste sus resultados en
`maintenance_estimates` dentro de la misma transacción de cualquier cambio relevante, y el
estado se deriva al leer con la fecha actual (research R1, R2, R7).

## Technical Context

**Language/Version**: TypeScript 6 (`strict`), Node.js 22+ (igual que 001)

**Primary Dependencies**: Las de 001. Nuevas en frontend: `@tanstack/react-query-persist-client`,
`@tanstack/query-async-storage-persister`, `idb-keyval` (caché offline, R10).

**Storage**: PostgreSQL (Supabase): tablas nuevas `maintenance_types` (sembrada por migración),
`vehicle_maintenance_settings`, `service_records`, `service_record_items`,
`maintenance_estimates`; enum `ReadingSource` + `SERVICE`. IndexedDB para la caché de consultas.

**Testing**: Vitest (motor: tabla de casos; API: integración con PostgreSQL), Playwright (e2e
móvil con el emulador de auth de 001).

**Target Platform**: Igual que 001 (PWA móvil + API Node).

**Project Type**: Aplicación web (monorepo existente).

**Performance Goals**: Recalculo de un vehículo < 5 ms; pantalla principal < 2 s (SC-006);
el resumen de mantenimientos de todos los vehículos en la misma consulta de `GET /vehicles`.

**Constraints**: Registro de servicio en 2 toques (FR-010); sin `any`; recalculo transaccional
(SC-005); visualización offline de la última estimación conocida.

**Scale/Scope**: 13 mantenimientos × N vehículos por usuario; ~5 pantallas/hojas nuevas (alertas
en principal, detalle, explicación, registrar servicio, historial de servicios, configuración).

Sin puntos abiertos: todo resuelto en [research.md](./research.md) (R1–R12).

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principio / Regla | Cómo se cumple | Estado |
|---|---|---|
| I. Fricción Cero | "Ya lo hice" en 2 toques con fecha y km rellenados (declarado en US2); km del taller mayor crea la lectura sin paso extra (R8); posponer en 1 toque | ✅ |
| II. Tipado Estricto | Motor tipado en `packages/shared` con tipos derivados de Prisma; Zod en todas las entradas nuevas; sin `any` | ✅ |
| III. Escalabilidad | Estimaciones persistidas con índice `estimated_due_at` para el futuro cron masivo; resumen del selector en una consulta agregada (sin N+1); recalculo por vehículo O(13) | ✅ |
| IV. Mobile-First, PWA y diseño supervisado | Alertas y hojas móviles reutilizando el design system de 001; revisión UX/UI por historia; caché offline persistente | ✅ |
| V. Usuarios no expertos | Alertas con qué/cuándo/por qué; explicación con intervalo, origen, ritmo y límite; nombres y descripciones en lenguaje claro; nota "no sustituye el manual" | ✅ |
| Stack obligatorio | Sin cambios de stack; migraciones Prisma versionadas | ✅ |
| Auth / secretos | Mismos mecanismos de 001; todo filtrado por propietario (404) | ✅ |

**Post-design re-check**: ✅ Sin violaciones. El modelo añade tablas indexadas por vehículo, el
contrato reutiliza formatos de 001 y no introduce pasos extra en flujos de captura.

## Project Structure

### Documentation (this feature)

```text
specs/002-maintenance-estimation/
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── contracts/openapi.yaml
├── checklists/requirements.md
└── tasks.md             # /speckit-tasks
```

### Source Code (repository root)

```text
packages/shared/src/
├── maintenance/
│   ├── catalog.ts          # códigos y valores por defecto (espejo tipado de la migración, para tests)
│   ├── pace.ts             # R4
│   ├── baseline.ts         # R5 (incl. interpolación de historial previo)
│   ├── interval.ts         # R6
│   ├── estimate.ts         # R7: estimateMaintenance()
│   ├── status.ts           # estado derivado con "hoy" (backend y caché offline)
│   └── index.ts
├── dto/maintenance.ts      # VehicleMaintenanceDto, MaintenanceItemDto, ServiceRecordDto...
└── schemas/maintenance.ts  # ServiceCreate/Update, MaintenanceSettingUpdate (Zod)

backend/
├── prisma/migrations/<ts>_maintenance/   # tablas + catálogo sembrado
└── src/modules/
    ├── maintenance/        # recompute.ts, maintenance.service.ts, maintenance.routes.ts
    ├── services/           # services.service.ts, services.routes.ts
    ├── readings/           # (001) llamar a recompute en create/update/delete
    └── vehicles/           # (001) recompute al editar; resumen en GET /vehicles

frontend/src/
├── app/persist.ts          # caché TanStack Query en IndexedDB (R10)
├── features/maintenance/
│   ├── api.ts
│   ├── MaintenanceAlerts.tsx        # pantalla principal (hasta 3 / "Todo al día")
│   ├── MaintenanceDetailPage.tsx    # /vehicles/:id/maintenance
│   ├── ExplanationSheet.tsx
│   ├── RecordServiceSheet.tsx       # "Ya lo hice" (2 toques)
│   ├── PriorHistorySheet.tsx
│   ├── MaintenanceSettingsSheet.tsx
│   └── explain.ts                   # frases de explicación (R11)
├── features/services/ServicesHistoryPage.tsx   # /vehicles/:id/services
└── i18n/es.ts              # nombres y descripciones por code
```

**Structure Decision**: Misma estructura de monorepo de 001; el motor vive en
`packages/shared/src/maintenance` para compartir reglas y tipos.

## Complexity Tracking

Sin violaciones de la constitución; no aplica.
