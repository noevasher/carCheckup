# Implementation Plan: Gestión de Vehículos y Registro Rápido de Kilometraje

**Branch**: `001-vehicles-mileage` | **Date**: 2026-10-20 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `specs/001-vehicles-mileage/spec.md`

## Summary

Primera feature del producto: alta de N vehículos por usuario (catálogo de marca/modelo con
texto libre, combustible y uso opcionales) y captura de kilometraje en 2 toques desde la
pantalla principal, con fechas pasadas opcionales, validación de orden y plausibilidad, e
historial editable. La captura funciona offline: cada lectura lleva un UUID generado en el
dispositivo, se encola en IndexedDB y se sincroniza con un endpoint idempotente. El kilometraje
actual se denormaliza en el vehículo para que la pantalla principal y el futuro cron de
recordatorios lo lean sin agregaciones.

## Technical Context

**Language/Version**: TypeScript 5.x (`strict`), Node.js 22 LTS

**Primary Dependencies**: Backend: Express 5, Prisma, Zod, `jose` (JWKS Supabase), `pino`.
Frontend: React 19, Vite, `vite-plugin-pwa` (Workbox), React Router, TanStack Query,
`@supabase/supabase-js`, `idb`, Tailwind CSS, Radix UI. Compartido: `packages/shared` (DTOs
derivados de Prisma + esquemas Zod + reglas de validación de lecturas).

**Storage**: PostgreSQL en Supabase (extensiones `pg_trgm`, `unaccent`); IndexedDB en el
dispositivo para la cola offline.

**Testing**: Vitest, Supertest, React Testing Library, Playwright (viewport móvil + offline).

**Target Platform**: PWA en navegadores móviles modernos (Safari iOS 16.4+, Chrome Android);
backend Node en Render/Railway/VPS; frontend en Vercel.

**Project Type**: Aplicación web (PWA frontend + API REST backend) en monorepo.

**Performance Goals**: Pantalla principal con vehículo activo y km en < 2 s en red móvil
(SC-006); actualización de km completada en < 10 s (SC-002); sugerencias de catálogo en
< 300 ms percibidos.

**Constraints**: Captura de lecturas offline sin pérdidas ni duplicados (SC-004); flujo
principal ≤ 2 toques (FR-006); sin `any`; backend stateless.

**Scale/Scope**: Diseñado para decenas de miles de usuarios con N vehículos y miles de
lecturas por vehículo; ~6 pantallas (alta, principal, captura, selector de vehículo, edición,
historial).

Todos los puntos abiertos se resolvieron en [research.md](./research.md) (R1–R11).

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principio / Regla | Cómo se cumple | Estado |
|---|---|---|
| I. Fricción Cero | Flujo principal declarado: 2 toques + valor (FR-006); teclado numérico enfocado; fecha y vehículo activo por defecto; campos extra opcionales y omitibles | ✅ |
| II. Tipado Estricto | `strict` + `no-explicit-any` como error; Prisma → `packages/shared` → frontend con `import type`; Zod en toda entrada externa (R1) | ✅ |
| III. Escalabilidad | N vehículos por usuario; km actual denormalizado (R7); índices `(userId)`, `(vehicleId, readAt)`; sin N+1; backend stateless con pooler (R4) | ✅ |
| IV. Mobile-First y PWA | Diseño móvil primero; manifest + service worker (R5); objetivos táctiles ≥ 44 px; diseño sobrio y amigable con design tokens, sujeto a revisión UX/UI antes de cerrar cada pantalla (R9) | ✅ |
| V. Usuarios no expertos | Mensajes de error por código traducidos a lenguaje claro en la UI; sin jerga mecánica en esta feature; datos preparados para estimaciones explicables | ✅ |
| Stack obligatorio | React+Vite PWA, Express REST, TypeScript, Supabase Postgres, Prisma con migraciones versionadas | ✅ |
| Auth Supabase | Verificación JWT por JWKS en cada request (R2) | ✅ |
| Secretos | Solo variables de entorno; `.env.example` sin valores | ✅ |

**Post-design re-check (tras Phase 1)**: ✅ Sin violaciones. El modelo de datos y los contratos
no introducen tipos manuales fuera de `packages/shared`, ni pasos extra en la captura, ni
consultas sin índice.

## Project Structure

### Documentation (this feature)

```text
specs/001-vehicles-mileage/
├── plan.md              # Este archivo
├── research.md          # Phase 0
├── data-model.md        # Phase 1
├── quickstart.md        # Phase 1
├── contracts/
│   ├── openapi.yaml     # API REST
│   └── offline-sync.md  # Contrato de la cola offline
├── checklists/
│   └── requirements.md
└── tasks.md             # Phase 2 (/speckit-tasks)
```

### Source Code (repository root)

```text
package.json                    # npm workspaces + scripts raíz (dev, test, lint, typecheck)
tsconfig.base.json              # strict compartido
eslint.config.js                # no-explicit-any: error

packages/shared/
├── src/
│   ├── generated/prisma/       # cliente Prisma generado (solo tipos para el frontend)
│   ├── dto/                    # Vehicle, MileageReading, Profile, Catalog (derivados de Prisma)
│   ├── schemas/                # Zod: VehicleCreate, VehicleUpdate, ReadingCreate, ...
│   ├── validation/             # reglas de orden/plausibilidad de lecturas (R8)
│   └── errors.ts               # códigos de error del API
└── tests/

backend/
├── prisma/
│   ├── schema.prisma
│   ├── migrations/
│   └── seed/                   # CSV del catálogo + script de seed
├── src/
│   ├── app.ts                  # Express app
│   ├── server.ts
│   ├── config/env.ts           # variables validadas con Zod
│   ├── middleware/             # auth (JWKS), errores, request-id, logging
│   ├── modules/
│   │   ├── profile/            # routes, service
│   │   ├── vehicles/           # routes, service
│   │   ├── readings/           # routes, service (idempotencia, recálculo)
│   │   └── catalog/            # routes, service
│   └── lib/prisma.ts
└── tests/
    ├── contract/               # contra openapi.yaml
    ├── integration/
    └── unit/

frontend/
├── public/                     # iconos PWA
├── src/
│   ├── main.tsx
│   ├── app/                    # router, providers, layout
│   ├── design/                 # tokens, componentes base accesibles
│   ├── features/
│   │   ├── auth/
│   │   ├── vehicles/           # alta, edición, selector de activo
│   │   ├── readings/           # captura rápida, historial
│   │   └── catalog/            # autocompletado
│   ├── offline/                # cola IndexedDB + sincronizador
│   ├── lib/                    # api client tipado, supabase client
│   └── i18n/es.ts              # textos y mensajes por código de error
└── tests/
    ├── unit/
    └── e2e/                    # Playwright
```

**Structure Decision**: Monorepo con tres workspaces (`backend`, `frontend`, `packages/shared`).
El paquete compartido es la vía para que los tipos de Prisma lleguen al frontend sin duplicarlos
(Principio II) y para reutilizar la validación de lecturas offline en el cliente.

## Complexity Tracking

Sin violaciones de la constitución; no aplica.
