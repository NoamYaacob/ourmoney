// Semantic color tokens for light/dark mode. Components reference these via
// NativeWind classes (e.g. `bg-surface-light dark:bg-surface-dark`), never a
// raw hex value directly — see CLAUDE.md § RTL and Hebrew / theming rules.
//
// This is the single source of truth; tailwind.config.js reads from it.
//
// Design Phase 1 (2026-08) — replaced the original default-Tailwind
// indigo/slate palette with a deliberate one for this specific product.
//
// Mobile redesign (2026-08, Claude Design handoff) — the warm-neutral
// direction the household approved. Three things changed and one did not:
//
//   1. Surfaces moved off the green-tinted ivory onto a genuinely warm
//      neutral paper (`#f4f2ed`) with pure-white cards on top of it. The
//      old `#faf8f2` carried a faint green cast that fought the teal accent
//      every time the two sat next to each other.
//   2. Ink moved off the desaturated green-grey (`#16211d`/`#5b6b62`) onto
//      a warm near-black (`#191a17`/`#57564f`) so type belongs to the paper
//      rather than to the accent family.
//   3. The semantic states gained the tint/strong/border companions the
//      design uses for chips and state-bordered cards. They were previously
//      improvised per screen from opacity modifiers (`bg-danger-light/10`),
//      which is why an amber chip never looked the same on two screens.
//   4. `accent` is unchanged (`#0f6b5c`). It was already right, and keeping
//      it is what makes the redesign read as the same product.
//
// The `hero` family is new and deliberately does NOT invert the way every
// other token does: it is the dark financial panel carrying the household's
// single most important figure (פנוי באמת). In light mode it is near-black
// against paper; in dark mode it lifts ABOVE the card surface rather than
// sinking below it, so the panel keeps its "this is the number" role in
// both themes instead of dissolving into the background.
//
// WCAG 2.1 AA contrast audit (4.5:1 floor for normal-size text), computed
// against sRGB relative luminance for every text/background pairing
// actually used in the app (script-verified, not eyeballed):
//
//   LIGHT
//   ink            on surface / surfaceMuted    15.6:1 / 17.5:1  PASS
//   inkMuted       on surface / surfaceMuted     6.6:1 /  7.4:1  PASS
//   accent         on surface / surfaceMuted     5.7:1 /  6.4:1  PASS
//   positive       on surface / surfaceMuted     5.0:1 /  5.6:1  PASS
//   danger         on surface / surfaceMuted     5.8:1 /  6.4:1  PASS
//   warningStrong  on surface / surfaceMuted     5.3:1 /  5.9:1  PASS
//   accentStrong   on accentTint                          7.8:1  PASS
//   positiveStrong on positiveTint                        6.7:1  PASS
//   warningStrong  on warningTint                         5.3:1  PASS
//   dangerStrong   on dangerTint / dangerSurface  7.1:1 /  8.1:1  PASS
//   white          on accent / danger             6.4:1 /  6.4:1  PASS
//   heroInk        on hero                               15.4:1  PASS
//   heroInkMuted   on hero                                7.1:1  PASS
//   heroAccent     on hero                               10.1:1  PASS
//
//   DARK
//   ink            on surface / surfaceMuted    16.6:1 / 14.9:1  PASS
//   inkMuted       on surface / surfaceMuted     7.7:1 /  6.9:1  PASS
//   accent         on surfaceMuted                        9.8:1  PASS
//   positive       on surfaceMuted                        9.9:1  PASS
//   danger         on surfaceMuted                        8.3:1  PASS
//   warning        on surfaceMuted                        9.0:1  PASS
//   surface        on accent (button fill, dark text)     10.9:1  PASS
//   heroInk / heroInkMuted / heroAccent on hero
//                                    13.2:1 / 6.1:1 / 8.6:1      PASS
//
// Two deliberate notes on values that are NOT text colors:
//
//   `warning` (#b5761f) measures 3.8:1 on white and is therefore never used
//   as text on a light surface — it is a FILL only (the status dot, the
//   budget bar). `warningStrong` (#8a5a11) is its text companion and passes
//   at 5.9:1. The same fill/text split exists for `positive`/
//   `positiveStrong` and `danger`/`dangerStrong`. Do not swap one for the
//   other.
//
//   `positive.light` is #2a7454, one step darker than the #2e7d5b in the
//   design file. The design only ever places that green on a white card
//   (5.0:1 there), but this app also renders positive amounts directly on
//   the paper surface, where #2e7d5b measures 4.47:1 — under the floor.
//   Darkening one step clears both surfaces at no visible cost.
//
// Re-run this audit if a new token is added or an existing hex value changes.

