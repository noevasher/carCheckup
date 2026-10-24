# UX/UI Review: Recordatorios por Notificación Push y Correo

**Purpose**: Per-story UX/UI review against Constitution Principles IV (sober, serious-but-friendly,
mobile-first) and V (plain language).
**Date**: 2026-10-22

## US1 — Correo y notificación del día

Method: sample digest with 3 vehicles (`checklists/email-sample.html`) rendered at 390 px
(Playwright) and the push texts from the unit tests.

- [x] One email a day, one block per vehicle, overdue first; ≤ 600 px, readable at 390 px
- [x] Each notice says what (name), state chip (Vencido / Próximo / Kilometraje), how much
      (km/days) and why it matters, using the same texts as the app (shared package)
- [x] Colors reuse the app tokens (navy, danger, warning) with text labels, not color only
- [x] Clear call to action per vehicle ("Ver en Car Checkup") and per mileage notice
      ("Actualizar kilometraje")
- [x] Footer explains why the email arrives, how push is managed and has the unsubscribe link;
      one-click unsubscribe header for Gmail/Apple Mail
- [x] Push text: "Toyota Corolla: cambio de aceite y filtro vencido, te pasaste 500 km. Y 2 avisos
      más." — vehicle name as in the app, never the plate; no action buttons

| # | Finding | Fix |
|---|---|---|
| F1 | A vehicle with a nickname showed only "El rojo" in the email header, ambiguous for users with similar nicknames | Header now shows "El rojo · Mazda 3" |

## US2 — Permiso y elección de correo

Method: `frontend/tests/e2e/ux-notifications-screens.spec.ts` (390 px, light and dark), screens
01–04.

- [x] The email switch sits in the registration form with plain wording and the reassurance "Las
      notificaciones en el teléfono se envían siempre"; off by default; `role="switch"`, ≥ 44 px
- [x] The system permission is never requested cold: a short sheet explains what will arrive and
      "como máximo, un aviso al día", with "Activar notificaciones" / "Ahora no"
- [x] Denied → one simple question "¿Quieres recibir los avisos por correo?" (Sí / No, gracias);
      declining continues without blocking anything; the traffic light remains the fallback
- [x] iPhone without installing: an install sheet instead of a permission that cannot work
- [x] Edit screen: "Activar notificaciones en este dispositivo" when possible, or a calm info
      banner when blocked explaining where to allow them

## US3 — Aviso de kilometraje

- [x] Tapping the notice or the email button opens the capture sheet of that vehicle with the
      field focused (screen 05); after login it returns to the same capture

## US4 — Baja y correo no entregable

- [x] Unsubscribe page never acts on load; one clear "Confirmar baja" button, the text explains
      push is not affected; "Deshacer" afterwards (screens 07–08)
- [x] Invalid link: warning with what to do instead (manage per vehicle in the app)
- [x] Bounced/complained address: amber banner on home "No pudimos entregar tus correos…"
      (screen 06), not an error that blocks the app

| # | Finding | Fix |
|---|---|---|
| F2 | The unsubscribe page had no brand: arriving from an email, users could doubt the site | Added "Car Checkup" above the title and an "Ir a Car Checkup" link |
| F3 | Screenshot of the unsubscribe page was blank (taken before the lazy route loaded) | Test waits for the heading; no product change |

## Final pass (T047)

- [x] All new texts in `i18n/es.ts`, plain Spanish, no technical terms (no "push", "VAPID", "token")
- [x] Dark mode checked for every new screen; contrast of banners and switch OK
- [x] No new screen needs more than one tap for its main action (Principle I)
