# UX/UI Review: Gestión de Vehículos y Registro Rápido de Kilometraje

**Purpose**: Per-story UX/UI review against Constitution Principle IV (sober, serious-but-friendly
design; mobile-first) and Principle V (plain language).
**Date**: 2026-10-20
**Method**: Screenshots of every screen at 390×844 (Pixel 7 emulation), light and dark mode,
generated with `UX_SCREENS=1 npx playwright test ux-screens` (output in
`frontend/test-results/ux/`), plus automated WCAG contrast check of the design tokens.

## Global criteria

- [x] Sober palette: neutral base, one navy accent, semantic success/warning/danger only
- [x] Touch targets ≥ 44px (`min-h-tap` on buttons, chips, links, list rows)
- [x] Base text ≥ 16px (inputs 16px, so iOS does not zoom on focus)
- [x] WCAG AA contrast (≥ 4.5:1) for all text/background token pairs in light and dark mode
      (lowest: light success 5.56:1; dark text-muted 7.9:1)
- [x] Plain-language copy, no mechanical jargon ("odómetro" is explained as "lo que marca el tablero")
- [x] `prefers-reduced-motion` respected; visible focus ring on every interactive element

## US1 — Alta de vehículo, login, pantalla principal

- [x] Registration asks only 4 things; optional data collapsed under "Más datos (opcional)"
- [x] Catalog suggestions appear while typing; free text accepted, with a hint when not catalogued
- [x] Year and km side by side; km has "km" suffix and a hint
- [x] Home: vehicle name, big km figure, relative "Última lectura: hoy", one primary action
- [x] Login: single email field, magic link, no passwords

## US2 — Captura rápida

- [x] Bottom sheet; km field focused on open with numeric keyboard; last value shown as reference
- [x] Out-of-order error explains the valid range in plain words and offers "Corregir la última lectura"
- [x] Unusual-distance dialog states the distance and days ("Son 7.000 km recorridos en 1 día")
- [x] "Fue otro día" is a secondary link, so the main flow stays at 2 taps
- [x] Pending-sync badge and review banner are visible but not alarming

## US3 — Varios vehículos

- [x] Chip switcher with selected state (filled) vs. unselected (outlined); "+ Añadir vehículo" dashed
- [x] Scrolls horizontally with many vehicles; long names truncated (`max-w-48`)

## US4 — Edición e historial

- [x] Edit reuses the registration form; destructive action separated at the bottom in danger style
- [x] Delete confirmations name the consequence ("se borrará todo su historial")
- [x] History rows show km, date and origin; "No cuadra" readings highlighted with an explanation

## Findings and fixes

| # | Screen | Finding | Fix |
|---|---|---|---|
| F1 | All (notices) | Success/offline notices were too tall: the "Cerrar" button sat on its own row and pushed content down | Notices are now a single compact row with an icon close button (`frontend/src/offline/SyncNotices.tsx`) |
| F2 | Historial | Rows did not look tappable | Added a chevron and an accessible label ("…. Corregir lectura") to each row |
| F3 | Router | Blank screen while a lazily loaded route hydrated | Added a centered spinner as `HydrateFallback` |

## Not verified

- Behaviour on physical iOS/Android devices (keyboard auto-open on sheet focus, PWA install
  prompt, safe areas on notched phones). Emulation only; see tasks.md T072/T078.
