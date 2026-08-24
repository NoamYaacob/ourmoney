// Regression coverage for two qa-adversarial-reviewer findings against this
// hook's own composition logic (every pure-calculation path is already
// covered by lib/engines/commitments/buildUpcomingCommitments.test.ts) —
// mocks every composed feature hook directly, the same technique screen-
// level tests already use, plus the one raw supabase query this file itself
// owns (the credit-card accounts' current-cycle transactions).

import { describe, expect, it, jest } from '@jest/globals'
import { renderHook, waitFor } from '@testing-library/react-native'
import { QueryClientProvider } from '@tanstack/react-query'
import type { ReactNode } from 'react'
import { createTestQueryClient } from '@/lib/testing/createTestQueryClient'
import { supabase } from '@/lib/supabase/client'
import { createQueryBuilderMock } from '@/lib/supabase/__mocks__/client'
import { useUpcomingCommitments } from './useUpcomingCommitments'

jest.mock('@/lib/supabase/client')

const DEFAULT_ACCOUNTS = { accounts: [] as unknown[], isLoading: false, error: null as Error | null, hasData: true }
const mockUseAccounts = jest.fn(() => DEFAULT_ACCOUNTS)
jest.mock('@/features/accounts/hooks/useAccounts', () => ({
  useAccounts: () => mockUseAccounts(),
}))

const DEFAULT_OBLIGATIONS = { obligations: [] as unknown[], isLoading: false, error: null as Error | null, hasData: true }
const mockUsePlannedObligations = jest.fn(() => DEFAULT_OBLIGATIONS)
jest.mock('@/features/obligations/hooks/usePlannedObligations', () => ({
  usePlannedObligations: () => mockUsePlannedObligations(),
}))

const DEFAULT_RECURRING = { recurringTransactions: [] as unknown[], isLoading: false, error: null as Error | null, hasData: true }
const mockUseRecurringTransactions = jest.fn(() => DEFAULT_RECURRING)
jest.mock('@/features/recurring/hooks/useRecurringTransactions', () => ({
  useRecurringTransactions: () => mockUseRecurringTransactions(),
}))

const DEFAULT_INSTALLMENT_PLANS = { plans: [] as unknown[], isLoading: false, error: null as Error | null, hasData: true }
const mockUseInstallmentPlans = jest.fn(() => DEFAULT_INSTALLMENT_PLANS)
jest.mock('@/features/installments/hooks/useInstallmentPlans', () => ({
  useInstallmentPlans: () => mockUseInstallmentPlans(),
}))

const DEFAULT_MATERIALIZED_COUNTS = {
  materializedCounts: {} as Record<string, number>,
  isLoading: false,
  error: null as Error | null,
  hasData: true,
}
const mockUseInstallmentMaterializedCounts = jest.fn(() => DEFAULT_MATERIALIZED_COUNTS)
jest.mock('@/features/installments/hooks/useInstallmentMaterializedCounts', () => ({
  useInstallmentMaterializedCounts: () => mockUseInstallmentMaterializedCounts(),
}))

function wrapper({ children }: { children: ReactNode }) {
  const queryClient = createTestQueryClient()
  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
}

function resetDefaults() {
  mockUseAccounts.mockReturnValue(DEFAULT_ACCOUNTS)
  mockUsePlannedObligations.mockReturnValue(DEFAULT_OBLIGATIONS)
  mockUseRecurringTransactions.mockReturnValue(DEFAULT_RECURRING)
  mockUseInstallmentPlans.mockReturnValue(DEFAULT_INSTALLMENT_PLANS)
  mockUseInstallmentMaterializedCounts.mockReturnValue(DEFAULT_MATERIALIZED_COUNTS)
  jest.mocked(supabase.from).mockReturnValue(
    createQueryBuilderMock({ data: [], error: null }) as unknown as ReturnType<typeof supabase.from>
  )
}

