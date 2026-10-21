# Car Checkup

Plataforma de mantenimiento automotriz para usuarios sin experiencia mecánica. Esta primera
feature (`specs/001-vehicles-mileage`) cubre el alta de vehículos y el registro rápido de
kilometraje, también sin conexión.

## Estructura

| Carpeta | Contenido |
|---|---|
| `packages/shared` | Tipos derivados de Prisma, esquemas Zod y reglas de validación de lecturas, compartidos por backend y frontend |
| `backend` | API REST (Express 5 + Prisma 7 + PostgreSQL/Supabase) |
| `frontend` | PWA (React 19 + Vite + Tailwind), cola offline en IndexedDB |
| `specs/` | Spec Kit: spec, plan, contratos, tareas |

## Puesta en marcha local

Requisitos: Node.js 22+ y PostgreSQL 15+ (local o Supabase CLI).

```bash
npm install
cp backend/.env.example backend/.env      # ajusta DATABASE_URL / DIRECT_URL y Supabase
cp frontend/.env.example frontend/.env
npm run db:migrate -w backend             # aplica migraciones y genera el cliente Prisma
npm run db:seed -w backend                # catálogo de marcas y modelos
npm run dev                               # API en :3000 y PWA en :5173
```

## Mantenimientos (feature 002)

- El catálogo de 13 mantenimientos se siembra en la migración `*_maintenance` (no en el seed).
- Endpoints nuevos: `GET /v1/vehicles/{id}/maintenance`, `PATCH /v1/vehicles/{id}/maintenance/{typeCode}`
  y `GET|POST /v1/vehicles/{id}/services`, `PATCH|DELETE /v1/vehicles/{id}/services/{serviceId}`
  (ver `specs/002-maintenance-estimation/contracts/openapi.yaml`). El cliente envía `X-Timezone`.
- **Regla**: después de cualquier migración que cambie `maintenance_types`, ejecuta
  `npm run db:recompute-maintenance -w backend` para actualizar las estimaciones guardadas.

## Calidad

```bash
npm run typecheck   # TypeScript estricto en los 3 paquetes
npm run lint        # incluye @typescript-eslint/no-explicit-any como error
npm test            # unit (shared) + integración del API (requiere la BD car_checkup_test)
npm run test:e2e    # Playwright en viewport móvil (requiere la BD car_checkup_e2e)
```

Aplica las migraciones a esas bases de datos con
`DATABASE_URL=… DIRECT_URL=… npx prisma migrate deploy` (desde `backend/`).
Las pruebas de integración usan `TEST_DATABASE_URL` (por defecto
`postgresql://localhost:5432/car_checkup_test`) y las e2e `E2E_DATABASE_URL` (por defecto
`car_checkup_e2e`); ambas necesitan las migraciones aplicadas. Las e2e levantan un emulador
local de Supabase Auth (`frontend/tests/e2e/support/fake-auth.ts`) que publica un JWKS y firma
tokens, de modo que el backend verifica igual que en producción.

Escenarios de validación manual: [`specs/001-vehicles-mileage/quickstart.md`](specs/001-vehicles-mileage/quickstart.md).

## Despliegue

- **Frontend (Vercel)**: raíz `frontend`, build `npm run build`, salida `dist`. Variables
  `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `VITE_API_URL`. Configura el rewrite SPA a
  `/index.html`.
- **Backend (Render/Railway/VPS)**: `npm run build -w backend` y `npm run start -w backend`.
  Antes de arrancar una versión nueva: `npm run db:deploy -w backend`.
  - `DATABASE_URL`: pooler de Supabase en modo transacción (puerto 6543, `?pgbouncer=true`).
  - `DIRECT_URL`: conexión directa (5432), usada solo por las migraciones.
  - `SUPABASE_URL`, `SUPABASE_JWKS_URL` (`<SUPABASE_URL>/auth/v1/.well-known/jwks.json`),
    `CORS_ORIGIN` (URL del frontend), `UNUSUAL_KM_PER_DAY` (por defecto 1500).
- **Supabase**: las tablas tienen RLS activado sin políticas; solo el backend (propietario de
  las tablas) accede a los datos.
