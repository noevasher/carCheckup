# Research: Recordatorios por Notificación Push y Correo

**Feature**: `003-email-reminders` | **Date**: 2026-10-22

Resuelve los puntos abiertos del Technical Context de [plan.md](./plan.md). El stack lo fija la
constitución y ya está implementado en 001 y 002 (Express 5, Prisma 7, React 19 PWA, TanStack
Query, estimaciones persistidas en `maintenance_estimates`).

## R1. Notificaciones push

- **Decision**: Estándar **Web Push** (Push API + Notifications API del service worker) con
  claves **VAPID** propias y la librería `web-push` en el backend. Sin servicios de terceros: el
  navegador entrega a su propio servicio push (FCM, APNs web, Mozilla). Las suscripciones se
  guardan por dispositivo (`endpoint`, `p256dh`, `auth`). Respuestas `404`/`410` del servicio push
  → suscripción caducada → se borra (FR-015).
- **Rationale**: Funciona en Chrome/Edge/Firefox Android y en iOS 16.4+ con la PWA instalada; no
  añade proveedores (la constitución no lista ninguno para push) ni costes.
- **Alternatives considered**: Firebase Cloud Messaging (SDK y cuenta extra; Web Push ya usa FCM
  por debajo en Chrome); OneSignal (tercero con datos de usuarios, coste).

## R2. Service worker con manejo de push

- **Decision**: Cambiar `vite-plugin-pwa` de `generateSW` a **`injectManifest`** con un
  `frontend/src/sw.ts` propio: `precacheAndRoute(self.__WB_MANIFEST)` + fallback de navegación
  (igual que hoy) + manejadores `push` (muestra la notificación del payload) y
  `notificationclick` (enfoca una ventana abierta o abre la URL del aviso). Sin botones de acción
  (clarificación Q4).
- **Rationale**: `generateSW` no permite añadir manejadores de eventos propios.

## R3. Proveedor de correo

- **Decision**: **Resend** en producción detrás de la interfaz `EmailSender` (`send(message,
  { idempotencyKey })`), con una implementación `LogEmailSender` para desarrollo y tests (escribe el
  correo en el log y lo guarda en memoria para las aserciones). Se elige con `EMAIL_PROVIDER`
  (`resend` | `log`). La cabecera `Idempotency-Key` de Resend usa `digest:<userId>:<fecha>`.
- **Rationale**: API simple, plan gratuito suficiente para pruebas (3.000 correos/mes), webhooks
  firmados para rebotes y quejas; la interfaz permite cambiar a Brevo o SMTP/Nodemailer sin tocar la
  lógica (constitución, Infraestructura).
- **Alternatives considered**: Brevo (válido; webhooks sin firma estándar); Nodemailer + SMTP
  (sin seguimiento de rebotes integrado).

## R4. Rebotes y quejas

- **Decision**: Webhook `POST /webhooks/resend`, firma verificada con la librería `svix`
  (Resend usa Svix) y payload validado con Zod (Principio II). `email.bounced` (rebote permanente)
  → `emailStatus = BOUNCED`; `email.complained` → `COMPLAINED`. Con estado distinto de `OK` no se
  envían correos y la app muestra un aviso para revisar la dirección (FR-015).

## R5. Programación del proceso

- **Decision**: Una función `runReminders({ now, budgetMs })` invocable de dos formas:
  1. **CLI** `npm run job:reminders -w backend` → para un **Render Cron Job** (cada hora, en el
     minuto 5).
  2. **HTTP** `POST /internal/jobs/reminders` con `Authorization: Bearer <JOBS_SECRET>` → para un
     programador externo gratuito (p. ej. GitHub Actions `schedule`, cada hora) mientras se use el
     plan gratuito de Render, que no incluye cron jobs.
  La ejecución es idempotente: varias ejecuciones o reintentos no duplican avisos.
- **Rationale**: El envío es a las 09:00 de cada zona horaria, así que basta con ejecutar cada hora;
  la función es la misma en ambos disparadores.
- **Alternatives considered**: `pg_cron` + `pg_net` en Supabase llamando al endpoint (posible, pero
  el timeout de `pg_net` es corto frente al despertar de Render gratuito); `setInterval` dentro del
  API (no fiable con instancias que se duermen o escalan).

## R6. Quién toca hoy: `next_digest_at`

- **Decision**: Cada perfil guarda `timeZone` (último `X-Timezone` del dispositivo; por defecto
  `America/Mexico_City`, UTC−6, FR-019) y `nextDigestAt` = próximo 09:00 local (índice). El proceso
  toma lotes de 500 perfiles con `nextDigestAt <= now()` usando `FOR UPDATE SKIP LOCKED` (varias
  ejecuciones en paralelo no se pisan), los procesa y fija `nextDigestAt` al siguiente 09:00 local.
  Si una ejecución se pierde, la siguiente recupera a los atrasados (siguen con `nextDigestAt`
  pasado). Al cambiar la zona horaria se recalcula `nextDigestAt`.
- **Rationale**: Consulta indexada O(usuarios que tocan), sin recorrer todos los usuarios cada hora
  (Principio III, SC-003); como máximo un envío al día por usuario (FR-001).

## R7. Avisos y ciclos (FR-002..FR-005)

