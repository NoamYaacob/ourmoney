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
      // Mobile redesign: the design's own scale, top to bottom. Every size
      // the mockups use is one of these — a screen that needs something
      // else is a screen that has drifted. 12px (`meta`) is the documented
      // floor; the design's density rule is "no shrinking text to fit more
      // in", so anything that does not fit moves to a detail screen or a
      // sheet instead of getting smaller.
      fontSize: {
        // The one dark-panel figure that answers the screen's question —
        // פנוי באמת on Home, the amount being typed on the entry sheet.
        // Never more than one per screen.
        hero: ['44px', { lineHeight: '50px' }],
        // A large figure on a light card (budget's "נותר להוציא").
        display: ['40px', { lineHeight: '46px' }],
        // The design system's `figure` tier (§08, "ראש כרטיס"): the figure
        // at the head of a card that is not the screen's one hero — the
        // three cash-flow balances, a card's headline total. Distinct from
        // `display`, which the budget summary uses for the single figure
        // that IS that screen's answer.
        figure: ['30px', { lineHeight: '36px' }],
        // Screen title in the header row. Was 22/28.
        title: ['21px', { lineHeight: '26px' }],
        // Card heading ("הדבר הבא", "תקציב אוגוסט"). Was 15/20, which left
        // it indistinguishable from body — the mockups set it apart.
        heading: ['16px', { lineHeight: '21px' }],
        // A list row's primary line (merchant, category, commitment name).
        body: ['15px', { lineHeight: '22px' }],
        // Explanatory prose inside a card.
        bodySm: ['14px', { lineHeight: '21px' }],
        // Secondary line under a row's title.
        caption: ['13px', { lineHeight: '19px' }],
        // Chips, date labels, axis ticks. The floor — nothing smaller.
        meta: ['12px', { lineHeight: '17px' }],
      },
      // Mobile redesign: the design system's five radii, one per role,
      // replacing the previous two. `control` shrank 14 -> 10 (it sits on
      // buttons/inputs/segmented controls, which read tighter in the
      // mockups than the old value allowed) and `card` 20 -> 18; `row` and
      // `hero` are new. `full` (pills, avatars, FAB) is Tailwind's own.
      borderRadius: {
        control: '10px', // button, input, segmented control
        row: '14px', // a pressable row or tile inside a card
        card: '18px', // the card itself
        hero: '22px', // the dark financial panel
      },
      fontFamily: {
        // Heebo carries figures and headings, Assistant carries text. Both
        // are loaded in app/_layout.tsx; the `system-ui` fallbacks are what
        // renders during the load and on web before the webfont lands.
        heebo: ['Heebo_800ExtraBold', 'system-ui', 'sans-serif'],
        heeboBold: ['Heebo_700Bold', 'system-ui', 'sans-serif'],
        heeboMedium: ['Heebo_500Medium', 'system-ui', 'sans-serif'],
        sans: ['Assistant_400Regular', 'system-ui', 'sans-serif'],
        sansMedium: ['Assistant_500Medium', 'system-ui', 'sans-serif'],
        sansSemibold: ['Assistant_600SemiBold', 'system-ui', 'sans-serif'],
        sansBold: ['Assistant_700Bold', 'system-ui', 'sans-serif'],
      },
    },
  },
  plugins: [],
}
