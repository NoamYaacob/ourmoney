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

import { Text, type TextProps } from 'react-native'
import { formatILS } from '@/lib/money/format'

export type MoneySize = 'hero' | 'display' | 'figure' | 'large' | 'row' | 'caption'
export type MoneyTone = 'default' | 'positive' | 'danger' | 'muted' | 'hero' | 'heroMuted'

const SIZE_CLASS: Record<MoneySize, string> = {
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
  // common case and prefixing every outgoing amount with a minus turns a
  // transaction list into a wall of signs. Callers that need the minus (a
  // cash-flow event list, where direction is the point) pass `signed`.
  signed?: boolean
}

export function Money({ agorot, size = 'row', tone = 'default', signed = false, style, ...textProps }: MoneyProps) {
  const formatted = formatILS(Math.abs(agorot))
  const sign = signed && agorot > 0 ? '+' : signed && agorot < 0 ? '−' : ''

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
