// The quiet label above a group ("מה קורה בדרך", "אתמול · 21.08"), with an
// optional figure at the end edge — a count, a day's total.
//
// Deliberately not a heading component: a section label is metadata about
// the list below it, sitting on the page background rather than inside a
// card. Card headings are larger and live inside the card (`text-heading`),
// and mixing the two was what made earlier screens read as a stack of
// equally-loud widgets.

import type { ReactNode } from 'react'
import { Text, View } from 'react-native'

interface SectionLabelProps {
  children: ReactNode
  trailing?: ReactNode
  className?: string
}

export function SectionLabel({ children, trailing, className = '' }: SectionLabelProps) {
  return (
    <View className={`flex-row items-baseline justify-between ${className}`}>
      <Text
        className="text-meta font-sansSemibold tracking-[0.06em] text-inkMuted-light dark:text-inkMuted-dark"
        maxFontSizeMultiplier={1.6}
      >
        {children}
      </Text>
      {trailing}
    </View>
  )
}

// The heading *inside* a card ("הדבר הבא", "תקציב אוגוסט").
export function CardHeading({ children, trailing }: { children: ReactNode; trailing?: ReactNode }) {
  return (
    <View className="flex-row items-baseline justify-between">
      <Text className="text-heading font-heeboBold text-ink-light dark:text-ink-dark">{children}</Text>
      {trailing}
    </View>
  )
}
