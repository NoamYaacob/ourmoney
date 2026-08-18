const { colors } = require('./constants/colors')

/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './app/**/*.{js,jsx,ts,tsx}',
    './components/**/*.{js,jsx,ts,tsx}',
    './features/**/*.{js,jsx,ts,tsx}',
    './hooks/**/*.{js,jsx,ts,tsx}',
    // Desktop polish pass: constants/layout.ts defines CONTENT_WIDTH and
    // DIALOG_WIDTH_CLASS as reusable className strings (Screen.tsx, Select.tsx,
    // Modal.tsx all interpolate them) — this directory was missing from the
    // scan, so Tailwind's JIT never generated the actual
    // `web:tablet:max-w-[...]`/`web:desktop:max-w-[...]` utilities those
    // constants reference. Every screen using Screen's `width` prop was
    // silently unconstrained on desktop as a result (confirmed by grepping
    // the compiled CSS — root cause of the "New Transaction stretches
    // edge-to-edge" report). This scans the file where those strings live.
    './constants/**/*.{js,jsx,ts,tsx}',
  ],
  presets: [require('nativewind/preset')],
  darkMode: 'class',
  theme: {
    extend: {
      colors,
      // Responsive/desktop layout pass: named breakpoints matching the
      // product spec's exact tiers (mobile <768, tablet 768-1199,
      // desktop >=1200). Always paired with the `web:` platform variant at
      // call sites (e.g. `web:tablet:max-w-[600px]`) so native/iPhone
      // layout is untouched — these only take effect in a browser.
      screens: {
        tablet: '768px',
        desktop: '1200px',
      },
      // Design Phase 1 — a named type hierarchy, additive to Tailwind's
      // existing scale (text-sm/text-xs/etc. all still work; these are for
      // the specific roles the shell/dashboard redesign needs a deliberate
      // size+line-height pair for, rather than picking a raw size ad hoc
      // per screen). fontWeight is applied separately via font-semibold/
      // font-bold, matching the rest of this codebase's existing convention.
      fontSize: {
        // Design Phase 2: bumped from 34/40 — the one figure this renders
        // (Dashboard's "remaining this month") needed to visually dominate
        // the screen, and this token has exactly one call site (the
        // Dashboard hero), so raising it here doesn't ripple anywhere else.
        display: ['40px', { lineHeight: '46px' }], // one hero figure per screen (e.g. remaining budget)
        title: ['22px', { lineHeight: '28px' }], // screen title
        heading: ['15px', { lineHeight: '20px' }], // section header, paired with font-semibold
        body: ['15px', { lineHeight: '22px' }], // default reading text
        caption: ['13px', { lineHeight: '18px' }], // secondary/meta text
      },
      // Two named radii, additive to Tailwind's default scale — `control`
      // for pressable/input-sized elements, `card` for larger surfaces. Not
      // a full new scale: the app doesn't need more than these two roles
      // plus the default `full` (pills/avatars/FAB) it already uses.
      borderRadius: {
        control: '14px',
        card: '20px',
      },
    },
  },
  plugins: [],
}
