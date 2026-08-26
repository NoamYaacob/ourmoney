// The "מה מגיע" row, in the one shape the design system defines for it.
//
// `OurMoney - Design System.dc.html` §07 is explicit that this is a single
// component across both platforms — "צורה אחת לכל 'מה מגיע' בשני
// הפלטפורמות" — and lists its parts in order: a large day numeral over a
// short month, an urgency bar, the name, a time chip, the type and
// ownership, and the amount.
//
// The urgency reads three ways, never on colour alone: the numeral's colour,
// the bar, and the chip's own wording ("בעוד 6 ימים", "גורם לחוסר",
// "אחרי המשכורת"). That redundancy is the design system's stated rule and
// the reason the chip text is a required prop rather than optional.
//
// Desktop and mobile had each grown their own version of this row, and they
// had drifted: mobile showed a numeric month and no urgency bar, desktop
// showed neither the month nor the bar.

import type { ReactNode } from 'react'
import { Pressable, Text, View } from 'react-native'
import { Money } from '@/components/ui/Money'
import { StatusChip, type StatusTone } from '@/components/ui/StatusChip'
import { formatDayOfMonth, formatMonthAbbreviation } from '@/lib/dates/format'

interface CommitmentRowProps {
  date: string
  name: string
  amountAgorot: number
  // The urgency phrasing. Required, not optional: it is what carries urgency
  // for anyone who cannot use the colour.
  timeLabel: string
  tone: StatusTone
  // "התחייבות · משותפת" — the type, and the ownership when it is known.
  meta?: string
  onPress?: () => void
  // Rendered instead of the amount where a row needs an action instead
  // (the desktop obligations list puts "סימון כשולם" here).
  trailing?: ReactNode
  testID?: string
}

// The numeral takes the urgency colour; `neutral` stays plain ink rather
// than going grey, matching the design system's third example.
const NUMERAL_CLASS: Record<StatusTone, string> = {
  danger: 'text-danger-light dark:text-danger-dark',
  warning: 'text-warningStrong-light dark:text-warningStrong-dark',
  positive: 'text-positiveStrong-light dark:text-positiveStrong-dark',
  accent: 'text-accentStrong-light dark:text-accentStrong-dark',
  neutral: 'text-ink-light dark:text-ink-dark',
}

const BAR_CLASS: Record<StatusTone, string> = {
  danger: 'bg-danger-light dark:bg-danger-dark',
  warning: 'bg-warning-light dark:bg-warning-dark',
  positive: 'bg-positive-light dark:bg-positive-dark',
  accent: 'bg-accent-light dark:bg-accent-dark',
  neutral: 'bg-ink-light dark:bg-ink-dark',
}

export function CommitmentRow({
  date,
  name,
  amountAgorot,
  timeLabel,
  tone,
  meta,
  onPress,
  trailing,
  testID,
}: CommitmentRowProps) {
  const body = (
    <View className="flex-row items-center gap-3 py-2.5">
      {/* 42px, per the design system, so a two-digit day and a four-character
          month abbreviation both fit without the column shifting. */}
      <View className="w-[42px] flex-none items-center">
        <Text
          className={`font-heebo text-[18px] leading-[20px] ${NUMERAL_CLASS[tone]}`}
          style={{ fontVariant: ['tabular-nums'] }}
          maxFontSizeMultiplier={1.3}
        >
          {formatDayOfMonth(date)}
        </Text>
        <Text
          className="text-meta font-sansSemibold text-inkMuted-light dark:text-inkMuted-dark"
          maxFontSizeMultiplier={1.3}
        >
          {formatMonthAbbreviation(date)}
        </Text>
      </View>

      <View className={`w-[3px] self-stretch rounded-full ${BAR_CLASS[tone]}`} />

      <View className="min-w-0 flex-1">
        <Text className="text-body font-sansSemibold text-ink-light dark:text-ink-dark" numberOfLines={1}>
          {name}
        </Text>
        <View className="mt-0.5 flex-row items-center gap-1.5">
          <StatusChip label={timeLabel} tone={tone} />
          {meta && (
            <Text
              className="shrink text-meta font-sans text-inkMuted-light dark:text-inkMuted-dark"
              numberOfLines={1}
            >
              {meta}
            </Text>
          )}
        </View>
      </View>

      {trailing ?? <Money agorot={amountAgorot} size="row" />}
    </View>
  )

  if (!onPress) return <View testID={testID}>{body}</View>

  return (
    <Pressable
      testID={testID}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${name}, ${timeLabel}`}
      className="web:hover:bg-surface-light/60 active:bg-surface-light dark:web:hover:bg-surface-dark/40 dark:active:bg-surface-dark"
    >
      {body}
    </Pressable>
  )
}
