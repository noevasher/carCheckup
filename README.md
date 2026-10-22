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

Frontend en **Vercel**, API en **Render** y base de datos y login en **Supabase**. El repo incluye
`vercel.json` y `render.yaml`, así que solo hay que conectar el repo y pegar las variables.

### 1. Supabase

1. En **Connect** copia dos cadenas de conexión:
   - **Transaction pooler** (puerto 6543) → `DATABASE_URL`, añadiendo `?pgbouncer=true` al final.
   - **Session pooler** (puerto 5432, host `aws-0-…pooler.supabase.com`) → `DIRECT_URL`.
     No uses la conexión directa `db.<ref>.supabase.co`: en el plan gratuito es solo IPv6 y
     Render no la alcanza.
2. En **Project Settings → JWT Keys** comprueba que el proyecto usa claves de firma asimétricas:
   `https://<ref>.supabase.co/auth/v1/.well-known/jwks.json` debe devolver `"keys": [...]` no vacío.
3. Las migraciones y el catálogo se aplican solos al arrancar el API (paso 2). Para hacerlo a mano:
   `DATABASE_URL=<session pooler> DIRECT_URL=<session pooler> npm run db:deploy -w backend && DATABASE_URL=<session pooler> npm run db:seed -w backend`.

### 2. API en Render

1. **New → Blueprint**, elige el repo y la rama; Render lee `render.yaml`.
2. Rellena las variables marcadas: `DATABASE_URL`, `DIRECT_URL`, `SUPABASE_URL`,
   `SUPABASE_JWKS_URL` y `CORS_ORIGIN` (la URL de Vercel; si aún no la tienes, ponla después).
3. Al terminar, `https://<servicio>.onrender.com/health` debe responder `{"status":"ok"}`.
   En el plan gratuito el servicio se duerme tras 15 min sin uso; la primera petición tarda ~50 s.

### 3. PWA en Vercel

1. **Add New → Project**, importa el repo. Deja la raíz del proyecto en la raíz del repo
   (Vercel usa `vercel.json`: genera el cliente Prisma, compila `frontend` y publica `frontend/dist`).
2. Variables: `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` (clave publishable o anon) y
   `VITE_API_URL=https://<servicio>.onrender.com`.
3. Vuelve a Render y pon la URL de Vercel en `CORS_ORIGIN` (varias URLs separadas por comas).

### 4. Supabase Auth

En **Authentication → URL Configuration**: **Site URL** = URL de Vercel, y añádela también en
**Redirect URLs** (además de `http://localhost:5173` para desarrollo).

### 5. Probar en el celular

Abre la URL de Vercel, pide el enlace mágico y ábrelo desde el correo en el mismo teléfono. Para
instalarla: Safari → Compartir → "Añadir a pantalla de inicio"; Chrome → menú → "Instalar app".

### Notas

- Las tablas tienen RLS activado sin políticas; solo el backend (propietario de las tablas) accede
  a los datos.
- Después de cualquier migración que cambie `maintenance_types`, ejecuta
  `npm run db:recompute-maintenance -w backend` con las variables de producción.
