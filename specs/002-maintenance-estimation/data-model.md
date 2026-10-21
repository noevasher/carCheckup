# Data Model: Motor de Estimación de Mantenimiento

**Feature**: `002-maintenance-estimation` | **Date**: 2026-10-20

Cambios sobre `backend/prisma/schema.prisma` (fuente de verdad, Principio II). Se suma al modelo
de [001](../001-vehicles-mileage/data-model.md). Nombres en inglés en código, tablas snake_case.

## Diagrama

```text
Vehicle (001) ─1───N─ ServiceRecord ─1───N─ ServiceRecordItem ─N───1─ MaintenanceType
   │  │                    │ 0..1                                          │
   │  │                    └──► MileageReading (001, source = SERVICE)     │
   │  ├─1───N─ VehicleMaintenanceSetting ─N──────────────────────1─────────┤
   │  └─1───N─ MaintenanceEstimate ─N────────────────────────────1─────────┘
```

## Cambios en enums existentes

| Enum | Cambio | Motivo |
|---|---|---|
| `ReadingSource` | + `SERVICE` | Lectura creada al registrar un servicio (FR-012a, R8) |

## Enums nuevos

| Enum | Valores |
|---|---|
| `MaintenanceTypeCode` | `OIL_CHANGE`, `ENGINE_AIR_FILTER`, `CABIN_AIR_FILTER`, `TIRE_ROTATION`, `ALIGNMENT_BALANCING`, `TIRE_REPLACEMENT`, `BRAKE_INSPECTION`, `BRAKE_FLUID`, `COOLANT`, `SPARK_PLUGS`, `TIMING_BELT`, `TRANSMISSION_FLUID`, `BATTERY_CHECK` |
| `BaselineSource` | `SERVICE`, `PRIOR`, `VEHICLE_REGISTRATION` |
| `IntervalSource` | `DEFAULT`, `CITY_ADJUSTED`, `CUSTOM` |
| `PaceSource` | `READINGS`, `USAGE_DEFAULT` |
| `LimitingFactor` | `KM`, `TIME` |

## MaintenanceType (catálogo, sembrado por migración)

| Campo | Tipo | Reglas |
|---|---|---|
| `code` | `MaintenanceTypeCode`, PK | |
| `intervalKm` | int, nullable | > 0; al menos uno de `intervalKm`/`intervalMonths` |
| `intervalMonths` | int, nullable | > 0 |
| `fuelTypes` | `FuelType[]` | combustibles a los que aplica |
| `appliesWhenFuelUnknown` | boolean | `true` para mantenimientos comunes a vehículos de combustión (edge case "combustible no indicado") |
| `severeUsageSensitive` | boolean | intervalo en km −20 % con uso `CITY` (FR-017) |
| `sortOrder` | int | orden en el detalle |

Valores iniciales (spec, Assumptions):

| code | km | meses | fuelTypes | si combustible desconocido | uso severo |
|---|---|---|---|---|---|
| OIL_CHANGE | 10.000 | 12 | GASOLINE, DIESEL, HYBRID | sí | sí |
| ENGINE_AIR_FILTER | 20.000 | 24 | GASOLINE, DIESEL, HYBRID | sí | sí |
| CABIN_AIR_FILTER | 15.000 | 12 | todos | sí | sí |
| TIRE_ROTATION | 10.000 | 12 | todos | sí | no |
| ALIGNMENT_BALANCING | 10.000 | 12 | todos | sí | no |
| TIRE_REPLACEMENT | 50.000 | 72 | todos | sí | no |
| BRAKE_INSPECTION | 20.000 | 12 | todos | sí | sí |
| BRAKE_FLUID | — | 24 | todos | sí | no |
| COOLANT | 60.000 | 48 | GASOLINE, DIESEL, HYBRID | sí | no |
| SPARK_PLUGS | 40.000 | 48 | GASOLINE, HYBRID | no | no |
| TIMING_BELT | 100.000 | 72 | GASOLINE, DIESEL, HYBRID | sí | no |
| TRANSMISSION_FLUID | 60.000 | 48 | GASOLINE, DIESEL, HYBRID | sí | no |
| BATTERY_CHECK | — | 12 | todos | sí | no |

Bujías no se muestran con combustible desconocido porque los diésel no las llevan.

**Cambios futuros del catálogo**: toda migración que modifique intervalos o aplicabilidad debe ir
seguida de `db:recompute-maintenance` para actualizar `maintenance_estimates`.

## VehicleMaintenanceSetting