describe('useUpcomingCommitments', () => {
  it('resolves isLoading to false for a household with no credit-card accounts at all (the disabled-query trap)', async () => {
    resetDefaults()
    // No account is type 'credit_card', so the credit-card-transactions
    // query stays `enabled: false` for its entire lifetime — a disabled
    // TanStack Query never leaves status 'pending', so a naive
    // `creditCardTransactions.isPending` (unguarded by the same condition
    // that disabled it) would report `isLoading: true` forever.
    mockUseAccounts.mockReturnValue({
      accounts: [{ id: 'acc-1', type: 'checking', billing_cycle_day: null }],
      isLoading: false,
      error: null,
      hasData: true,
    })

    const { result } = await renderHook(() => useUpcomingCommitments('household-1'), { wrapper })

    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.commitments).toEqual([])
  })

  it('excludes installment plans entirely when the materialized-counts query fails, never silently re-forecasting an already-materialized instalment as a 0-materialized one', async () => {
    resetDefaults()
    mockUseInstallmentPlans.mockReturnValue({
      plans: [
        {
          id: 'inst-1',
          description: 'מקרר',
          total_agorot: 300000,
          installment_count: 3,
          monthly_agorot: 100000,
          first_charge_date: '2020-01-01', // long past, so every occurrence is within any horizon
          category_id: null,
          account_id: null,
          is_shared: true,
        },
      ],
      isLoading: false,
      error: null,
      hasData: true,
    })
    // The materialized-counts query itself failed — this plan really has 2
    // of 3 instalments already materialized, but that count is now
    // unknowable, not "0". No prior successful load either, so `hasData` is
    // false here (not merely `error` truthy) — the specific case the
    // installmentPlans gate above is meant to exclude.
    mockUseInstallmentMaterializedCounts.mockReturnValue({
      materializedCounts: {},
      isLoading: false,
      error: new Error('failed'),
      hasData: false,
    })

    const { result } = await renderHook(() => useUpcomingCommitments('household-1'), { wrapper })

    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.commitments.filter((c) => c.source === 'installment')).toEqual([])
    expect(result.current.hasPartialError).toBe(true)
  })

  it('still forecasts installment plans normally once materialized counts are available', async () => {
    resetDefaults()
    mockUseInstallmentPlans.mockReturnValue({
      plans: [
        {
          id: 'inst-1',
          description: 'מקרר',
          total_agorot: 300000,
          installment_count: 3,
          monthly_agorot: 100000,
          first_charge_date: '2020-01-01',
          category_id: null,
          account_id: null,
          is_shared: true,
        },
      ],
      isLoading: false,
      error: null,
      hasData: true,
    })
    mockUseInstallmentMaterializedCounts.mockReturnValue({
      materializedCounts: { 'inst-1': 1 }, // 1 of 3 already materialized
      isLoading: false,
      error: null,
      hasData: true,
    })

    const { result } = await renderHook(() => useUpcomingCommitments('household-1'), { wrapper })

    await waitFor(() => expect(result.current.isLoading).toBe(false))
    // Occurrences 2 and 3 remain — proves the materializedCount actually
    // reached the forecast, not just that the excluding path is silent.
    expect(result.current.commitments.filter((c) => c.source === 'installment')).toHaveLength(2)
    expect(result.current.hasPartialError).toBe(false)
  })

  // Regression coverage for the real-preview bug: Home's "מה מגיע" card
  // showing two commitments and then going completely empty on a later
  // render. Root cause was this hook's own composition zeroing a source's
  // contribution on `.error` alone (`obligations.error ? [] :
  // obligations.obligations.map(...)`), even when that source's underlying
  // query still held valid, last-known-good data (`query.data ?? []`
  // already retains it through a failed background refetch). The fix keys
  // every source on `.hasData` instead — this test proves a source that
  // succeeded once and is now merely reporting a background `error` still
  // contributes its real data, not `[]`.
  it('keeps a source\'s last-known-good data in the commitments list when it has loaded before, even while its latest background refetch is reporting an error', async () => {
    resetDefaults()
    mockUsePlannedObligations.mockReturnValue({
      obligations: [
        {
          id: 'ob-1',
          name: 'ארנונה דו־חודשית',
          amount_agorot: 122_400,
          due_date: '2020-01-05', // within any horizon relative to "today" in tests
          status: 'upcoming',
          category_id: null,
          account_id: null,
          is_shared: true,
        },
      ],
      // A background refetch just failed, but this source has real,
      // previously-loaded data — hasData stays true through that.
      isLoading: false,
      error: new Error('background refetch failed'),
      hasData: true,
    })

    const { result } = await renderHook(() => useUpcomingCommitments('household-1'), { wrapper })

    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.commitments.some((c) => c.source === 'obligation')).toBe(true)
    // The failure is still surfaced (non-blocking, per the render layer's
    // own handling) — it just no longer discards good data.
    expect(result.current.hasPartialError).toBe(true)
  })
})
