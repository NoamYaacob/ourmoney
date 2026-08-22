// Supabase-aware composition layer only — every actual computation happens
// in lib/engines/commitments/buildUpcomingCommitments.ts (pure, unit-tested,
// no network). Composes pre-existing, unmodified hooks — the exact same
// obligations/recurring/installments hooks useSafeToSpend.ts already uses,
// plus useAccounts + one lean transactions query scoped to just credit-card
// accounts' current billing cycle (never the full household transaction
// history).

import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase/client'
import { useAccounts } from '@/features/accounts/hooks/useAccounts'
import { usePlannedObligations } from '@/features/obligations/hooks/usePlannedObligations'
import { useRecurringTransactions } from '@/features/recurring/hooks/useRecurringTransactions'
import { useInstallmentPlans } from '@/features/installments/hooks/useInstallmentPlans'
import { useInstallmentMaterializedCounts } from '@/features/installments/hooks/useInstallmentMaterializedCounts'
import { getHorizonRange } from '@/lib/engines/cashflow/horizonRange'
import { localDateString } from '@/features/budgets/lib/budgetPeriod'
import { buildUpcomingCommitments, type UpcomingCommitment } from '@/lib/engines/commitments/buildUpcomingCommitments'

export function upcomingCommitmentsCreditCardTransactionsQueryKey(householdId: string | null | undefined) {
  return ['accounts', 'creditCardTransactions', householdId] as const
}

export interface UseUpcomingCommitmentsResult {
  commitments: UpcomingCommitment[]
  isLoading: boolean
  hasPartialError: boolean
}

export function useUpcomingCommitments(householdId: string | null | undefined): UseUpcomingCommitmentsResult {
  const accounts = useAccounts(householdId)
  const obligations = usePlannedObligations(householdId)
  const recurring = useRecurringTransactions(householdId)
  const installmentPlans = useInstallmentPlans(householdId)
  const materializedCounts = useInstallmentMaterializedCounts(householdId)

  const creditCardAccountIds = accounts.accounts
    .filter((a) => a.type === 'credit_card' && a.billing_cycle_day !== null)
    .map((a) => a.id)

  // Lean, dedicated query (account_id/amount_agorot/txn_date/transfer_id/
  // is_shared only) — deliberately NOT useTransactions' full-row household
  // query: this hook only ever needs credit-card accounts' own rows to
  // compute their current cycle's spend.
  const creditCardTransactions = useQuery({
    queryKey: upcomingCommitmentsCreditCardTransactionsQueryKey(householdId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from('transactions')
        .select('account_id, amount_agorot, txn_date, transfer_id, is_shared')
        .eq('household_id', householdId as string)
        .in('account_id', creditCardAccountIds)
      if (error) throw error
      return data
    },
    enabled: !!householdId && creditCardAccountIds.length > 0,
  })

  const today = localDateString()
  const horizon = getHorizonRange('days30', today)

  const commitments = buildUpcomingCommitments({
    today,
    horizonEnd: horizon.end,
    obligations: obligations.error
      ? []
      : obligations.obligations.map((o) => ({
          id: o.id,
          name: o.name,
          amountAgorot: o.amount_agorot,
          dueDate: o.due_date,
          status: o.status,
          categoryId: o.category_id,
          accountId: o.account_id,
          isShared: o.is_shared,
        })),
    recurringTemplates: recurring.error
      ? []
      : recurring.recurringTransactions.map((r) => ({
          id: r.id,
          description: r.description,
          amountAgorot: r.amount_agorot,
          frequency: r.frequency,
          dayOfMonth: r.day_of_month,
          nextDueDate: r.next_due_date,
          isActive: r.is_active,
          categoryId: r.category_id,
          accountId: r.account_id,
          isShared: r.is_shared,
        })),
    installmentPlans: installmentPlans.error
      ? []
      : installmentPlans.plans.map((p) => ({
          id: p.id,
          description: p.description,
          totalAgorot: p.total_agorot,
          installmentCount: p.installment_count,
          monthlyAgorot: p.monthly_agorot,
          firstChargeDate: p.first_charge_date,
          materializedCount: materializedCounts.materializedCounts[p.id] ?? 0,
          categoryId: p.category_id,
          accountId: p.account_id,
          isShared: p.is_shared,
        })),
    creditCardAccounts:
      accounts.error || creditCardTransactions.error
        ? []
        : accounts.accounts
            .filter((a) => a.type === 'credit_card' && a.billing_cycle_day !== null)
            .map((account) => ({
              accountId: account.id,
              accountName: account.name,
              billingCycleDay: account.billing_cycle_day as number,
              transactions: (creditCardTransactions.data ?? [])
                .filter((t) => t.account_id === account.id)
                .map((t) => ({
                  amount_agorot: t.amount_agorot,
                  txn_date: t.txn_date,
                  transfer_id: t.transfer_id,
                  isShared: t.is_shared,
                })),
            })),
  })

  return {
    commitments,
    isLoading:
      accounts.isLoading ||
      obligations.isLoading ||
      recurring.isLoading ||
      installmentPlans.isLoading ||
      materializedCounts.isLoading ||
      creditCardTransactions.isPending,
    hasPartialError: !!(
      accounts.error ||
      obligations.error ||
      recurring.error ||
      installmentPlans.error ||
      materializedCounts.error ||
      creditCardTransactions.error
    ),
  }
}
