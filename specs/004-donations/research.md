# Research: Donaciones con Stripe y PayPal

**Feature**: `004-donations` | **Date**: 2026-10-23

## R1. Stripe: Checkout alojado para únicas y mensuales

- **Decision**: Stripe Checkout (página alojada por Stripe) creado desde el backend con el SDK
  oficial `stripe`: `mode: 'payment'` para donaciones únicas y `mode: 'subscription'` para las
  mensuales, ambos con `price_data` en línea (`currency: 'mxn'`, `unit_amount` = monto × 100,
  `recurring: { interval: 'month' }` en las mensuales). `success_url` y `cancel_url` vuelven a
  `/support/result?donation=<id>`; `client_reference_id` y `metadata.donationId` enlazan la sesión.
- **Rationale**: FR-005 (la app nunca toca la tarjeta; PCI SAQ-A), montos libres sin crear
  productos por monto, Apple Pay / Google Pay incluidos sin trabajo extra.
- **Alternatives considered**: Payment Element embebido (más código y más alcance PCI);
  Payment Links fijos (no permiten monto libre ni enlazar al usuario de forma fiable).

## R2. PayPal: Orders v2 y Subscriptions con cliente REST propio

- **Decision**: Cliente REST mínimo con `fetch` + validación Zod de respuestas (sin SDK):
  - Únicas: `POST /v2/checkout/orders` (`intent: CAPTURE`, `amount` MXN, `custom_id` =
    donationId, `application_context.return_url/cancel_url`), redirección al enlace `approve`;
    al volver, el backend llama `POST /v2/checkout/orders/{id}/capture`.
  - Mensuales: un producto "Donación mensual" y **un plan por monto** (`MONTH`, `INFINITE`
    ciclos) creado la primera vez que se usa ese monto y guardado en `paypal_plans`;
    `POST /v1/billing/subscriptions` con `custom_id` = id de la suscripción interna.
  - Token OAuth `client_credentials` en caché hasta su expiración.
- **Rationale**: El SDK oficial de servidor es pesado y cambia a menudo; solo se necesitan 6
  llamadas. Plan por monto: PayPal exige un plan para suscripciones y los montos se repiten
  (sugeridos), así que la tabla de planes crece poco.
- **Alternatives considered**: `@paypal/paypal-server-sdk` (dependencia grande, tipos generados
  que no cubren suscripciones); planes con `quantity` (UI de PayPal confusa para el donante).

## R3. Confirmación solo por webhook firmado

- **Decision**: El estado "Confirmada" lo pone **únicamente** el webhook verificado
  (constitución):
  - Stripe: `stripe.webhooks.constructEvent(rawBody, Stripe-Signature, STRIPE_WEBHOOK_SECRET)`
    sobre el cuerpo crudo (`express.raw`, igual que el webhook de Resend en 003).
  - PayPal: `POST /v1/notifications/verify-webhook-signature` con las cabeceras
    `PAYPAL-TRANSMISSION-*` y `PAYPAL_WEBHOOK_ID`; solo si responde `SUCCESS`.
  - La captura de PayPal al volver y la página de resultado **no** confirman: solo disparan la
    captura o consultan el estado (FR-006, FR-008).
- **Rationale**: Es la regla de la constitución y evita marcar como pagado algo que el usuario
  solo aprobó.
- **Alternatives considered**: Confirmar con la respuesta de la captura (rápido, pero contradice
  la regla); verificación local del certificado de PayPal (más código, sin ventaja real).

## R4. Idempotencia de eventos y de inicios de pago

- **Decision**:
  - Tabla `payment_events` con único `(provider, eventId)`: se inserta en la misma transacción
    que el cambio de estado; si ya existe, se responde 200 sin hacer nada (FR-007).
  - Los eventos fuera de orden se resuelven con transiciones permitidas (data-model: una
    donación "Reembolsada" no vuelve a "Confirmada").
  - Iniciar un pago lleva `checkoutKey` (UUID generado al abrir la pantalla); único por
    `(userId, checkoutKey)`: un doble toque devuelve la misma URL de pago mientras la sesión siga
    abierta (Stripe: `idempotencyKey` = checkoutKey; PayPal: `PayPal-Request-Id` = checkoutKey).
- **Rationale**: Edge cases "doble toque" y "aviso repetido o fuera de orden".

## R5. Cálculo del beneficio sin anuncios

- **Decision**: Función pura `computeAdFreeUntil({ grants, periods, now })` en
  `packages/shared/src/donations/benefit.ts`:
  - `periods`: intervalos `[start, end)` cubiertos por cobros mensuales confirmados y no
    reembolsados.
  - `grants`: donaciones únicas confirmadas y no reembolsadas, con `days = floor(amount × 30 / 50)`
    y su fecha de confirmación.
  - Recorrido cronológico: cada grant añade sus días a partir de
    `max(fechaDelGrant, finActualDelBeneficio)`, saltando los días cubiertos por `periods`
    (los días se "guardan" mientras haya una mensual pagada: clarificación Q2).
  - Resultado guardado en `profiles.ad_free_until` (desnormalizado) y recalculado en cada
    confirmación, reembolso, disputa o cobro mensual.
