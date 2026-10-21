# UX/UI Review: Motor de Estimación de Mantenimiento

**Purpose**: Per-story UX/UI review against Constitution Principle IV (sober, serious-but-friendly
design; mobile-first) and Principle V (plain language).
**Date**: 2026-10-20
**Method**: Screenshots at 390×844 (Pixel 7 emulation), light and dark mode, generated with
`UX_SCREENS=1 npx playwright test ux-maintenance-screens` (output in `frontend/test-results/ux-002/`).
Reuses the design tokens of 001 (WCAG AA verified there); new colors: none.

## US1 — Alertas, explicación, detalle, posponer, marcas del selector

- [x] Status chips reuse semantic tokens (danger/warning/success) with text labels, not color only
- [x] Each alert answers what (name), how much (km left/over or days), when (estimated date) and why
- [x] "Todo al día" state is one calm line plus the next item, not a wall of green cards
- [x] Explanation sheet: "why it matters" sentence, then the calculation in plain language, then the disclaimer
- [x] Selector badge: numeric danger badge for overdue, discreet dot for upcoming, with accessible label

## US2 — Registrar servicio

- [x] "Ya lo hice" opens with the tapped maintenance preselected, today's date and current km
- [x] "Guardar" visible without scrolling on a 390×844 screen (2 taps, FR-010)
- [x] Offline: form kept, explicit message and "Reintentar"; saved automatically when back online
- [x] Service history rows show maintenance names, date, km, notes and "también se guardó como lectura"

## US3 — Historial previo

- [x] One short question, month/year and km both optional, plus an explicit "No lo sé"

## US4 — Ajustes

- [x] Recommended values shown next to the custom fields; destructive "No aplica" separated; disabled items collapsed with "Reactivar"

## Findings and fixes

| # | Screen | Finding | Fix |
|---|---|---|---|
| F1 | Home alerts | Four actions per card stacked into four rows; three alerts filled the whole screen | Secondary actions are compact text buttons ("Posponer 1 semana", "Indicar cuándo se hizo" in small type) |
| F2 | Alerts / detail | Overdue items said "hacia el 8 oct 2026", a date already in the past | Overdue items now say "Tocaba hacia el …" |
| F3 | Registrar servicio | 13 maintenance chips pushed "Guardar" below the fold, adding friction to the 2-tap flow | Only the tapped maintenance is shown; "+ Añadir otro mantenimiento de la misma visita" reveals the rest |

## Not verified

- Physical iOS/Android devices (same limitation as 001).
