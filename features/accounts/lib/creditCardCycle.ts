// "Current cycle spend" for a credit_card account — fully derived, never
// stored (migration 016/ADR-037's "no card_statements table" decision:
// a statement period is computed live from accounts.billing_cycle_day, the
// same "compute live, never persist" discipline computeAccountBalances.ts
// already applies to account balances).

function pad2(n: number): string {
  return String(n).padStart(2, '0')
}

function closingDateForMonth(year: number, monthIndex0: number, billingCycleDay: number): string {
  // Clamps to the last real day of a shorter month — the same semantics
  // addMonthClamped (lib/engines/cashflow/forecastInstallmentOccurrences.ts)
  // already established for billing_cycle_day's sibling problem.
  const daysInTargetMonth = new Date(year, monthIndex0 + 1, 0).getDate()
  const day = Math.min(billingCycleDay, daysInTargetMonth)
  return `${year}-${pad2(monthIndex0 + 1)}-${pad2(day)}`
}

function addOneDayIso(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number) as [number, number, number]
  const date = new Date(y, m - 1, d)
  date.setDate(date.getDate() + 1)
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`
}

export interface CreditCardCycleRange {
  start: string
  end: string
}

// The open, in-progress billing cycle a credit card is currently
// accumulating charges into: start is the day after the most recent
// closing date, end is the next closing date (today itself, if today IS a
// closing date).
export function getCurrentBillingCycleRange(billingCycleDay: number, todayIso: string): CreditCardCycleRange {
  const [year, month] = todayIso.split('-').map(Number) as [number, number]
  const monthIndex0 = month - 1
  const closingThisMonth = closingDateForMonth(year, monthIndex0, billingCycleDay)

  if (todayIso > closingThisMonth) {
    const nextMonthIndex0 = monthIndex0 + 1
    const nextYear = year + Math.floor(nextMonthIndex0 / 12)
    const nextMonthNormalized = ((nextMonthIndex0 % 12) + 12) % 12
    return {
      start: addOneDayIso(closingThisMonth),
      end: closingDateForMonth(nextYear, nextMonthNormalized, billingCycleDay),
    }
  }

  const prevMonthIndex0 = monthIndex0 - 1
  const prevYear = year + Math.floor(prevMonthIndex0 / 12)
  const prevMonthNormalized = ((prevMonthIndex0 % 12) + 12) % 12
  return {
    start: addOneDayIso(closingDateForMonth(prevYear, prevMonthNormalized, billingCycleDay)),
    end: closingThisMonth,
  }
}

export interface CycleSpendTransaction {
  amount_agorot: number
  txn_date: string
  transfer_id: string | null
}

// Excludes transfer legs (transfer_id IS NOT NULL) — a statement payment is
// an ordinary internal transfer (ADR-037's settlement-as-transfer decision)
// landing on the card as a positive amount; it is money paid TOWARD the
// card, never a purchase, and must never appear as "spend." Only negative
// (expense) amounts count, same as every other spend total in this app.
export function computeCurrentCycleSpendAgorot(
  transactions: readonly CycleSpendTransaction[],
  range: CreditCardCycleRange
): number {
  return transactions
    .filter((t) => t.transfer_id === null && t.amount_agorot < 0 && t.txn_date >= range.start && t.txn_date <= range.end)
    .reduce((sum, t) => sum - t.amount_agorot, 0)
}
