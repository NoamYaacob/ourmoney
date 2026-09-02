// The four icon sizes the design system names, and nothing else.
//
// `OurMoney - Design System.dc.html` §08 lists them explicitly, each tied to
// a role rather than a number: 14px inside a chip or a small circle, 17px in
// a list row, 19px in navigation, 24px on a hero card or an alert.
//
// The app had drifted to nine different sizes (14, 15, 16, 17, 18, 19, 20,
// 22, 24), picked per call site, so two rows of the same kind on two screens
// could carry icons a couple of pixels apart — visible as a ragged left edge
// once the rows sit in one column. Importing the role instead of typing a
// number is what stops that happening again.
//
// Deliberately NOT a complete inventory of every glyph dimension in the app:
// the FAB's own 29px plus sign is specified by the mobile screen file rather
// than the design system, and avatars/tiles are container sizes, not icons.
// Those stay where they are.
export const ICON = {
  /** Inside a chip, a badge, or a small circular tile. */
  chip: 14,
  /** The leading or trailing glyph of a list row — the most common by far. */
  row: 17,
  /** Sidebar and tab-bar destinations. */
  nav: 19,
  /** A hero card's own icon, or the icon that opens an alert. */
  hero: 24,
} as const

export type IconSize = (typeof ICON)[keyof typeof ICON]
