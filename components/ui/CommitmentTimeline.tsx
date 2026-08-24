// The horizontal dot timeline above the "מה מגיע" list, per
// `OurMoney - Desktop.dc.html`'s Home frame: a thin line spanning the panel,
// a dot per upcoming commitment positioned by how many days out it is, and
// its date printed above the dot. The row list below it (CommitmentRow) was
// already built to the design system's own shared spec; this timeline was
// the one piece of that same panel that had no component at all — the panel
// rendered straight into the list with nothing above it.
//
// Position and colour intentionally reuse `commitmentUrgency` (the same
// three-tone read used by the list rows immediately below), rather than
// hand-picking a fourth colour scale — a dot and the row it belongs to
// should never disagree about how urgent that commitment is.

import { Text, View } from 'react-native'
import type { StatusTone } from '@/components/ui/StatusChip'
import { formatDateShort } from '@/lib/dates/format'

export interface TimelineCommitment {
  id: string
  date: string
  daysUntil: number
  tone: StatusTone
}

const DOT_CLASS: Record<StatusTone, string> = {
  danger: 'bg-danger-light dark:bg-danger-dark',
  warning: 'bg-warningStrong-light dark:bg-warningStrong-dark',
  positive: 'bg-positiveStrong-light dark:bg-positiveStrong-dark',
  accent: 'bg-accentStrong-light dark:bg-accentStrong-dark',
  neutral: 'bg-ink-light dark:bg-ink-dark',
}

const LABEL_CLASS: Record<StatusTone, string> = {
  danger: 'text-danger-light dark:text-danger-dark',
  warning: 'text-warningStrong-light dark:text-warningStrong-dark',
  positive: 'text-positiveStrong-light dark:text-positiveStrong-dark',
  accent: 'text-accentStrong-light dark:text-accentStrong-dark',
  neutral: 'text-ink-light dark:text-ink-dark',
}

// The panel's own header names its window explicitly ("14 הימים הקרובים"),
// so the timeline spans 14 days regardless of how far out the underlying
// commitments list itself is queried (30 days, matching the hero).
const WINDOW_DAYS = 14
// Matches the frame's own spread (dots sit between roughly 5% and 85% along
// the line, never flush against either edge).
const MARGIN_PERCENT = 6
const SPAN_PERCENT = 100 - MARGIN_PERCENT * 2

export function CommitmentTimeline({ items }: { items: TimelineCommitment[] }) {
  if (items.length === 0) return null

  return (
    <View
      className="web:desktop:mt-9 web:desktop:h-0.5 web:desktop:rounded-full web:desktop:bg-border-light dark:web:desktop:bg-border-dark"
      style={{ position: 'relative' }}
    >
      {items.map((item) => {
        const clampedDays = Math.max(0, Math.min(WINDOW_DAYS, item.daysUntil))
        // RTL: "today" sits near the right edge, later dates move left —
        // the same reading direction the design system's §11 RTL rules
        // require for every timeline in this app. Every offset below is
        // relative to this same line, not to a nested wrapper — position:
        // absolute children with no normal-flow sibling to size their own
        // parent collapse to a 0×0 box on React Native Web, which silently
        // dropped the date label the first time this was written with one.
        const right: `${number}%` = `${MARGIN_PERCENT + (clampedDays / WINDOW_DAYS) * SPAN_PERCENT}%`
        return (
          <View key={item.id} pointerEvents="none">
            <Text
              className={`text-meta font-sansBold ${LABEL_CLASS[item.tone]}`}
              style={{ position: 'absolute', top: -25, right, width: 44, marginRight: -18, textAlign: 'center' }}
              numberOfLines={1}
            >
              {formatDateShort(item.date)}
            </Text>
            <View
              className={`web:desktop:h-2.5 web:desktop:w-2.5 web:desktop:rounded-full ${DOT_CLASS[item.tone]}`}
              style={{ position: 'absolute', top: -5, right, marginRight: -5 }}
            />
          </View>
        )
      })}
    </View>
  )
}