export const colors = {
  // The paper the whole product sits on.
  surface: {
    light: '#f4f2ed',
    dark: '#141310',
  },
  // Cards and raised rows on top of `surface`.
  surfaceMuted: {
    light: '#ffffff',
    dark: '#1f1e1a',
  },
  ink: {
    light: '#191a17',
    dark: '#f4f2ed',
  },
  inkMuted: {
    light: '#57564f',
    dark: '#a9a79e',
  },
  // The single card/edge border. One border weight in the whole product:
  // 1px of this token (the design system's "גבול אחד בלבד" rule).
  border: {
    light: '#e4e1d9',
    dark: '#312f2a',
  },
  // Hairline BETWEEN rows inside one card — lighter than `border`, which
  // outlines the card itself. Every list previously improvised this with a
  // `border-border-light/50`-style opacity modifier.
  divider: {
    light: '#f1eee7',
    dark: '#2a2823',
  },
  // Unfilled portion of any progress/budget bar.
  track: {
    light: '#edeae2',
    dark: '#312f2a',
  },

  // Interactive color: buttons, links, focus, selected tab. Never used to
  // give a number financial meaning — that is `positive`/`danger`.
  accent: {
    light: '#0f6b5c',
    dark: '#8fd4be',
  },
  accentStrong: {
    light: '#0a4c41',
    dark: '#d3f0e4',
  },
  accentTint: {
    light: '#dde7e4',
    dark: '#20342e',
  },

  // Financial-good: income, under budget, on pace.
  positive: {
    light: '#2a7454',
    dark: '#7fd9ae',
  },
  positiveStrong: {
    light: '#1f5c43',
    dark: '#c7f0dc',
  },
  positiveTint: {
    light: '#e7efe9',
    dark: '#1c3129',
  },
  // The tinted hairline on a card whose whole point is good news — the
  // fourth alert tier ("תובנה חיובית"). Same relationship `dangerBorder` and
  // `warningBorder` have to their own tints.
  positiveBorder: {
    light: '#cfe0d5',
    dark: '#2c4a3a',
  },

  // Attention, not alarm: approaching a limit, a connection going stale.
  // Carries the states that used to be shown in red for want of a token.
  warning: {
    light: '#b5761f',
    dark: '#e3b872',
  },
  warningStrong: {
    light: '#8a5a11',
    dark: '#f5dcb0',
  },
  warningTint: {
    light: '#fbf1df',
    dark: '#33291a',
  },
  warningBorder: {
    light: '#f0e3cc',
    dark: '#443722',
  },
  // A whole card's fill when the card itself is the observation — lighter
  // than `warningTint`, which fills chips. The design system uses this exact
  // value for both the budget pace note and its "תובנה, לא שגיאה" pattern,
  // the same relationship `dangerSurface` has to `dangerTint` below.
  warningSurface: {
    light: '#fdf9f2',
    dark: '#26200f',
  },

  // Genuinely actionable: over budget, projected shortfall.
  danger: {
    light: '#a8382a',
    dark: '#e8a79b',
  },
  dangerStrong: {
    light: '#8a2a1e',
    dark: '#f6d3cc',
  },
  dangerTint: {
    light: '#f7e4e0',
    dark: '#3a221e',
  },
  // A whole card's fill when the card itself is the warning — lighter than
  // `dangerTint`, which fills chips.
  dangerSurface: {
    light: '#fcf6f5',
    dark: '#2b1e1b',
  },
  dangerBorder: {
    light: '#f0dad5',
    dark: '#4a2c26',
  },

  // The dark financial panel. See the header note on why this one does not
  // invert.
  hero: {
    light: '#1c1b18',
    dark: '#2a2823',
  },
  heroInk: {
    light: '#f4f2ed',
    dark: '#f4f2ed',
  },
  heroInkMuted: {
    light: '#a9a79e',
    dark: '#a9a79e',
  },
  heroBorder: {
    light: '#3a3832',
    dark: '#413e37',
  },
  heroAccent: {
    light: '#8fd4be',
    dark: '#8fd4be',
  },
} as const
