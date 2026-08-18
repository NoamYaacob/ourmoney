// Computes spent/remaining/percent per category from CANONICAL transaction
// data on every read — no persisted "spent" counter anywhere (CLAUDE.md: no
// redundant derived state between DB/TanStack Query/Zustand). Formula per
// PROJECT_SPEC.md § Budgets: spent = -SUM(amount_agorot) WHERE
// household_id, category_id, txn_date BETWEEN period_start AND period_end,
// is_shared = TRUE, is_excluded = FALSE.

import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase/client'
import { remainingAgorot, spentAgorotFromExpenses, spentPercent, sumAgorot } from '@/lib/money/arithmetic'
import { getPeriodEnd } from '../lib/budgetPeriod'
import type { BudgetCategoryProgress } from '@/types/app'

interface BudgetRow {
  id: string
  category_id: string
  amount_agorot: number
  categories: { name_he: string; icon: string } | null
}

export function budgetProgressQueryKey(householdId: string | null | undefined, periodStart: string | undefined) {
  return ['budgets', 'progress', householdId, periodStart] as const
}

export function useBudgetProgress(householdId: string | null | undefined, periodStart: string | undefined) {
  const query = useQuery({
    queryKey: budgetProgressQueryKey(householdId, periodStart),
    queryFn: async (): Promise<{ categories: BudgetCategoryProgress[]; totalAllocatedAgorot: number; totalSpentAgorot: number }> => {
      const hid = householdId as string
      const start = periodStart as string
      const end = getPeriodEnd(start)

      const { data: budget, error: budgetError } = await supabase
        .from('budgets')
        .select('id')
        .eq('household_id', hid)
        .eq('period_start', start)
        .maybeSingle()
      if (budgetError) throw budgetError

      const allocationsPromise = budget
        ? supabase
            .from('budget_allocations')
            .select('id, category_id, amount_agorot, categories(name_he, icon)')
            .eq('budget_id', budget.id)
        : Promise.resolve({ data: [] as BudgetRow[], error: null })

      const transactionsPromise = supabase
        .from('transactions')
        .select('category_id, amount_agorot')
        .eq('household_id', hid)
        .eq('is_shared', true)
        .eq('is_excluded', false)
        // Migration 008 (ADR-035): a transfer leg's category_id is always
        // NULL (enforced by a CHECK constraint), so it would never match an
        // allocation anyway — this exclusion exists so a transfer's negative
        // source leg cannot inflate totalSpentAgorot below, which sums every
        // matched transaction's amount regardless of category_id.
        .is('transfer_id', null)
        .gte('txn_date', start)
        .lte('txn_date', end)
        .lt('amount_agorot', 0)

      const [{ data: allocations, error: allocationsError }, { data: transactions, error: transactionsError }] =
        await Promise.all([allocationsPromise, transactionsPromise])
      if (allocationsError) throw allocationsError
      if (transactionsError) throw transactionsError

      const spentByCategory = new Map<string, number[]>()
      for (const txn of transactions ?? []) {
        if (!txn.category_id) continue
        const list = spentByCategory.get(txn.category_id) ?? []
        list.push(txn.amount_agorot)
        spentByCategory.set(txn.category_id, list)
      }

      const categories: BudgetCategoryProgress[] = ((allocations as unknown as BudgetRow[]) ?? []).map((allocation) => {
        const spentAgorot = spentAgorotFromExpenses(spentByCategory.get(allocation.category_id) ?? [])
        return {
          categoryId: allocation.category_id,
          categoryNameHe: allocation.categories?.name_he ?? '',
          categoryIcon: allocation.categories?.icon ?? '📦',
          allocatedAgorot: allocation.amount_agorot,
          spentAgorot,
          remainingAgorot: remainingAgorot(allocation.amount_agorot, spentAgorot),
          percentSpent: spentPercent(spentAgorot, allocation.amount_agorot),
        }
      })

      const totalAllocatedAgorot = sumAgorot(categories.map((c) => c.allocatedAgorot))
      const totalSpentAgorot = spentAgorotFromExpenses((transactions ?? []).map((t) => t.amount_agorot))

      return { categories, totalAllocatedAgorot, totalSpentAgorot }
    },
    enabled: !!householdId && !!periodStart,
  })

  return {
    categories: query.data?.categories ?? [],
    totalAllocatedAgorot: query.data?.totalAllocatedAgorot ?? 0,
    totalSpentAgorot: query.data?.totalSpentAgorot ?? 0,
    isLoading: !!householdId && !!periodStart && query.isPending,
    error: query.error,
    // Exposed for app/(app)/budgets/index.tsx's save flow — see its own
    // comment for why refetching immediately before constructing a
    // save_budget_allocations() payload matters (qa-adversarial-reviewer
    // finding: true-replace semantics + a client-reconstructed "full
    // desired set" built from a possibly-stale cache can silently drop
    // another member's concurrent allocation).
    refetch: query.refetch,
  }
}
