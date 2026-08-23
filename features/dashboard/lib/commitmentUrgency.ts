// How near a commitment is, in words rather than a color.
//
// The design's "מה מגיע" rows carry a time chip — "בעוד 6 ימים", "היום",
// "באיחור" — sitting next to a colored urgency bar. The chip is what makes
// the row readable without the color, which is the accessibility rule the
// design system states outright: urgency is carried by the wording as well
// as the tone.
//
// Pure date arithmetic over this app's canonical YYYY-MM-DD local-date
// strings, reusing `daysBetween` from the alerts engine rather than
// re-deriving it — the two must never disagree about how many days away
// something is, since the same commitment can drive both an alert and a
// row.

import { daysBetween } from '@/lib/engines/alerts/alertSeverity'
import type { StatusTone } from '@/components/ui/StatusChip'

export interface CommitmentUrgency {
  daysUntil: number
  tone: StatusTone
  // i18n key under `home.next`, plus the count it needs.
  labelKey: 'pastDue' | 'today' | 'tomorrow' | 'inDays'
  count: number
}

// Matches OBLIGATION_WARNING_MAX_DAYS in the alerts engine: inside three
// days is the same "act on this now" window there, so a row and an alert
// about the same charge never disagree on how urgent it looks.
const URGENT_MAX_DAYS = 3
// Beyond a week out, a commitment is a fact rather than a pressure.
const SOON_MAX_DAYS = 7

export function commitmentUrgency(today: string, dueDate: string): CommitmentUrgency {
  const daysUntil = daysBetween(today, dueDate)

  if (daysUntil < 0) return { daysUntil, tone: 'danger', labelKey: 'pastDue', count: 0 }
  if (daysUntil === 0) return { daysUntil, tone: 'danger', labelKey: 'today', count: 0 }
  if (daysUntil === 1) return { daysUntil, tone: 'danger', labelKey: 'tomorrow', count: 0 }
  if (daysUntil <= URGENT_MAX_DAYS) return { daysUntil, tone: 'danger', labelKey: 'inDays', count: daysUntil }
  if (daysUntil <= SOON_MAX_DAYS) return { daysUntil, tone: 'warning', labelKey: 'inDays', count: daysUntil }

  return { daysUntil, tone: 'neutral', labelKey: 'inDays', count: daysUntil }
}

// Which greeting to open the Home screen with. Takes the hour rather than
// reading the clock itself so it stays a pure function — the caller passes
// `new Date().getHours()`, and a test can pass any hour it likes.
export function greetingKey(hour: number): 'morning' | 'afternoon' | 'evening' {
  if (hour < 12) return 'morning'
  if (hour < 17) return 'afternoon'
  return 'evening'
}
