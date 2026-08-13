// Semantic color tokens for light/dark mode. Components reference these via
// NativeWind classes (e.g. `bg-surface-light dark:bg-surface-dark`), never a
// raw hex value directly — see CLAUDE.md § RTL and Hebrew / theming rules.
//
// This is the single source of truth; tailwind.config.js reads from it.
//
// Design Phase 1 (2026-08) — replaced the original default-Tailwind
// indigo/slate palette with a deliberate one for this specific product: a
// warm, grounded "household ledger" feel rather than a generic SaaS
// template. Surfaces are a warm ivory (light) / deep teal-charcoal (dark)
// instead of stark white/cold slate; `accent` is a confident deep teal
// (money/growth, not a generic indigo-600); `positive` is a distinct
// financial-good green (income, under-budget) kept close to the accent
// family so the palette reads as one considered idea, not a red/green/blue
// traffic light; `danger` is a muted brick-red rather than an alarm red, so
// an overspent category reads as "worth a look," not a warning klaxon —
// this is a shared household finance app used daily, not an error state.
//
// WCAG 2.1 AA contrast audit (4.5:1 floor for normal-size text), computed
// against sRGB relative luminance for every text/background pairing
// actually used in the app (script-verified, not eyeballed):
//
//   ink      on surface/surfaceMuted        14.3:1 – 16.5:1  PASS (both modes)
//   inkMuted on surface/surfaceMuted         5.3:1 –  8.3:1  PASS (both modes)
//   accent   on surface/surfaceMuted         6.0:1 –  9.0:1  PASS (both modes)
//   positive on surface/surfaceMuted         5.0:1 – 11.1:1  PASS (both modes)
//   danger   on surface/surfaceMuted         5.3:1 –  6.4:1  PASS (both modes)
//   white    on accent.light (primary button)     6.4:1  PASS
//   dark ink on accent.dark  (primary button)      8.1:1  PASS
//   white    on danger.light (danger button)       5.6:1  PASS
//   white    on danger.dark  (danger button)       2.9:1  FAIL — already
//     fixed at the one place this pairing occurs (components/ui/Button.tsx's
//     `danger` variant flips to dark text in dark mode instead of white;
//     see that file's own comment). No other component pairs white text
//     directly against danger.dark.
//   white    on positive.light (badge/button fill, if ever used)  5.3:1 PASS
//
// Every other token pair in this file is either non-text (border, surface
// backgrounds) or not used as a text/background pair anywhere in the app.
// Re-run this audit if a new token is added or an existing hex value changes.

export const colors = {
  surface: {
    light: '#faf8f2',
    dark: '#0c1614',
  },
  surfaceMuted: {
    light: '#ffffff',
    dark: '#142521',
  },
  ink: {
    light: '#16211d',
    dark: '#eef4f1',
  },
  inkMuted: {
    light: '#5b6b62',
    dark: '#9fb3ab',
  },
  border: {
    light: '#e7e1d3',
    dark: '#243731',
  },
  accent: {
    light: '#0f6b5c',
    dark: '#4fc9a8',
  },
  // Financial-good: income, under-budget, positive trend. Deliberately its
  // own token, not a reuse of `accent` — `accent` is the interactive color
  // (buttons, links, focus), `positive` is a financial-meaning color (it
  // only ever colors a number or figure, never a control) — even though
  // both live in the same teal-green family by design (see header note).
  positive: {
    light: '#237a4e',
    dark: '#5fe0a6',
  },
  danger: {
    light: '#b3432e',
    dark: '#e8795c',
  },
} as const
