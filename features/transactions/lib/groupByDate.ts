// Turns a flat transaction list into the design's date-grouped feed.
//
// The mobile brief asked for transactions grouped naturally by date rather
// than rendered as a table, with each group carrying the day's own total.
// Both the grouping and that total are decisions worth pinning down in one
// tested place instead of inside a render.
//
// What the day total means, precisely: money that left the household that
// day. Income is excluded (a payday would otherwise read as a huge
// "spent"), and so are the legs of an internal transfer — moving ₪2,000 to
// savings is not a day's spending, the same boundary
// features/analytics/lib/analyticsTransaction.ts draws for the same reason.
// An `is_excluded` row is excluded too, since the household has said it
// should not count.
//
// Deliberately NOT filtered by is_shared, unlike the analytics boundary: a
// feed is a record of what happened, and hiding a personal purchase from
// the day it was made would make the list disagree with itself. is_shared
// is budget attribution only (CLAUDE.md), and this total is not a budget
// figure.

import type { Transaction } from '@/types/app'

export interface TransactionDateGroup {
  // The group's own YYYY-MM-DD date, for the header and as a stable key.
  date: string
  transactions: Transaction[]
  // Positive magnitude of the day's outgoing money. 0 for a day of pure
  // income or transfers, which the header then omits rather than showing
  // a meaningless zero.
  spentAgorot: number
}

export function groupTransactionsByDate(transactions: readonly Transaction[]): TransactionDateGroup[] {
  const byDate = new Map<string, Transaction[]>()

  for (const transaction of transactions) {
    const existing = byDate.get(transaction.txn_date)
    if (existing) existing.push(transaction)
    else byDate.set(transaction.txn_date, [transaction])
  }

  return [...byDate.entries()]
    // Newest day first — a feed opens on what just happened.
    .sort(([a], [b]) => (a < b ? 1 : a > b ? -1 : 0))
    .map(([date, group]) => ({
      date,
      transactions: group,
      spentAgorot: group.reduce(
        (sum, transaction) =>
          transaction.amount_agorot < 0 && !transaction.is_excluded && transaction.transfer_id === null
            ? sum + Math.abs(transaction.amount_agorot)
            : sum,
        0
      ),
    }))
}

// The header wording for a group: "היום", "אתמול", or nothing special.
// Returns the i18n key plus the short date the header pairs it with, so the
// screen never re-derives "is this yesterday" itself.
export interface DateGroupHeading {
  relativeKey: 'today' | 'yesterday' | null
  shortDate: string
}

export function dateGroupHeading(groupDate: string, today: string): DateGroupHeading {
  const shortDate = groupDate.slice(8, 10) + '.' + groupDate.slice(5, 7)

  if (groupDate === today) return { relativeKey: 'today', shortDate }

  const [year, month, day] = today.split('-').map(Number) as [number, number, number]
  // Local Date arithmetic over this app's plain calendar-date strings, the
  // same style lib/engines/alerts/alertSeverity.ts's daysBetween uses —
  // never a UTC/ISO parse, which would shift the day either side of
  // midnight for anyone east or west of GMT.
  const yesterdayDate = new Date(year, month - 1, day - 1)
  const yesterday = `${yesterdayDate.getFullYear()}-${String(yesterdayDate.getMonth() + 1).padStart(2, '0')}-${String(
    yesterdayDate.getDate()
  ).padStart(2, '0')}`

  if (groupDate === yesterday) return { relativeKey: 'yesterday', shortDate }

  return { relativeKey: null, shortDate }
}
