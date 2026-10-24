# UX/UI Review: Donaciones con Stripe y PayPal

**Purpose**: Per-story UX/UI review against Constitution Principles I (fricción cero), IV (sober,
serious-but-friendly, mobile-first) and V (plain language).
**Date**: 2026-10-23
**Method**: `frontend/tests/e2e/ux-donations-screens.spec.ts` (390 px, light and dark; run with
`UX_SCREENS=1`), screens 01–08, plus `thanks-email-sample.html` rendered at 390 px.

## US1 — Donación única

- [x] Fixed "Apoyar" entry in the header on every screen (accessible name "Apoya Car Checkup"); 1 tap
- [x] One screen with why, frequency, 3 presets + "Otro monto" and the two providers; 100 MXN
      preselected so a donation takes 3 taps to the provider (SC-001)
- [x] Benefit rule in plain words under the frequency ("Por cada 50 MXN, 30 días sin anuncios")
- [x] Custom amount validated inline before leaving (hint + error), numeric keyboard, "MXN" suffix
- [x] Security reassurance: payment happens on Stripe/PayPal's page; the app never sees the card
- [x] Result screen: thanks with the benefit date; "Estamos confirmando tu pago" with spinner and
      a calm message after 60 s; "No se realizó ningún cargo" with "Intentar de nuevo"
- [x] Provider not responding: red banner naming it and suggesting the other; amount kept
- [x] Offline: warning and disabled buttons (no offline donations)

## US2 — Donación mensual

- [x] "Cada mes" shows amounts as "$50 MXN al mes" and the monthly benefit rule
- [x] With an active monthly donation the form is replaced by "Ya tienes una donación mensual
      activa" and a link to manage it
- [x] Cancel is a secondary danger button with a confirmation that states until when the benefit
      lasts ("Sí, cancelar" / "No, mantenerla"); 3 taps from home (SC-007)
- [x] Past due: amber notice with "Actualizar tarjeta" (Stripe portal) or PayPal instructions

## US3 — Mis donaciones y comprobante

- [x] List with amount, type, provider, date and colored status text (not color only)
- [x] Recent pending payments read "Confirmando tu pago…"
- [x] Contact email as a mailto link for questions or refunds
- [x] Thank-you email: receipt table (date, type, amount, method), benefit date, link to "Mis
      donaciones", "no es una factura fiscal" and contact; no card data; ≤ 600 px

## US4 — Sin anuncios

- [x] "Sin anuncios hasta el <fecha>" as a success banner on Apoya, Mis donaciones and the result

## US5 — Invitación discreta

- [x] Card at the end of home, after maintenance; neutral styling (no accent color) with "Apoyar"
      and "Ahora no"; never in sheets or forms; hidden for donors
- [x] The header entry looks the same for everyone (not promotional), so donors are not nagged

| # | Finding | Fix |
|---|---|---|
| F1 | "Mis donaciones" contact line read "Escríbenos a .soporte@…" (stray dot) | Text split into a prefix + mailto link |
| F2 | The email showed "$100.00 MXN" while the app shows "$100 MXN" | Email uses whole pesos like the app |
| F3 | Amounts use es-MX grouping ("10,000 MXN") while km use "45.000 km" | Accepted: money follows the MXN convention users see on their bank and PayPal |

## Final pass (T046)

- [x] All new texts in `i18n/es.ts`, plain Spanish ("Tarjeta", "Una vez / Cada mes"); "Stripe" only
      in the security note
- [x] Dark mode checked on every screen; tap targets ≥ 44 px
- [x] No new step in any capture flow (Principle I)
