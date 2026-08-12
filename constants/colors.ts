// Semantic color tokens for light/dark mode. Components reference these via
// NativeWind classes (e.g. `bg-surface-light dark:bg-surface-dark`), never a
// raw hex value directly — see CLAUDE.md § RTL and Hebrew / theming rules.
//
// This is the single source of truth; tailwind.config.js reads from it.
//
// Milestone 10 accessibility pass — WCAG 2.1 AA contrast audit (4.5:1 floor
// for normal-size text), computed against sRGB relative luminance for every
// text/background pairing actually used in the app:
//
//   ink      on surface/surfaceMuted        13.3:1 – 17.9:1  PASS (both modes)
//   inkMuted on surface/surfaceMuted         4.6:1 –  7.0:1  PASS (both modes)
//   accent   on surface/surfaceMuted         4.9:1 –  6.3:1  PASS (both modes)
//   danger   on surface (danger-colored text) 4.8:1 –  6.5:1  PASS (both modes)
//   white    on danger.light (danger button)      4.8:1  PASS
//   white    on danger.dark  (danger button)      2.8:1  FAIL — already
//     fixed at the one place this pairing occurs (components/ui/Button.tsx's
//     `danger` variant flips to dark text in dark mode instead of white;
//     see that file's own comment). No other component pairs white text
//     directly against danger.dark.
//
// Every other token pair in this file is either non-text (border, surface
// backgrounds) or not used as a text/background pair anywhere in the app.
// Re-run this audit if a new token is added or an existing hex value changes.

export const colors = {
  surface: {
    light: '#ffffff',
    dark: '#0f172a',
  },
  surfaceMuted: {
    light: '#f8fafc',
    dark: '#1e293b',
  },
  ink: {
    light: '#0f172a',
    dark: '#f1f5f9',
  },
  inkMuted: {
    light: '#64748b',
    dark: '#94a3b8',
  },
  border: {
    light: '#e2e8f0',
    dark: '#334155',
  },
  accent: {
    light: '#4f46e5',
    dark: '#818cf8',
  },
  danger: {
    light: '#dc2626',
    dark: '#f87171',
  },
} as const
