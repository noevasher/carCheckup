# Contract: Contenido de notificaciones push y correos

**Feature**: `003-email-reminders` | Ver [research.md](../research.md) R8, R10.

## Payload push (JSON cifrado por Web Push)

```json
{
  "title": "Car Checkup",
  "body": "Toyota Corolla: cambio de aceite vencido, te pasaste 500 km. Y 2 avisos más.",
  "url": "/vehicles/<vehicleId>/maintenance",
  "tag": "digest-2026-10-22"
}
```

| Caso | `body` | `url` |
|---|---|---|
| 1 aviso de mantenimiento | `<vehículo>: <mantenimiento> <vencido|próximo>, <te pasaste N km | faltan N km | vence en N días>.` | detalle de mantenimientos del vehículo |
| 1 aviso de kilometraje | `¿Cuánto marca hoy tu <vehículo>? Actualízalo para afinar tus recomendaciones.` | `/?capture=<vehicleId>` |
| Varios, un vehículo | detalle del más urgente + `Y N avisos más.` | detalle de ese vehículo |
| Varios vehículos | detalle del más urgente + `Y N avisos más.` | `/` |

- `<vehículo>` = apodo o "marca modelo" (como en la app); nunca la matrícula (FR-010a).
- `tag` por día: una notificación nueva sustituye a la anterior del mismo día en el dispositivo.
- Sin `actions` (clarificación: solo abrir la app).

## Correo

- **Asunto**: `Tu <vehículo>: <mantenimiento> <estado>` (1 aviso) o `Tienes N mantenimientos por
  revisar` (varios).
- **Remitente**: `EMAIL_FROM` (p. ej. `Car Checkup <avisos@tudominio.com>`).
- **Cabeceras**: `List-Unsubscribe: <https://API/public/unsubscribe?token=…>, <mailto:…>` y
  `List-Unsubscribe-Post: List-Unsubscribe=One-Click`.
- **Cuerpo** (HTML + texto plano, ≤ 600 px, estilos en línea, colores de los tokens de la app):
  1. Saludo breve.
  2. Un bloque por vehículo (vencidos primero): nombre del mantenimiento, estado, km/días, fecha
     estimada y una frase "por qué importa" (textos de 002). Avisos de kilometraje con el botón
     "Actualizar kilometraje".
  3. Botón "Ver en Car Checkup" (detalle del vehículo o `/`).
  4. Si hay más de 10 avisos: "Y N avisos más en la app".
  5. Pie: por qué recibe el correo, "Dejar de recibir estos correos" (enlace de baja) y nota de
     que las notificaciones push se gestionan en el dispositivo.
- Todos los textos dinámicos (apodos, notas) se escapan en HTML.
