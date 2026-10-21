# Contract: Cola offline de lecturas de kilometraje

**Feature**: `001-vehicles-mileage` | Ver [research.md R5](../research.md) y
[openapi.yaml](./openapi.yaml).

Contrato entre la UI, la cola local del dispositivo y el API para cumplir FR-010 y SC-004.

## Elemento de la cola (IndexedDB, store `pendingReadings`)

| Campo | Tipo | Descripción |
|---|---|---|
| `id` | UUID | generado al capturar; es el `id` de la lectura en el servidor |
| `vehicleId` | UUID | vehículo al que pertenece |
| `odometerKm` | int | valor capturado |
| `readAt` | ISO 8601 | fecha/hora de la lectura |
| `confirmedUnusual` | boolean | el usuario ya confirmó distancia inusual |
| `queuedAt` | ISO 8601 | momento de encolado (orden FIFO) |
| `attempts` | int | intentos de envío realizados |
| `lastError` | string \| null | último código de error recibido |

## Reglas

1. **Captura**: toda lectura nueva se escribe primero en la cola, se muestra al instante en la UI
   como pendiente y se intenta enviar si hay conexión. Online u offline, el camino es el mismo.
2. **Envío**: `POST /v1/vehicles/{vehicleId}/readings` con el `id` de la cola y
   `origin: "OFFLINE_SYNC"` si el elemento se encoló sin conexión, `"ONLINE"` en otro caso.
3. **Disparadores de sincronización**: arranque de la app, evento `online`, app vuelve a primer
   plano y reintento con backoff exponencial (1 s → 2 s → … máx. 5 min).
4. **Orden**: los elementos se envían en FIFO por `queuedAt`, uno a la vez por vehículo.
5. **Resultado**:

| Respuesta | Acción en el cliente |
|---|---|
| `201` o `200` (replay idempotente) | quitar de la cola; refrescar el vehículo |
| `200`/`201` con `reviewStatus: NEEDS_REVIEW` | quitar de la cola; mostrar aviso "revisa esta lectura" |
| `422`/`409` (solo en envíos `ONLINE` interactivos) | quitar de la cola y mostrar el error en la captura |
| `404` (vehículo eliminado) | descartar el elemento e informar al usuario |
| `401` | pausar la cola hasta que se renueve la sesión |
| red / `5xx` | mantener, incrementar `attempts`, reintentar con backoff |

6. **Sin duplicados**: como el `id` lo genera el cliente y el servidor es idempotente por `id`,
   reenviar un elemento cuya respuesta se perdió nunca crea una segunda lectura.
7. **Cierre de sesión**: la cola se conserva por usuario (clave `userId`) y solo se envía con
   la sesión del mismo usuario.
