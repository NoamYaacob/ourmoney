// A white card holding a list of rows separated by hairlines — the single
// most repeated shape in the mobile design (the breakdown on 02, the feed
// groups on 03, the detail fields on 04, every section on 14).
//
// Two components rather than one because the divider belongs to the list,
// not to the row: a row that drew its own top border would double up when
// two lists were concatenated, and the first row would need a special case.
// ListCard renders the separators between its children instead, so a row is
// just a row wherever it is used.

import { Children, type ReactNode } from 'react'
import { Pressable, Text, View } from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { useColorScheme } from 'nativewind'
import { colors } from '@/constants/colors'

type CardState = 'default' | 'warning' | 'danger'

const STATE_CLASS: Record<CardState, string> = {
  default: 'border-border-light bg-surfaceMuted-light dark:border-border-dark dark:bg-surfaceMuted-dark',
  // The card itself is the warning — a tinted fill and a matching edge,
  // used when the card's whole reason for existing is the alert it carries.
  warning: 'border-warningBorder-light bg-surfaceMuted-light dark:border-warningBorder-dark dark:bg-surfaceMuted-dark',
  danger: 'border-dangerBorder-light bg-surfaceMuted-light dark:border-dangerBorder-dark dark:bg-surfaceMuted-dark',
}

interface ListCardProps {
  children: ReactNode
  state?: CardState
  className?: string
  testID?: string
}

export function ListCard({ children, state = 'default', className = '', testID }: ListCardProps) {
  const rows = Children.toArray(children).filter(Boolean)

  return (
    <View testID={testID} className={`overflow-hidden rounded-card border ${STATE_CLASS[state]} ${className}`}>
      {rows.map((row, index) => (
        // Index key: this wrapper is positional decoration around the
        // caller's row, and the row itself carries its own key from the
        // caller's data. Reordering rows reorders their own keyed content.
        <View key={index}>
          {index > 0 && <View className="h-px bg-divider-light dark:bg-divider-dark" />}
          {row}
        </View>
      ))}
    </View>
  )
}

interface ListRowProps {
  title: string
  subtitle?: string
  // Rendered at the row's start edge: a category emoji, an icon tile, an
  // avatar. Any node, because the design uses all three.
  leading?: ReactNode
  // The amount or value at the end edge.
  trailing?: ReactNode
  // Below the title/subtitle — a status chip, a pair of meta chips.
  badges?: ReactNode
  onPress?: () => void
  accessibilityLabel?: string
  testID?: string
}

export function ListRow({
  title,
  subtitle,
  leading,
  trailing,
  badges,
  onPress,
  accessibilityLabel,
  testID,
}: ListRowProps) {
  const { colorScheme } = useColorScheme()
  const chevronColor = colorScheme === 'dark' ? colors.inkMuted.dark : colors.inkMuted.light

  const content = (
    // min-h-[56px] rather than a fixed height: a row with a subtitle and a
    // badge row is legitimately taller, and Dynamic Type can grow any of
    // them. The floor is what guarantees the 44px touch target the design's
    // own hand-reach rule requires, with room for the padding.
    <View className="min-h-[56px] flex-row items-center gap-3 px-4 py-3">
      {leading}
      <View className="flex-1">
        <Text className="text-body font-sansSemibold text-ink-light dark:text-ink-dark">{title}</Text>
        {subtitle && (
          <Text className="mt-0.5 text-meta font-sans text-inkMuted-light dark:text-inkMuted-dark">{subtitle}</Text>
        )}
        {badges && <View className="mt-1 flex-row items-center gap-1.5">{badges}</View>}
      </View>
      {trailing}
      {onPress && (
        // chevron-back, not -forward. Ionicons does not auto-mirror here, and
        // under RTL the glyph that points *away* from the start edge (deeper
        // into the stack) is the back-facing one. Getting this backwards was
        // a real regression in the desktop pass; the design file's own
        // drill-in rows point the same way.
        <Ionicons name="chevron-back" size={18} color={chevronColor} />
      )}
    </View>
  )

  if (!onPress) return <View testID={testID}>{content}</View>

  return (
    <Pressable
      testID={testID}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? title}
      className="active:bg-surface-light dark:active:bg-surface-dark"
    >
      {content}
    </Pressable>
  )
}

// The small rounded tile the design puts at the start of most rows. Kept
// here so its size (36px) and radius stay tied to the row that hosts it.
//
// Visual QA pass: `neutral` was `bg-surface-light` (#f4f2ed, the page's own
// paper background) filling a tile that only ever sits on a ListCard, whose
// fill is `surfaceMuted` (#ffffff) — an 11-unit-per-channel difference the
// eye reads as no fill at all. The icon glyph itself was never the contrast
// problem (`ink` on either surface passes at 15.6:1+ per this file's own
// audit); the tile's edge disappearing against its own card is what read as
// "weak contrast" in the More screen QA report. `border` is this system's
// existing token for a fill/edge meant to stay visible against a white
// card — reused here rather than inventing a new one.
export function RowIcon({ children, tone = 'neutral' }: { children: ReactNode; tone?: 'neutral' | 'warning' | 'danger' | 'accent' }) {
  const toneClass = {
    neutral: 'bg-border-light dark:bg-border-dark',
    warning: 'bg-warningTint-light dark:bg-warningTint-dark',
    danger: 'bg-dangerSurface-light dark:bg-dangerSurface-dark',
    accent: 'bg-accentTint-light dark:bg-accentTint-dark',
  }[tone]

  return <View className={`h-9 w-9 items-center justify-center rounded-row ${toneClass}`}>{children}</View>
}
