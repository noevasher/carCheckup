# Quickstart: Validación de Donaciones

**Feature**: `004-donations` | Contratos: [openapi.yaml](./contracts/openapi.yaml),
[payments.md](./contracts/payments.md) | Modelo: [data-model.md](./data-model.md)

## Prerrequisitos

Los de 001–003, más (solo para probar con proveedores reales en modo de prueba):

- Stripe (modo test): `STRIPE_SECRET_KEY=sk_test_…`; webhooks locales con
  `stripe listen --forward-to localhost:3000/webhooks/stripe` → `STRIPE_WEBHOOK_SECRET=whsec_…`.
- PayPal sandbox: app REST en developer.paypal.com → `PAYPAL_CLIENT_ID`, `PAYPAL_CLIENT_SECRET`,
  `PAYPAL_ENV=sandbox`; webhook apuntando a una URL pública (p. ej. túnel) → `PAYPAL_WEBHOOK_ID`.
- `PAYMENTS_PROVIDER_MODE=real` para usarlos; sin eso, en local se usa el proveedor falso.
- `SUPPORT_EMAIL=soporte@tudominio.com`.

## Comprobaciones automáticas

```bash
npm run typecheck && npm run lint && npm test && npm run test:e2e
```

## Escenarios

| # | Escenario | Resultado esperado | Spec |
|---|---|---|---|
| 1 | Abrir "Apoya Car Checkup" desde la pantalla principal | 1 toque; montos 50/100/200, "Otro monto", "Una vez / Cada mes", Tarjeta y PayPal | FR-001/002, US1-1 |
| 2 | Donar 100 MXN única con tarjeta (4242 4242 4242 4242) | Página de Stripe con 100 MXN; al volver "Estamos confirmando…" y luego "¡Gracias!"; "Sin anuncios hasta" = hoy + 60 días | US1-2/3, FR-013 |
| 3 | Cancelar en Stripe | "No se realizó ningún cargo"; nada confirmado | US1-4 |
| 4 | Reenviar el mismo evento con `stripe events resend` | Sin duplicados ni cambios | FR-007, SC-002 |
| 5 | Webhook con firma alterada | 400; sin cambios | R3 |
| 6 | Donar 50 MXN única con PayPal sandbox | Captura al volver; confirmada por webhook; correo de agradecimiento | FR-006, FR-011 |
| 7 | Donación mensual de 50 MXN con tarjeta | "Donación mensual activa", siguiente cargo en 1 mes; sin anuncios hasta fin del periodo | US2-1/2, FR-014a |
| 8 | Intentar otra mensual | Aviso "Ya tienes una donación mensual" | US2-5 |
| 9 | Con la mensual activa, donar 50 MXN única y cancelar la mensual | Beneficio = fin del periodo + 30 días; no hay más cargos | Q2, FR-014b |
| 10 | Cobro mensual fallido (`stripe trigger invoice.payment_failed` o tarjeta 4000 0000 0000 0341) | "Con problema de pago" | US2-4 |
| 11 | Reembolsar desde el panel de Stripe | "Reembolsada"; beneficio recalculado | FR-009, FR-014d |
| 12 | Usuario con baja de recordatorios dona | Recibe el correo de agradecimiento | Q1 |
| 13 | Usuario con un servicio registrado y sin beneficio | Tarjeta discreta al final de la pantalla principal; al cerrarla no vuelve (90 días) | FR-012a |
| 14 | Donante con beneficio vigente | Sin tarjeta ni menciones; acceso fijo disponible | FR-012b |
| 15 | Quitar las variables de PayPal | Solo se ofrece "Tarjeta" | FR-015 |
| 16 | Sin conexión | Botones desactivados con mensaje claro | Edge cases |
