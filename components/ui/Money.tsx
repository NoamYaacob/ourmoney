// Every monetary figure the product renders goes through this component.
//
// Three things it exists to guarantee, each of which was previously left to
// whichever screen happened to be rendering the number:
//
//   1. One formatter. `formatILS` is the only place agorot become a string
//      (CLAUDE.md § Money) — taking `agorot` rather than a pre-formatted
//      string is what keeps a caller from reaching for `toFixed` when this
//      component is in the way.
//   2. Tabular figures. `fontVariant: ['tabular-nums']` so a column of
//      amounts aligns digit-for-digit and a live-updating figure doesn't
//      jitter. The design file marks every amount with its `.n` class for
//      exactly this; here it is not optional.
//   3. No orphaned ₪. The Hebrew currency string puts the symbol at the end
//      after a RTL mark, and a narrow row will happily wrap it onto its own
//      line. `numberOfLines={1}` keeps the amount whole — the design file
//      carries the same rule as `white-space:nowrap` on `.n`.
//
// `tone` is financial meaning, never decoration: `positive` for money coming
// in or a healthy figure, `danger` for a shortfall or an overrun, `default`
// for a plain amount. It deliberately does not accept `accent` — accent is
// the interactive color, and a number is not a control.
//
// Checkpoint 3 (product-quality visual-refinement pass, round 2) — financial-
// hierarchy usage convention (design-review/SYSTEM.md §4). This is a
// documentation-only addition: every role below is already expressible with
// the existing `size`/`tone` props, so there is no second formatter or
// hierarchy component anywhere else in the app.
//
//   - Primary/hero figure — `size="hero"` or `"display"`. ONE per screen:
//     the number that screen exists to answer (Home's פנוי באמת, Accounts'
//     available-to-spend, Recurring's/Obligations' total). A screen with two
//     figures both claiming this size has no hierarchy, only two loud
//     numbers — demote the second one instead.
//   - Secondary metric — `size="large"` or `"figure"`. Supporting figures
//     beside/under the hero (Accounts' owed/illiquid breakdown, Budget's
//     spent/remaining).
//   - Row amount — `size="row"` (the default). Every list-row amount:
//     transactions, accounts, obligations, recurring, installments.
//   - Metadata — not `Money` at all; a plain `Text` in `text-meta`/
//     `text-caption` with `inkMuted` tone (dates, category/account names).
//   - Positive/negative/neutral: row-level amounts stay `tone="default"`
//     unless the row itself is what's being flagged (an overdue obligation,
//     a cash-flow event tagged as the shortfall's cause) — reserve
//     `positive`/`danger` tone for aggregate/summary figures keyed by sign.

import { Text, type TextProps } from 'react-native'
import { formatILS } from '@/lib/money/format'

export type MoneySize = 'heroXl' | 'hero' | 'display' | 'figure' | 'large' | 'row' | 'caption'
export type MoneyTone = 'default' | 'positive' | 'danger' | 'muted' | 'hero' | 'heroMuted'

const SIZE_CLASS: Record<MoneySize, string> = {
  // Design System §03 `figure-xl` (52/56, Heebo 800) — "one figure per
  // screen." The desktop Home hero uses this size for פנוי באמת
  // (OurMoney - Desktop.dc.html measures it at 52/58); the mobile hero and
  // the mobile safe-to-spend detail screen use the smaller `hero` tier
  // (44/50, OurMoney - Mobile.dc.html) instead — same figure, deliberately
  // smaller on the narrower frame.
  heroXl: 'text-heroXl font-heebo',
  hero: 'text-hero font-heebo',
  display: 'text-display font-heebo',
  figure: 'text-figure font-heeboBold',
  large: 'text-title font-heeboBold',
  row: 'text-heading font-heeboBold',
  caption: 'text-meta font-heeboMedium',
}

const TONE_CLASS: Record<MoneyTone, string> = {
  default: 'text-ink-light dark:text-ink-dark',
  positive: 'text-positive-light dark:text-positive-dark',
  danger: 'text-danger-light dark:text-danger-dark',
  muted: 'text-inkMuted-light dark:text-inkMuted-dark',
  // On the dark financial panel, which does not invert between themes.
  hero: 'text-heroInk-light',
  heroMuted: 'text-heroInkMuted-light',
}

interface MoneyProps extends Omit<TextProps, 'children'> {
  agorot: number
  size?: MoneySize
  tone?: MoneyTone
  // Renders a leading "+" for income. Off by default: an expense is the
  // common case and prefixing every incoming amount with a plus turns a
  // transaction list into a wall of signs. Callers where direction is the
  // point (a cash-flow event list) pass `signed`.
  //
  // It does NOT control the minus. A negative figure always renders as
  // negative — see the formatter call below.
  signed?: boolean
}

export function Money({ agorot, size = 'row', tone = 'default', signed = false, style, ...textProps }: MoneyProps) {
  // The value reaches the formatter as it is, sign included. This used to be
  // `formatILS(Math.abs(agorot))`, with the minus re-added only when `signed`
  // was set — so an unsigned negative (a cash-flow low point below zero, a
  // balance in overdraft, an over-budget remainder) printed as if it were
  // positive. Rendering a shortfall as cash is the worst failure this
  // component can have, and no caller should have to opt in to a minus sign
  // being truthful. `formatILS` carries the sign itself, so `signed` is now
  // only about the "+".
  const formatted = formatILS(agorot)
  const sign = signed && agorot > 0 ? '+' : ''

  return (
    <Text
      className={`${SIZE_CLASS[size]} ${TONE_CLASS[tone]}`}
      numberOfLines={1}
      // Caps Dynamic Type growth on figures specifically. A household that
      // has scaled text up still needs the amount and its label to fit one
      // row; the label itself is uncapped so the accessibility setting keeps
      // working where wrapping is harmless.
      maxFontSizeMultiplier={1.4}
      style={[{ fontVariant: ['tabular-nums'] }, style]}
      {...textProps}
    >
      {sign}
      {formatted}
    </Text>
  )
}
