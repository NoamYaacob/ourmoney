// Semantic color tokens for light/dark mode. Components reference these via
// NativeWind classes (e.g. `bg-surface-light dark:bg-surface-dark`), never a
// raw hex value directly — see CLAUDE.md § RTL and Hebrew / theming rules.
//
// This is the single source of truth; tailwind.config.js reads from it.

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
} as const
