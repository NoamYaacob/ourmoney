const { colors } = require('./constants/colors')

/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './app/**/*.{js,jsx,ts,tsx}',
    './components/**/*.{js,jsx,ts,tsx}',
    './features/**/*.{js,jsx,ts,tsx}',
    './hooks/**/*.{js,jsx,ts,tsx}',
  ],
  presets: [require('nativewind/preset')],
  darkMode: 'class',
  theme: {
    extend: {
      colors,
      // Design Phase 1 — a named type hierarchy, additive to Tailwind's
      // existing scale (text-sm/text-xs/etc. all still work; these are for
      // the specific roles the shell/dashboard redesign needs a deliberate
      // size+line-height pair for, rather than picking a raw size ad hoc
      // per screen). fontWeight is applied separately via font-semibold/
      // font-bold, matching the rest of this codebase's existing convention.
      fontSize: {
        display: ['34px', { lineHeight: '40px' }], // one hero figure per screen (e.g. remaining budget)
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
