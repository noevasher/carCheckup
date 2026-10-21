# Quickstart: Validación de Vehículos y Kilometraje

**Feature**: `001-vehicles-mileage` | Contratos: [openapi.yaml](./contracts/openapi.yaml),
[offline-sync.md](./contracts/offline-sync.md) | Modelo: [data-model.md](./data-model.md)

Guía para comprobar de punta a punta que la feature cumple la spec. No contiene implementación.

## Prerrequisitos

- Node.js 22 LTS y npm 10+.
- Supabase CLI (o Docker) para un Postgres y Auth locales.
- Navegador Chromium para Playwright (`npx playwright install chromium`).
- Variables en `backend/.env` y `frontend/.env` (ver `.env.example` de cada paquete):
  `DATABASE_URL`, `DIRECT_URL`, `SUPABASE_URL`, `SUPABASE_JWKS_URL`, `UNUSUAL_KM_PER_DAY=1500`,
  `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `VITE_API_URL`.

## Puesta en marcha

```bash
npm install                                   # instala todos los workspaces
supabase start                                # Postgres + Auth locales
npm run db:migrate -w backend                 # aplica migraciones Prisma
npm run db:seed -w backend                    # siembra el catálogo de marcas/modelos
npm run dev                                   # backend + frontend en paralelo
```

## Comprobaciones automáticas

```bash
npm run typecheck        # tsc --noEmit en todos los paquetes (Principio II)
npm run lint             # incluye no-explicit-any como error
npm test                 # Vitest: unit + contrato/integración del API
npm run test:e2e         # Playwright, viewport móvil
```

Resultado esperado: todo en verde, sin `any` reportados.

## Escenarios manuales / e2e

Abrir la app en viewport móvil (p. ej. 390×844) con un usuario de prueba recién creado.

| # | Escenario | Resultado esperado | Spec |
|---|---|---|---|
| 1 | Iniciar sesión sin vehículos | Se abre directamente el alta de vehículo | FR-016, US1-1 |
| 2 | Escribir "toy" en marca, elegir "Toyota" → modelo "Corolla", año 2019, 45 000 km, guardar sin combustible ni uso | Pantalla principal muestra el Corolla con 45 000 km; tarda < 60 s | US1-2, US1-5, SC-001 |
| 3 | Alta con marca escrita a mano que no existe en el catálogo | Se guarda; el vehículo queda no catalogado | US1-3, FR-002 |
| 4 | Toque en "Actualizar km" → escribir 45 350 → Confirmar | Teclado numérico abierto al instante; 2 toques; se muestra 45 350 | US2-1, US2-2, FR-006, SC-002 |
| 5 | Introducir 45 000 | Rechazo con mensaje claro y rango válido | US2-3, FR-008 |
| 6 | Cambiar la fecha a hace 3 días e introducir un valor entre lecturas vecinas | Se guarda en su posición en el historial | US2-4, FR-007 |
| 7 | Introducir un valor +5 000 km respecto de ayer | Pide confirmación adicional | US2-5, FR-009 |
| 8 | Activar modo avión (DevTools → Offline), registrar lectura | Aparece como pendiente; al volver la conexión se sincroniza sola y desaparece la marca | US2-6, FR-010 |
| 9 | Repetir 8 forzando que la respuesta se pierda (cerrar la pestaña tras el envío) | Al reabrir no hay lecturas duplicadas | SC-004 |
| 10 | Añadir un segundo vehículo y cambiar de activo con un toque; recargar | El último usado sigue activo | US3, FR-011 |
| 11 | Editar año; abrir historial; borrar una lectura intermedia | Cambios visibles; km actual recalculado | US4, FR-012 |
| 12 | Intentar borrar la única lectura | Rechazo explicado | Edge case, FR-012 |
| 13 | Eliminar un vehículo | Pide confirmación advirtiendo el borrado del historial | US4-4, FR-013 |
| 14 | Con el token del usuario A, pedir `GET /v1/vehicles/{id de B}` | `404` | FR-014 |
| 15 | Instalar la PWA desde el navegador móvil | Se instala con icono y abre a pantalla completa | Principio IV |

## Comprobación de rendimiento

- Usuario con 20 vehículos y 1 000 lecturas cada uno, perfil de red "Fast 4G" en DevTools: la
  pantalla principal muestra vehículo activo y kilometraje en < 2 s (SC-006).
