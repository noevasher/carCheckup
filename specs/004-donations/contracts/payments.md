# Contrato con los proveedores de pago

**Feature**: `004-donations`. Decisiones en [research.md](../research.md) R1–R4, R6.

## Stripe (webhook `/webhooks/stripe`)

Eventos suscritos en el panel de Stripe y efecto:

| Evento | Efecto |
|---|---|
| `checkout.session.completed` (mode `payment`, `payment_status=paid`) | Donation ONE_TIME → CONFIRMED; guarda `providerPaymentId` (payment_intent); recalcula beneficio; correo de agradecimiento |
| `checkout.session.expired` | Donation ONE_TIME PENDING → CANCELED; Subscription PENDING → CANCELED |
| `checkout.session.completed` (mode `subscription`) | Guarda `providerSubscriptionId` (aún sin cobro confirmado) |
| `invoice.paid` (con suscripción) | Crea Donation MONTHLY_CHARGE CONFIRMED con `periodStart/End` de la línea; Subscription → ACTIVE, `paidUntil`, `nextChargeAt`; recalcula beneficio; correo |
| `invoice.payment_failed` | Subscription → PAST_DUE |
| `customer.subscription.deleted` | Subscription → CANCELED |
| `charge.refunded` (total) | Donation → REFUNDED; recalcula |
| `charge.dispute.created` / `charge.dispute.closed` | → DISPUTED / según resultado (won → CONFIRMED, lost → REFUNDED); recalcula |

Enlace con nuestros datos: `metadata.donationId` / `metadata.subscriptionId` en la sesión y en la
suscripción (`subscription_data.metadata`).

## PayPal (webhook `/webhooks/paypal`)

| Evento | Efecto |
|---|---|
| `CHECKOUT.ORDER.APPROVED` | Si no se capturó al volver, el backend captura la orden (no confirma) |
| `PAYMENT.CAPTURE.COMPLETED` | Donation ONE_TIME → CONFIRMED (`custom_id` = donationId); recalcula; correo |
| `PAYMENT.CAPTURE.DENIED` | → FAILED |
| `PAYMENT.CAPTURE.REFUNDED` | → REFUNDED; recalcula |
| `BILLING.SUBSCRIPTION.ACTIVATED` | Guarda estado del proveedor (el beneficio empieza con el primer cobro) |
| `PAYMENT.SALE.COMPLETED` (con `billing_agreement_id`) | Donation MONTHLY_CHARGE CONFIRMED, periodo de 1 mes desde la venta; Subscription → ACTIVE, `paidUntil`; recalcula; correo |
| `BILLING.SUBSCRIPTION.PAYMENT.FAILED` | Subscription → PAST_DUE |
| `BILLING.SUBSCRIPTION.CANCELLED` / `SUSPENDED` / `EXPIRED` | Subscription → CANCELED |
| `PAYMENT.SALE.REFUNDED` | Cobro mensual → REFUNDED; recalcula |
| `CUSTOMER.DISPUTE.CREATED` / `RESOLVED` | → DISPUTED / según resultado; recalcula |

## Reglas comunes

- Verificar la firma **antes** de leer el contenido; firma inválida → 400 sin cambios.
- Insertar `PaymentEvent (provider, eventId)` en la misma transacción que el cambio; si ya existe,
  responder 200 sin efecto.
- Eventos de tipos no listados o de objetos desconocidos → 200 y se registran en el log.
- Responder en < 5 s; el correo de agradecimiento se envía después del commit y sus fallos no
  afectan a la respuesta del webhook.
