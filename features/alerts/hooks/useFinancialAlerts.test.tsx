// Regression coverage for a qa-adversarial-reviewer finding against this
// hook's own composition logic (every pure-calculation path is already
// covered by lib/engines/alerts/buildFinancialAlerts.test.ts) — mocks every
// composed feature hook directly, the same technique screen-level tests
// already use.

import { describe, expect, it, jest } from '@jest/globals'
import { renderHook, waitFor } from '@testing-library/react-native'
import { QueryClientProvider } from '@tanstack/react-query'
import type { ReactNode } from 'react'
import { createTestQueryClient } from '@/lib/testing/createTestQueryClient'
import { useFinancialAlerts } from './useFinancialAlerts'

const DEFAULT_FORECAST = { result: null as unknown, isLoading: false, error: null as Error | null }
const mockUseCashFlowForecast = jest.fn(() => DEFAULT_FORECAST)
jest.mock('@/features/cashflow/hooks/useCashFlowForecast', () => ({
  useCashFlowForecast: () => mockUseCashFlowForecast(),
}))

const DEFAULT_SAFE_TO_SPEND = { result: { safeToSpendAgorot: 0 }, isLoading: false, error: null as Error | null }
const mockUseSafeToSpend = jest.fn(() => DEFAULT_SAFE_TO_SPEND)
jest.mock('@/features/cashflow/hooks/useSafeToSpend', () => ({
  useSafeToSpend: () => mockUseSafeToSpend(),
}))

const DEFAULT_OBLIGATIONS = { obligations: [] as unknown[], isLoading: false, error: null as Error | null }
const mockUsePlannedObligations = jest.fn(() => DEFAULT_OBLIGATIONS)
jest.mock('@/features/obligations/hooks/usePlannedObligations', () => ({
  usePlannedObligations: () => mockUsePlannedObligations(),
}))

const DEFAULT_PRICE_INCREASE = { detections: [] as unknown[], isLoading: false, error: null as Error | null }
const mockUsePriceIncreaseDetections = jest.fn(() => DEFAULT_PRICE_INCREASE)
jest.mock('@/features/recurring/hooks/usePriceIncreaseDetections', () => ({
  usePriceIncreaseDetections: () => mockUsePriceIncreaseDetections(),
}))

const DEFAULT_BUDGET = { categories: [] as unknown[], isLoading: false, error: null as Error | null }
const mockUseBudgetProgress = jest.fn(() => DEFAULT_BUDGET)
jest.mock('@/features/budgets/hooks/useBudgetProgress', () => ({
  useBudgetProgress: () => mockUseBudgetProgress(),
}))

const DEFAULT_ACCOUNTS = { accounts: [] as unknown[], isLoading: false, error: null as Error | null }
const mockUseAccounts = jest.fn(() => DEFAULT_ACCOUNTS)
jest.mock('@/features/accounts/hooks/useAccounts', () => ({
  useAccounts: () => mockUseAccounts(),
}))

const DEFAULT_TRANSACTIONS = { transactions: [] as unknown[], isLoading: false, error: null as Error | null }
const mockUseTransactions = jest.fn(() => DEFAULT_TRANSACTIONS)
jest.mock('@/features/transactions/hooks/useTransactions', () => ({
  useTransactions: () => mockUseTransactions(),
}))

const DEFAULT_CATEGORIES = { categories: [] as unknown[], isLoading: false, error: null as Error | null }
const mockUseCategories = jest.fn(() => DEFAULT_CATEGORIES)
jest.mock('@/features/categories/hooks/useCategories', () => ({
  useCategories: () => mockUseCategories(),
}))

const DEFAULT_GOALS = { goals: [] as unknown[], isLoading: false, error: null as Error | null }
const mockUseSavingsGoals = jest.fn(() => DEFAULT_GOALS)
jest.mock('@/features/savings/hooks/useSavingsGoals', () => ({
  useSavingsGoals: () => mockUseSavingsGoals(),
}))

const DEFAULT_BALANCES = { balances: {} as Record<string, number>, isLoading: false, error: null as Error | null }
const mockUseAccountBalances = jest.fn(() => DEFAULT_BALANCES)
jest.mock('@/features/accounts/hooks/useAccountBalances', () => ({
  useAccountBalances: () => mockUseAccountBalances(),
}))

function wrapper({ children }: { children: ReactNode }) {
  const queryClient = createTestQueryClient()
  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
}

function resetDefaults() {
  mockUseCashFlowForecast.mockReturnValue(DEFAULT_FORECAST)
  mockUseSafeToSpend.mockReturnValue(DEFAULT_SAFE_TO_SPEND)
  mockUsePlannedObligations.mockReturnValue(DEFAULT_OBLIGATIONS)
  mockUsePriceIncreaseDetections.mockReturnValue(DEFAULT_PRICE_INCREASE)
  mockUseBudgetProgress.mockReturnValue(DEFAULT_BUDGET)
  mockUseAccounts.mockReturnValue(DEFAULT_ACCOUNTS)
  mockUseTransactions.mockReturnValue(DEFAULT_TRANSACTIONS)
  mockUseCategories.mockReturnValue(DEFAULT_CATEGORIES)
  mockUseSavingsGoals.mockReturnValue(DEFAULT_GOALS)
  mockUseAccountBalances.mockReturnValue(DEFAULT_BALANCES)
}

describe('useFinancialAlerts', () => {
  it('still surfaces a savings_goal_behind alert for a MANUAL goal even when the unrelated accountBalances query fails', async () => {
    resetDefaults()
    mockUseSavingsGoals.mockReturnValue({
      goals: [
        {
          id: 'goal-1',
          name: 'קרן חירום',
          progress_source: 'manual',
          account_id: null,
          current_agorot: 10000,
          target_agorot: 500000,
          target_date: '2020-01-01', // long overdue, still incomplete
          is_completed: false,
        },
      ],
      isLoading: false,
      error: null,
    })
    // accountBalances is irrelevant to a 'manual' goal's current_agorot —
    // its own query failing must not blank this alert out.
    mockUseAccountBalances.mockReturnValue({ balances: {}, isLoading: false, error: new Error('failed') })

    const { result } = await renderHook(() => useFinancialAlerts('household-1'), { wrapper })

    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.alerts.some((a) => a.type === 'savings_goal_behind')).toBe(true)
    expect(result.current.hasPartialError).toBe(true)
  })

  it('produces no savings-derived alerts when the savingsGoals query itself fails', async () => {
    resetDefaults()
    mockUseSavingsGoals.mockReturnValue({ goals: [], isLoading: false, error: new Error('failed') })

    const { result } = await renderHook(() => useFinancialAlerts('household-1'), { wrapper })

    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.alerts.some((a) => a.type === 'savings_goal_behind')).toBe(false)
    expect(result.current.hasPartialError).toBe(true)
  })
})