- **Decision**:
  - Estado por (vehículo, mantenimiento) en `maintenance_notice_states`: `cycleSignature` =
    `baselineSource|baselineKm|baselineAt|intervalKm|intervalMonths` de la estimación (cambia al registrar un servicio o
    indicar historial previo) y `lastNotifiedStatus` (`UPCOMING`/`OVERDUE`/null).
  - En cada usuario: para cada estimación activa y no pospuesta se deriva el estado con su "hoy"
    (helper de 002). Si la firma cambió → se reinicia el ciclo (un `OK` pasajero no reinicia)
    (`lastNotifiedStatus = null`). Si es `UPCOMING` y no se avisó → aviso `MAINTENANCE_UPCOMING`.
    Si es `OVERDUE` y no se avisó de vencido → aviso `MAINTENANCE_OVERDUE` (aunque no se haya
    avisado el próximo). Nunca se repite un vencido en el mismo ciclo (clarificación Q1).
  - Aviso de kilometraje: si la última lectura válida tiene ≥ 30 días y `lastKmReminderAt` es nulo,
    anterior a la última lectura o de hace ≥ 30 días → aviso `MILEAGE_UPDATE`.
  - Cada aviso se inserta con clave única `(vehicleId, kind, typeCode, cycleKey)`
    (`cycleKey` = firma del ciclo, o la fecha local para kilometraje) → reintentos sin duplicados.
- **Rationale**: Reglas explícitas, testeables y deterministas.

## R8. Envío agrupado (FR-010, FR-010a)

- **Decision**: Por usuario y día: avisos sin entregar ordenados por urgencia (vencidos, próximos,
  kilometraje). **Push**: un payload `{ title, body, url, tag }` a cada suscripción; `body` con el
  aviso más urgente ("Toyota Corolla: cambio de aceite vencido, te pasaste 500 km") + "y N avisos
  más"; `url` = detalle del vehículo, captura de km (`/?capture=<vehicleId>`) o `/` si hay varios
  vehículos. **Correo**: solo con avisos de vehículos con `emailReminders`, `emailStatus = OK` y sin
  baja; máximo 10 avisos agrupados por vehículo; enlace "Ver todo en la app" si hay más. Cada
  entrega se registra en `deliveries` con clave única `(userId, channel, digestDate, target)`.
  Los avisos se marcan entregados cuando al menos un canal se envió; si todo falla se reintentan en
  la siguiente ejecución.

## R9. Dirección de correo del usuario

- **Decision**: Guardar `email` en `profiles` a partir de la claim `email` del JWT de Supabase en
  cada petición (solo escribe si cambió; caché por instancia como `ensureProfile`).
- **Rationale**: No depender del esquema `auth` de Supabase desde Prisma (no existe en local ni en
  tests).

## R10. Baja sin sesión (FR-014)

- **Decision**: Token `base64url(userId) + "." + HMAC-SHA256(UNSUBSCRIBE_SECRET, "unsub:" + userId)`
  (sin caducidad; solo sirve para baja/alta del correo). Enlace en el correo a
  `<APP_URL>/unsubscribe?token=…` (página pública con confirmación y "Deshacer") y cabeceras
  `List-Unsubscribe` + `List-Unsubscribe-Post: List-Unsubscribe=One-Click` (RFC 8058) apuntando a
  `POST /public/unsubscribe?token=…` para la baja de un clic de Gmail/Apple Mail. La baja pone
  `emailUnsubscribedAt` (afecta a todos los vehículos, la push no se toca); "Deshacer" lo borra.
  Comparación de la firma en tiempo constante; token inválido → `404` sin revelar nada.
  La página del enlace pide "Confirmar baja" y nunca da de baja al cargarse: los analizadores de
  enlaces (p. ej. Safe Links) abren las páginas antes que el usuario; la baja de 1 clic real la da
  `List-Unsubscribe-Post` en los clientes de correo.

## R11. Flujo de permiso en la app (FR-007, FR-008, FR-008a)

- **Decision**: Tras `POST /vehicles` correcto: si `Notification.permission === 'default'` y el
  navegador admite push → hoja explicativa → `Notification.requestPermission()` → suscripción con
  `pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: VAPID_PUBLIC_KEY })` →
  `POST /v1/push-subscriptions`. En iPhone sin instalar (`!navigator.standalone`) la hoja explica
  cómo instalar. Si se deniega / no se admite y el vehículo no tiene correo → diálogo "¿Quieres
  recibir los avisos por correo?" → `PATCH /vehicles/:id { emailReminders: true }`. Una marca por
  dispositivo (`localStorage`) evita volver a insistir; la edición del vehículo ofrece "Activar
  notificaciones en este dispositivo". Al abrir la app con vehículos existentes y sin marca → el
  mismo flujo una vez (edge case "vehículos anteriores").

## R12. Retención (FR-016)

- **Decision**: Al final de cada ejecución, borrado por lotes de `notices`/`deliveries` con más de
  12 meses que no correspondan al ciclo vigente (`cycleKey` distinto del de
  `maintenance_notice_states`). Borrado en cascada al eliminar vehículo o cuenta.

## R13. Testing

- **Decision**: Unit tests de reglas (ciclos, próximo 09:00 local con DST, agrupación, payloads,
  tokens); integración del proceso con `LogEmailSender` y un `PushSender` falso (incluido 410 →
  borrado), webhooks firmados, baja pública; e2e: interruptor de correo, rechazo de permiso →
  pregunta de correo, página de baja. La entrega real push/correo se verifica manualmente en el
  despliegue (dispositivos reales).
