// Computes price-increase detections fresh from existing transaction
// history on every read — no persisted alert table, no new schema (same
// "no redundant derived state" discipline as
// features/budgets/hooks/useBudgetProgress.ts). Reuses the household's
// full, unfiltered transaction history via the existing useTransactions
// hook; features/recurring/lib/priceIncreaseDetection.ts does all the
// actual detection work as a pure function.

import { useTransactions } from '@/features/transactions/hooks/useTransactions'
import {
  detectPriceIncreases,
  type RecurringChargeObservation,
  type PriceIncreaseDetection,
  type PriceIncreaseThreshold,
} from '../lib/priceIncreaseDetection'

export function usePriceIncreaseDetections(
  householdId: string | null | undefined,
  threshold?: PriceIncreaseThreshold
): {
  detections: PriceIncreaseDetection[]
  isLoading: boolean
  error: Error | null
  hasData: boolean
  refetch: () => void
} {
  const { transactions, isLoading, error, hasData, refetch } = useTransactions(householdId)

  // Migration 008 (ADR-035): a transfer leg is never a recurring charge —
  // excluded before detection rather than relying on detectPriceIncreases
  // to somehow recognize it (it has no signal to do so; a transfer's
  // description is user-chosen free text, indistinguishable in shape from
  // any real recurring charge's description).
  const observations: RecurringChargeObservation[] = transactions
    .filter((t) => t.transfer_id === null)
    .map((t) => ({
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
    hasData,
    refetch,
  }
}
