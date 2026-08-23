// The one chip that states a financial status: בקצב תקין / מתקרב לגבול /
// חריגה, שותפה/אישית, "בעוד 6 ימים", "גורם לחוסר".
//
// Distinct from components/ui/Chip.tsx, which is a *filter* control — that
// one is pressable and carries a selected state; this one is a readout and
// is not pressable at all. They looked similar enough before this pass that
// screens picked whichever was nearer, so a status sometimes invited a tap
// that did nothing.
//
// Accessibility rule this component enforces structurally: status is never
// carried by color alone (CLAUDE.md's own accessibility line, and the
// design system's). The chip always renders a word; `dot` optionally adds
// the status dot the design puts in front of budget rows. A caller cannot
// produce a color-only status through this component.

import { Text, View } from 'react-native'

export type StatusTone = 'neutral' | 'positive' | 'warning' | 'danger' | 'accent'

const TONE_CLASS: Record<StatusTone, { chip: string; text: string; dot: string }> = {
  neutral: {
    chip: 'bg-surface-light dark:bg-surface-dark',
    text: 'text-inkMuted-light dark:text-inkMuted-dark',
    dot: 'bg-inkMuted-light dark:bg-inkMuted-dark',
  },
  positive: {
    chip: 'bg-positiveTint-light dark:bg-positiveTint-dark',
    text: 'text-positiveStrong-light dark:text-positiveStrong-dark',
    dot: 'bg-positive-light dark:bg-positive-dark',
  },
  warning: {
    chip: 'bg-warningTint-light dark:bg-warningTint-dark',
    text: 'text-warningStrong-light dark:text-warningStrong-dark',
    dot: 'bg-warning-light dark:bg-warning-dark',
  },
  danger: {
    chip: 'bg-dangerTint-light dark:bg-dangerTint-dark',
    text: 'text-dangerStrong-light dark:text-dangerStrong-dark',
    dot: 'bg-danger-light dark:bg-danger-dark',
  },
  accent: {
    chip: 'bg-accentTint-light dark:bg-accentTint-dark',
    text: 'text-accentStrong-light dark:text-accentStrong-dark',
    dot: 'bg-accent-light dark:bg-accent-dark',
  },
}

interface StatusChipProps {
  label: string
  tone?: StatusTone
  dot?: boolean
  testID?: string
}

export function StatusChip({ label, tone = 'neutral', dot = false, testID }: StatusChipProps) {
  const classes = TONE_CLASS[tone]

  return (
    <View
      testID={testID}
      className={`flex-row items-center gap-1.5 self-start rounded-full px-2 py-0.5 ${classes.chip}`}
    >
      {dot && <View className={`h-2 w-2 rounded-full ${classes.dot}`} />}
      <Text className={`text-meta font-sansSemibold ${classes.text}`} maxFontSizeMultiplier={1.6}>
        {label}
      </Text>
    </View>
  )
}

// The bare status dot, for the budget rows where the design puts status
// ahead of the icon so it registers before any number does. Exported from
// the same file as the chip so the two can never drift onto different
// colors for the same state.
export function StatusDot({ tone, testID }: { tone: StatusTone; testID?: string }) {
  return <View testID={testID} className={`h-2 w-2 rounded-full ${TONE_CLASS[tone].dot}`} />
}
