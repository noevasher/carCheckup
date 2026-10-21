# Quickstart: Validación del Motor de Estimación de Mantenimiento

**Feature**: `002-maintenance-estimation` | Contrato: [openapi.yaml](./contracts/openapi.yaml) |
Modelo: [data-model.md](./data-model.md) | Reglas: [research.md](./research.md) R4–R9

## Prerrequisitos

Los mismos de [001](../001-vehicles-mileage/quickstart.md) (Node 22+, PostgreSQL con las BDs
`car_checkup_dev`, `car_checkup_test`, `car_checkup_e2e`, `frontend/.env`, `backend/.env`).

```bash
npm install
npm run db:migrate -w backend     # incluye el catálogo de mantenimientos
# aplicar también a las BDs de test y e2e (ver README)
```

## Comprobaciones automáticas

```bash
npm run typecheck && npm run lint
npm test             # motor (unit, packages/shared) + API (integración)
npm run test:e2e     # incluye los escenarios de mantenimiento
```

## Escenarios (viewport móvil)

Vehículo de partida: Toyota Corolla 2019, gasolina, 45.000 km dados de alta hoy.

| # | Escenario | Resultado esperado | Spec |
|---|---|---|---|
| 1 | Alta reciente, uso sin indicar | Pantalla principal: "Todo al día" y el próximo mantenimiento (aceite a 55.000 km, fecha ≈ hoy + 250 días con 40 km/día) | FR-007, FR-015, US1-11 |
| 2 | Abrir "¿Por qué?" del aceite | Explicación: cada 10.000 km o 12 meses, desde el registro del vehículo con 45.000 km, ritmo promedio 40 km/día por uso sin indicar | FR-008, US1-4 |
| 3 | Cambiar uso habitual a "Ciudad" | Aceite pasa a 8.000 km (53.000 km); explicación menciona uso en ciudad; ritmo 30 km/día | FR-017, US1-5 |
| 4 | Registrar lectura de 54.500 km hoy (confirmar la distancia inusual) | Aceite "Próximo" (500 km); aparece en la pantalla principal | FR-006, FR-019 |
| 5 | Registrar lectura de 55.500 km | Aceite "Vencido" (2.500 km de retraso), primero en la lista | US1-2 |
| 6 | "Ya lo hice" sobre el aceite → Guardar | 2 toques; aceite pasa a "Al día" desde 55.500 km | FR-010, US2-1, SC-003 |
| 7 | Registrar servicio con km del taller 56.000 (> último) | Servicio guardado y nueva lectura 56.000 km en el historial ("Al registrar un servicio") | FR-012a, US2-5 |
| 8 | Registrar servicio con km 40.000 | Rechazo con rango válido | FR-012, US2-4 |
| 9 | Eliminar los servicios de los pasos 6 y 7 | El aceite vuelve a calcularse desde el registro del vehículo | FR-013, US2-6 |
| 10 | "Indicar cuándo se hizo" → hace 10 meses con 44.000 km | Aceite "Al día", límite por tiempo (vence en ~2 meses); explicación lo indica. Con solo la fecha, el km de entonces se estima con el ritmo (~33.000 km) y el aceite sale "Vencido" por km | US3-3, FR-016 |
| 11 | "No lo sé" en otro mantenimiento | Deja de ofrecer "Indicar cuándo se hizo" | US3-2 |
| 12 | Posponer una alerta | Desaparece de la pantalla principal 7 días; en el detalle "pospuesto hasta …" | FR-007a, US1-8 |
| 13 | Personalizar aceite a 15.000 km; luego "Volver al recomendado" | Recalcula con 15.000; explicación "personalizado"; luego vuelve a 10.000/8.000 | US4-1, US4-2 |
| 14 | Desactivar "Banda de distribución" | Deja de verse; se puede reactivar en el detalle | US4-3 |
| 15 | Cambiar combustible a "Eléctrico" | Desaparecen aceite, filtro de aire del motor, refrigerante, bujías, banda y aceite de transmisión | US1-9 |
| 16 | Segundo vehículo con un vencido, activo el primero | Chip del segundo con marca y contador "1" | FR-007b, US1-10 |
| 17 | Con datos cargados, recargar sin conexión | Se muestran vehículos, km y mantenimientos desde la caché; registrar servicio informa que requiere conexión | Assumptions, R10 |
| 18 | Con el token del usuario A, `GET /v1/vehicles/{id de B}/maintenance` | `404` | FR-021 |

## Rendimiento

Con el fixture de 001 (20 vehículos × 1.000 lecturas) más 10 servicios por vehículo: la pantalla
principal (vehículos + mantenimientos del activo) sigue cargando en < 2 s en "Fast 4G" (SC-006).
