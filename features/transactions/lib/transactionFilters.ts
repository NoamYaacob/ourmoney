// The Transactions list's search/filter state — a plain, serializable
// object that lives in the route's query params (app/(app)/transactions/index.tsx),
// not component state or a global store. Two pure functions split what
// belongs server-side from what belongs client-side (see this milestone's
// report for the full architecture rationale):
//   buildTransactionQueryFilters — the subset already supported by
//     useTransactions.ts's TransactionFilters (account/category/period/
//     shared) — these map onto indexed columns and meaningfully reduce
//     what's fetched, so they're pushed into the Supabase query.
//   filterTransactionsLocally — search text (across description/
//     merchant_name/category name) and income/expense type — cheap,
//     per-row checks that don't need a network round trip, and category-
//     name search needs a client-side join against the categories list
//     regardless, so there's no server-side win to chase for these.

import type { Transaction } from '@/types/app'
import type { TransactionFilters } from '../hooks/useTransactions'
import { getPeriodRange, TRANSACTION_PERIODS, type TransactionPeriod } from './transactionPeriod'

export type TransactionTypeFilter = 'all' | 'expense' | 'income' | 'transfer'
export type TransactionSharedFilter = 'all' | 'shared' | 'personal'

// categoryId is a plain account/category id, the literal sentinel
// 'uncategorized', or null for "all categories" — one field covers all
// three category states requirement #2 asks for.
export interface TransactionFilterState {
  search: string
  period: TransactionPeriod
  accountId: string | null
  categoryId: string | null
  type: TransactionTypeFilter
  shared: TransactionSharedFilter
}

export const DEFAULT_TRANSACTION_FILTER_STATE: TransactionFilterState = {
  search: '',
  period: 'all_time',
  accountId: null,
  categoryId: null,
  type: 'all',
  shared: 'all',
}

export function isDefaultTransactionFilterState(state: TransactionFilterState): boolean {
  return (
    state.search.trim() === '' &&
    state.period === DEFAULT_TRANSACTION_FILTER_STATE.period &&
    state.accountId === null &&
    state.categoryId === null &&
    state.type === 'all' &&
    state.shared === 'all'
  )
}

// The server-side portion: account, category/uncategorized, date period,
// shared/personal. Every one of these already has (or, for `uncategorized`,
// gains — see useTransactions.ts) a direct Supabase query predicate, so
// pushing them into the fetch is what keeps "current month" from pulling a
// household's entire multi-year history over the network just to filter it
// away client-side afterward.
export function buildTransactionQueryFilters(state: TransactionFilterState, now?: Date): TransactionFilters {
  const { periodStart, periodEnd } = getPeriodRange(state.period, now)
  const filters: TransactionFilters = {}

  if (state.accountId) filters.accountId = state.accountId

  if (state.categoryId === 'uncategorized') {
    filters.uncategorized = true
  } else if (state.categoryId) {
    filters.categoryId = state.categoryId
  }

  if (periodStart) filters.periodStart = periodStart
  if (periodEnd) filters.periodEnd = periodEnd

  if (state.shared === 'shared') filters.isShared = true
  else if (state.shared === 'personal') filters.isShared = false

  return filters
}

// Case-insensitive; a no-op for Hebrew (which has no case distinction, so
// Hebrew text round-trips through toLowerCase() unchanged) and still
// correct for Latin-script merchant names (e.g. "IKEA" vs "ikea").
function normalizeForSearch(value: string): string {
  return value.trim().toLowerCase()
}

// The client-side portion: search text (description/merchant_name/category
// name) and income/expense type. Runs over whatever the server query
// already narrowed to (period/account/category/shared), so even at
// thousands of household-lifetime transactions this is a single O(n) pass
// over an already-small slice — see useMemo at the call site for avoiding
// redundant recomputation.
export function filterTransactionsLocally(
  transactions: readonly Transaction[],
  criteria: Pick<TransactionFilterState, 'search' | 'type'>,
  categoryNameById: Readonly<Record<string, string>>
): Transaction[] {
  const query = normalizeForSearch(criteria.search)

  return transactions.filter((transaction) => {
    // Income/expense is the existing signed-amount convention
    // (transactionSign.ts: isIncome -> positive, expense -> negative) —
    // never inferred from category name. A transfer leg is excluded from
    // both: its negative source leg is not "an expense" and its positive
    // destination leg is not "income" (migration 008, ADR-035) — it only
    // ever matches the dedicated 'transfer' filter below.
    const isTransfer = transaction.transfer_id !== null
    if (criteria.type === 'expense' && (isTransfer || transaction.amount_agorot >= 0)) return false
    if (criteria.type === 'income' && (isTransfer || transaction.amount_agorot <= 0)) return false
    if (criteria.type === 'transfer' && !isTransfer) return false

    if (!query) return true

    const categoryName = transaction.category_id ? (categoryNameById[transaction.category_id] ?? '') : ''
    const haystacks = [transaction.description, transaction.merchant_name ?? '', categoryName]
    return haystacks.some((haystack) => normalizeForSearch(haystack).includes(query))
  })
}

// Route-param encoding — this is what makes filter state survive
// Transactions -> Transaction Detail -> back: it lives on the route itself
// (app/(app)/transactions/index.tsx's own useLocalSearchParams/setParams),
// not component state, so it's unaffected by whatever the navigator does
// to the screen instance underneath. expo-router params are always plain
// strings (or absent), so every field round-trips through a string form —
// 'all'/'' both decode back to the "no filter" value for accountId/
// categoryId, matching how DEFAULT_TRANSACTION_FILTER_STATE represents them.
export interface TransactionFilterParams {
  q?: string
  period?: string
  accountId?: string
  categoryId?: string
  type?: string
  shared?: string
}

function isTransactionPeriod(value: string): value is TransactionPeriod {
  return (TRANSACTION_PERIODS as readonly string[]).includes(value)
}

export function parseTransactionFilterParams(params: TransactionFilterParams): TransactionFilterState {
  const period = params.period && isTransactionPeriod(params.period) ? params.period : DEFAULT_TRANSACTION_FILTER_STATE.period
  const type: TransactionTypeFilter =
    params.type === 'expense' || params.type === 'income' || params.type === 'transfer' ? params.type : 'all'
  const shared: TransactionSharedFilter = params.shared === 'shared' || params.shared === 'personal' ? params.shared : 'all'

  return {
    search: params.q ?? '',
    period,
    accountId: params.accountId && params.accountId !== 'all' ? params.accountId : null,
    categoryId: params.categoryId && params.categoryId !== 'all' ? params.categoryId : null,
    type,
    shared,
  }
}

// Always emits every key (never omits a default one) so router.setParams
// deterministically overwrites the full filter state on every change,
// rather than leaving a stale param from a previous selection behind.
export function transactionFilterStateToParams(state: TransactionFilterState): Required<TransactionFilterParams> {
  return {
    q: state.search,
    period: state.period,
    accountId: state.accountId ?? 'all',
    categoryId: state.categoryId ?? 'all',
    type: state.type,
    shared: state.shared,
  }
}