Una fila solo cuando el usuario cambia algo; sin fila = valores por defecto.

| Campo | Tipo | Reglas |
|---|---|---|
| `vehicleId` + `typeCode` | PK compuesta | FK a Vehicle (`ON DELETE CASCADE`) y MaintenanceType |
| `enabled` | boolean, default `true` | FR-018 |
| `customIntervalKm` | int, nullable | 500 ≤ valor ≤ 300.000 |
| `customIntervalMonths` | int, nullable | 1 ≤ valor ≤ 120 |
| `priorKm` | int, nullable | 0 ≤ valor ≤ km actual (US3) |
| `priorDate` | date, nullable | ≤ hoy |
| `priorUnknown` | boolean, default `false` | "No lo sé" (US3-2); excluyente con `priorKm`/`priorDate` |
| `snoozedUntil` | date, nullable | = hoy + 7 días al posponer (FR-007a) |
| `updatedAt` | timestamptz | |

**Reglas**: cambiar intervalo, desactivar o registrar un servicio de ese tipo pone
`snoozedUntil = null`.

## ServiceRecord

| Campo | Tipo | Reglas |
|---|---|---|
| `id` | UUID, PK | generado en el cliente (idempotencia) |
| `vehicleId` | UUID, FK → Vehicle | `ON DELETE CASCADE` |
| `performedAt` | timestamptz | ≤ ahora + 5 min; mediodía local si es un día pasado |
| `odometerKm` | int | 0 ≤ valor ≤ 2.000.000; encaja entre lecturas `OK` vecinas (FR-012) |
| `notes` | text, nullable | ≤ 500 caracteres |
| `readingId` | UUID, nullable, FK → MileageReading | lectura creada por este servicio (FR-012a); `ON DELETE SET NULL` |
| `createdAt` / `updatedAt` | timestamptz | |

**Índices**: `(vehicleId, performedAt DESC)`.

## ServiceRecordItem

| Campo | Tipo | Reglas |
|---|---|---|
| `serviceRecordId` + `typeCode` | PK compuesta | ≥ 1 ítem por servicio (FR-011); `ON DELETE CASCADE` |

**Índices**: `(typeCode, serviceRecordId)` para encontrar el último servicio de un tipo.

## MaintenanceEstimate (derivada; la escribe solo el motor)

| Campo | Tipo | Descripción |
|---|---|---|
| `vehicleId` + `typeCode` | PK compuesta | solo para mantenimientos aplicables y activos |
| `baselineSource` | `BaselineSource` | R5 |
| `baselineKm` | int | |
| `baselineAt` | timestamptz | |
| `intervalKm` / `intervalMonths` | int, nullable | intervalo aplicado |
| `intervalSource` | `IntervalSource` | R6 |
| `dueKm` | int, nullable | baselineKm + intervalKm |
| `dueByTimeAt` | timestamptz, nullable | baselineAt + intervalMonths |
| `paceKmPerDay` | decimal(8,2) | R4 |
| `paceSource` | `PaceSource` | |
| `estimatedByKmAt` | timestamptz, nullable | null si ritmo 0 o sin intervalo en km |
| `estimatedDueAt` | timestamptz, nullable | mínimo de `dueByTimeAt` y `estimatedByKmAt` |
| `limitingFactor` | `LimitingFactor`, nullable | cuál determina `estimatedDueAt` |
| `computedAt` | timestamptz | |

**Índices**: `(estimatedDueAt)` para el futuro cron de recordatorios (Principio III).

**Recalculo** (`recomputeVehicleMaintenance(tx, vehicleId)`, misma transacción, FR-019):
creación/edición/borrado de lecturas; edición de vehículo (combustible, uso); creación/edición/
borrado de servicios; cambios de configuración. Borra las filas de mantenimientos que dejan de
aplicar o se desactivan.

## Valores derivados al leer (no persistidos)

| Valor | Regla (R7) |
|---|---|
| `status` | `OVERDUE` si `currentKm ≥ dueKm` o `hoy ≥ dueByTimeAt`; `UPCOMING` si `dueKm − currentKm ≤ 1.000` o `estimatedDueAt − hoy ≤ 30 días`; si no, `OK` |
| `remainingKm` | `dueKm − currentKm` (negativo = km de retraso) |
| `overdueDays` | `hoy − dueByTimeAt` si > 0 |
| `snoozed` | `snoozedUntil > hoy` |
| `askHistory` | `baselineSource = VEHICLE_REGISTRATION` y no `priorUnknown` (US3-1) |
