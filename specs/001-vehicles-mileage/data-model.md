# Data Model: Gestión de Vehículos y Registro Rápido de Kilometraje

**Feature**: `001-vehicles-mileage` | **Date**: 2026-10-20

Modelo lógico que se implementará en `backend/prisma/schema.prisma` (fuente de verdad de tipos,
Principio II). Nombres de modelos y campos en inglés en el código; descripciones en español.

## Diagrama

```text
auth.users (Supabase)
     │ 1
     │ id = Profile.id
     ▼ 1
  Profile ──── activeVehicleId (0..1) ────┐
     │ 1                                  │
     ▼ N                                  │
  Vehicle ◄───────────────────────────────┘
     │ 1          N ▲
     ▼ N            │ 0..1
  MileageReading  CatalogModel ──N:1── CatalogMake
```

## Enums

| Enum | Valores | Origen |
|---|---|---|
| `FuelType` | `GASOLINE`, `DIESEL`, `HYBRID`, `ELECTRIC` | FR-001a |
| `UsageType` | `CITY`, `HIGHWAY`, `MIXED` | FR-001a |
| `ReadingSource` | `INITIAL`, `UPDATE` | Entidad Lectura (origen) |
| `ReadingOrigin` | `ONLINE`, `OFFLINE_SYNC` | R5 |
| `ReviewStatus` | `OK`, `NEEDS_REVIEW` | Edge case de sincronización |

## Profile

Datos de aplicación del usuario autenticado. Se crea en el primer request autenticado (upsert).

| Campo | Tipo | Reglas |
|---|---|---|
| `id` | UUID, PK | = `sub` del token de Supabase (`auth.users.id`) |
| `activeVehicleId` | UUID, nullable, FK → Vehicle | `ON DELETE SET NULL`; debe pertenecer al mismo usuario |
| `createdAt` / `updatedAt` | timestamptz | automáticos |

## Vehicle

| Campo | Tipo | Reglas |
|---|---|---|
| `id` | UUID, PK | generado por el servidor |
| `userId` | UUID, FK → Profile | obligatorio; `ON DELETE CASCADE` |
| `make` | text | obligatorio, 1–60 caracteres, recortado |
| `model` | text | obligatorio, 1–60 caracteres, recortado |
| `catalogModelId` | UUID, nullable, FK → CatalogModel | `null` = vehículo no catalogado (FR-002) |
| `year` | int | 1950 ≤ year ≤ año actual + 1 |
| `nickname` | text, nullable | ≤ 40 caracteres |
| `licensePlate` | text, nullable | ≤ 15 caracteres, mayúsculas, sin espacios extremos |
| `fuelType` | `FuelType`, nullable | opcional (FR-001a) |
| `usageType` | `UsageType`, nullable | opcional (FR-001a) |
| `currentOdometerKm` | int | denormalizado (R7); = valor de la lectura `OK` más reciente |
| `lastReadingAt` | timestamptz | denormalizado (R7); = `readAt` de esa lectura |
| `createdAt` / `updatedAt` | timestamptz | automáticos |

**Índices**: `(userId, createdAt)`.

**Reglas**:
- Si `catalogModelId` está presente, `make`/`model` se rellenan con los nombres del catálogo.
- El alta crea el vehículo y su lectura `INITIAL` en una única transacción (FR-003) y lo fija
  como `Profile.activeVehicleId` (US3-1).
- Eliminar un vehículo borra en cascada sus lecturas (FR-013).

## MileageReading

| Campo | Tipo | Reglas |
|---|---|---|
| `id` | UUID, PK | **generado en el cliente** (clave de idempotencia, R5) |
| `vehicleId` | UUID, FK → Vehicle | `ON DELETE CASCADE` |
| `odometerKm` | int | 0 ≤ valor ≤ 2 000 000; entero (edge case de decimales) |
| `readAt` | timestamptz | ≤ ahora + 5 min; por defecto la hora de captura (FR-007) |
| `source` | `ReadingSource` | `INITIAL` solo para la lectura creada en el alta |
| `origin` | `ReadingOrigin` | `OFFLINE_SYNC` si se envió desde la cola offline |
| `reviewStatus` | `ReviewStatus` | `OK` por defecto |
| `confirmedUnusual` | boolean | `true` si el usuario confirmó una distancia inusual (FR-009) |
| `createdAt` / `updatedAt` | timestamptz | automáticos |

**Índices**: `(vehicleId, readAt DESC)`; parcial `(vehicleId) WHERE reviewStatus = 'NEEDS_REVIEW'`.

**Reglas de validación** (compartidas cliente/servidor vía `packages/shared`, R8):
1. **Orden** (FR-008): entre las lecturas `OK` del vehículo, `prev.odometerKm ≤ odometerKm ≤
   next.odometerKm`, donde `prev`/`next` son las inmediatamente anterior/posterior por `readAt`.
   - Origen `ONLINE`: si falla → `422 READING_OUT_OF_ORDER` con `{ minKm, maxKm }`.
   - Origen `OFFLINE_SYNC`: si falla → se guarda con `reviewStatus = NEEDS_REVIEW`.
2. **Plausibilidad** (FR-009): si `(odometerKm − prev.odometerKm) / max(díasEntre, 1) > 1500` y
   `confirmedUnusual = false` → `409 UNUSUAL_DISTANCE` (solo `ONLINE`; las offline ya fueron
   confirmadas en el dispositivo).
3. **Fecha**: `readAt` no puede ser futura.
4. **Eliminación** (FR-012): no se puede eliminar la última lectura `OK` que quede del vehículo →
   `409 LAST_READING_UNDELETABLE`.
5. Tras crear, editar o eliminar una lectura se recalculan `Vehicle.currentOdometerKm` y
   `lastReadingAt` en la misma transacción.

**Transiciones de `reviewStatus`**:

```text
(sync con conflicto) ──► NEEDS_REVIEW ──(usuario corrige valor/fecha y pasa validación)──► OK
                              │
                              └──(usuario elimina)──► (borrada)
```

## CatalogMake

| Campo | Tipo | Reglas |
|---|---|---|
| `id` | UUID, PK | |
| `name` | text, único | p. ej. "Toyota" |

## CatalogModel

| Campo | Tipo | Reglas |
|---|---|---|
| `id` | UUID, PK | |
| `makeId` | UUID, FK → CatalogMake | |
| `name` | text | único por `makeId` |

**Índices**: GIN trigram sobre `unaccent(lower(name))` en ambas tablas (R6).

Datos sembrados por seed versionado; solo lectura para los usuarios.
