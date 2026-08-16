// Computes price-increase detections fresh from existing transaction
// history on every read — no persisted alert table, no new schema (same
// "no redundant derived state" discipline as
// features/budgets/hooks/useBudgetProgress.ts). Reuses the household's
// full, unfiltered transaction history via the existing useTransactions
// hook; features/recurring/lib/priceIncreaseDetection.ts does all the
// actual detection work as a pure function.

import { useTransactions } from '@/features/transactions/hooks/useTransactions'
import { detectPriceIncreases, type RecurringChargeObservation } from '../lib/priceIncreaseDetection'
import type { PriceIncreaseDetection, PriceIncreaseThreshold } from '../lib/priceIncreaseDetection'

export function usePriceIncreaseDetections(
  householdId: string | null | undefined,
  threshold?: PriceIncreaseThreshold
): { detections: PriceIncreaseDetection[]; isLoading: boolean; error: Error | null } {
  const { transactions, isLoading, error } = useTransactions(householdId)

  const observations: RecurringChargeObservation[] = transactions.map((t) => ({
    id: t.id,
    recurringId: t.recurring_id,
    accountId: t.account_id,
    description: t.description,
    merchantName: t.merchant_name,
    amountAgorot: t.amount_agorot,
    txnDate: t.txn_date,
    isExcluded: t.is_excluded,
  }))

  return {
    detections: detectPriceIncreases(observations, threshold),
    isLoading,
    error,
  }
}