- **Rationale**: Determinista y testeable; reembolsar = quitar el grant o periodo y recalcular
  (FR-014d) sin lógica especial. La feature de anuncios solo lee `adFreeUntil`.
- **Alternatives considered**: Sumar días a una fecha guardada (no permite deshacer reembolsos
  ni pausar durante la mensual).

## R6. Cancelación de la donación mensual

- **Decision**: Stripe: `subscriptions.update(id, { cancel_at_period_end: true })`. PayPal:
  `POST /v1/billing/subscriptions/{id}/cancel` (PayPal no tiene "al final del periodo"; deja de
  cobrar y el beneficio local dura hasta `paidUntil`). En ambos casos el estado local pasa a
  "Cancelada" al confirmarlo el proveedor por API, y los webhooks posteriores lo mantienen.
- **Rationale**: FR-014b: sin cargos posteriores y beneficio hasta el final del periodo pagado.
- **Alternatives considered**: Cancelación inmediata con prorrateo (más complejo, no pedido).

## R7. Pantalla de resultado y espera de confirmación

- **Decision**: `/support/result?donation=<id>` consulta `GET /v1/donations/{id}` cada 2 s
  hasta 60 s (SC-003). Estados: confirmada → agradecimiento; pendiente tras 60 s → "Estamos
  confirmando tu pago, te avisaremos por correo"; cancelada/fallida → "No se realizó ningún
  cargo". Para PayPal, la página llama antes `POST /v1/donations/{id}/paypal-return`.
- **Rationale**: FR-008 sin depender de que el webhook llegue antes que el usuario.

## R8. Proveedores intercambiables y pruebas

- **Decision**: Interfaz `PaymentProvider` (`createCheckout`, `createSubscription`,
  `cancelSubscription`, `verifyWebhook`, `parseEvent`) con `StripeProvider`, `PayPalProvider` y
  `FakePaymentProvider` (tests y e2e). Un proveedor se ofrece solo si sus variables existen
  (FR-015); `GET /v1/donations/config` lo indica a la app.
  - Tests de Stripe: firmas generadas con `stripe.webhooks.generateTestHeaderString`.
  - E2E: el proveedor falso redirige a una página local `/support/fake-checkout` que simula
    "Pagar" y "Cancelar" y envía el webhook firmado de prueba.
- **Rationale**: Pruebas sin red ni cuentas, igual que `EmailSender`/`PushSender` en 003.

## R9. Tarjeta de invitación y menciones

- **Decision**: `profiles.donation_card_dismissed_at`; la API calcula `showDonationCard` =
  sin beneficio vigente ∧ al menos un `ServiceRecord` ∧ (sin cierre o cierre hace ≥ 90 días).
  La tarjeta va al final de la pantalla principal, nunca en formularios ni hojas de captura.
  El resumen diario de 003 no incluye menciones de donaciones (FR-012b se cumple para todos).
- **Rationale**: Cierre sincronizado entre dispositivos; regla en un solo sitio (backend).

## R10. Correo de agradecimiento

- **Decision**: Plantilla `donation-thanks` con el `EmailSender` de 003, enviada al procesar la
  confirmación (después del commit), con `idempotencyKey` = `donation-thanks:<donationId>`.
  Se envía aunque `emailUnsubscribedAt` esté puesto; no se envía si `emailStatus ≠ OK` o no hay
  correo. Sin datos de tarjeta; incluye `SUPPORT_EMAIL` para dudas o reembolsos.
- **Rationale**: Clarificación Q1 (comprobante siempre) y FR-011.

## R11. Moneda, montos y límites

- **Decision**: MXN enteros; sugeridos 50/100/200; límites 20–10.000 (FR-003), validados con el
  mismo esquema Zod en app y API. Los montos se guardan en centavos (`amountCents` int).
- **Rationale**: Evita decimales flotantes; Stripe trabaja en centavos.

## R12. Cambiar el monto de la mensual

- **Decision**: No se edita: se cancela y se crea otra (pendiente de bajo impacto del clarify).
  La app lo explica en "Mis donaciones".
- **Rationale**: Evita prorrateos y cambios de plan en PayPal.

## R13. Variables de entorno

- `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `PAYPAL_CLIENT_ID`, `PAYPAL_CLIENT_SECRET`,
  `PAYPAL_WEBHOOK_ID`, `PAYPAL_ENV` (`sandbox` | `live`), `PAYMENTS_PROVIDER_MODE`
  (`real` | `fake`, por defecto `fake` fuera de producción), `SUPPORT_EMAIL`. Todas opcionales:
  sin las de un proveedor, ese proveedor no se ofrece. `PAYMENTS_PROVIDER_MODE=fake` está
  prohibido con `NODE_ENV=production`: el API no arranca (evita confirmar donaciones falsas).
- Portal de cliente de Stripe (Billing Portal) para actualizar la tarjeta de una mensual con
  problema de pago; PayPal no ofrece un equivalente por API, así que se dan instrucciones.
