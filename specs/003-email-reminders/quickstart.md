# Quickstart: Validación de Recordatorios por Push y Correo

**Feature**: `003-email-reminders` | Contratos: [openapi.yaml](./contracts/openapi.yaml),
[notifications.md](./contracts/notifications.md) | Modelo: [data-model.md](./data-model.md)

## Prerrequisitos

Los de 001/002, más:

```bash
npx web-push generate-vapid-keys        # una vez; pegar en las variables
```

- `backend/.env`: `APP_URL=http://localhost:5173`, `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`,
  `VAPID_SUBJECT=mailto:tu@correo.com`, `EMAIL_PROVIDER=log` (en local), `EMAIL_FROM`,
  `UNSUBSCRIBE_SECRET` (≥ 32 caracteres), `JOBS_SECRET` (≥ 32 caracteres); en producción
  `EMAIL_PROVIDER=resend`, `RESEND_API_KEY`, `RESEND_WEBHOOK_SECRET`.
- `frontend/.env`: `VITE_VAPID_PUBLIC_KEY` (la misma clave pública).
- Aplicar migraciones a dev/test/e2e (ver README).

## Comprobaciones automáticas

```bash
npm run typecheck && npm run lint && npm test && npm run test:e2e
```

## Ejecutar el proceso a mano

```bash
npm run job:reminders -w backend                      # una pasada (CLI)
curl -X POST -H "Authorization: Bearer $JOBS_SECRET" http://localhost:3000/internal/jobs/reminders
```

## Escenarios

| # | Escenario | Resultado esperado | Spec |
|---|---|---|---|
| 1 | Alta de vehículo: el formulario muestra "Recibir también los avisos por correo" desactivado | Interruptor visible, apagado, con la frase sobre push | FR-007, US2-1 |
| 2 | Guardar el vehículo en Chrome (permiso pendiente) → aceptar | Se crea la suscripción (`POST /v1/push-subscriptions` 201); en local funciona con `npm run dev` gracias a `devOptions` | FR-008, US2-2/3 |
| 3 | Repetir con el permiso denegado | Pregunta "¿Quieres recibir los avisos por correo?"; "Sí" activa el correo del vehículo | US2-4 |
| 4 | Denegar push y responder "No" al correo | El flujo sigue; semáforo visible. Al registrar otro vehículo no se repite la explicación del permiso, pero sí la pregunta del correo para ese vehículo | US2-5, FR-008a |
| 5 | Vehículo con aceite "Próximo" y `nextDigestAt` en el pasado → ejecutar el proceso | 1 push con el detalle; 1 correo si el vehículo tiene correo (`EMAIL_PROVIDER=log` lo muestra en el log) | US1-1, FR-010a |
| 6 | Ejecutar el proceso otra vez el mismo día | 0 nuevos envíos | US1-4, SC-002 |
| 7 | Pasar el aceite a "Vencido" y ejecutar al día siguiente | Aviso de vencido; al otro día, nada más (no se repite) | US1-2, US1-7 |
| 8 | Registrar el servicio y volver a "Próximo" en el siguiente ciclo | Nuevo aviso | US1-6, FR-003 |
| 9 | Posponer el mantenimiento y ejecutar | No se incluye | US1-5 |
| 10 | Vehículo sin lecturas en 30 días → ejecutar | Aviso de kilometraje; tocarlo abre la captura del vehículo | US3 |
| 11 | Enlace "Dejar de recibir estos correos" del correo | La página pide "Confirmar baja" (no da de baja al abrirse); tras confirmar, "Deshacer" disponible; sin correos, push intacta | US4, FR-014 |
| 12 | Token de baja alterado | 404, sin cambios | US4-2 |
| 13 | Suscripción push que responde 410 | Se borra la suscripción | FR-015 |
| 14 | Webhook de rebote firmado | Perfil `BOUNCED`; la app muestra aviso para revisar el correo; no más correos | FR-015 |
| 15 | Usuario con `X-Timezone: Europe/Madrid` | `nextDigestAt` = 09:00 en Madrid | FR-019 |

## Rendimiento

Con 100.000 perfiles sintéticos (script de carga del plan) la pasada completa con `PushSender` y
`EmailSender` falsos termina en < 1 h (SC-003).
