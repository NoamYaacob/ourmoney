// Mocks every composed feature hook directly, the same technique
// useFinancialAlerts.test.tsx already uses — the pure calculation itself is
// already covered by lib/engines/cashflow/calculateImpactCheck.test.ts; this
// file only proves the composition/assembly wiring and the "no persistence,
// no caching per amount" contract.

import { describe, expect, it, jest } from '@jest/globals'
import { renderHook } from '@testing-library/react-native'
import { useImpactCheck } from './useImpactCheck'

const DEFAULT_ACCOUNTS = {
  accounts: [{ id: 'acc-bank', type: 'checking', is_active: true, include_in_total: true }],
  isLoading: false,
  error: null as Error | null,
  hasData: true,
  refetch: jest.fn(),
}
const mockUseAccounts = jest.fn(() => DEFAULT_ACCOUNTS)
jest.mock('@/features/accounts/hooks/useAccounts', () => ({
  useAccounts: () => mockUseAccounts(),
}))

const DEFAULT_BALANCES = { balances: { 'acc-bank': 500_000 } as Record<string, number>, isLoading: false, error: null as Error | null, hasData: true, refetch: jest.fn() }
const mockUseAccountBalances = jest.fn(() => DEFAULT_BALANCES)
jest.mock('@/features/accounts/hooks/useAccountBalances', () => ({
  useAccountBalances: () => mockUseAccountBalances(),
}))

const DEFAULT_OBLIGATIONS = { obligations: [] as unknown[], isLoading: false, error: null as Error | null, hasData: true, refetch: jest.fn() }
const mockUsePlannedObligations = jest.fn(() => DEFAULT_OBLIGATIONS)
jest.mock('@/features/obligations/hooks/usePlannedObligations', () => ({
  usePlannedObligations: () => mockUsePlannedObligations(),
}))

const DEFAULT_RECURRING = { recurringTransactions: [] as unknown[], isLoading: false, error: null as Error | null, hasData: true, refetch: jest.fn() }
const mockUseRecurringTransactions = jest.fn(() => DEFAULT_RECURRING)
jest.mock('@/features/recurring/hooks/useRecurringTransactions', () => ({
  useRecurringTransactions: () => mockUseRecurringTransactions(),
}))

const DEFAULT_PLANS = { plans: [] as unknown[], isLoading: false, error: null as Error | null, hasData: true, refetch: jest.fn() }
const mockUseInstallmentPlans = jest.fn(() => DEFAULT_PLANS)
jest.mock('@/features/installments/hooks/useInstallmentPlans', () => ({
  useInstallmentPlans: () => mockUseInstallmentPlans(),
}))

const DEFAULT_MATERIALIZED = {
  materializedCounts: {} as Record<string, number>,
  maxMaterializedIndices: {} as Record<string, number>,
  isLoading: false,
  error: null as Error | null,
  hasData: true,
  refetch: jest.fn(),
}
const mockUseInstallmentMaterializedCounts = jest.fn(() => DEFAULT_MATERIALIZED)
jest.mock('@/features/installments/hooks/useInstallmentMaterializedCounts', () => ({
  useInstallmentMaterializedCounts: () => mockUseInstallmentMaterializedCounts(),
}))

function resetDefaults() {
  mockUseAccounts.mockReturnValue(DEFAULT_ACCOUNTS)
  mockUseAccountBalances.mockReturnValue(DEFAULT_BALANCES)
  mockUsePlannedObligations.mockReturnValue(DEFAULT_OBLIGATIONS)
  mockUseRecurringTransactions.mockReturnValue(DEFAULT_RECURRING)
  mockUseInstallmentPlans.mockReturnValue(DEFAULT_PLANS)
  mockUseInstallmentMaterializedCounts.mockReturnValue(DEFAULT_MATERIALIZED)
}

describe('useImpactCheck', () => {
  it('hasData is true only once every one of the six composed sources has resolved', async () => {
    resetDefaults()
    mockUseAccounts.mockReturnValue({ ...DEFAULT_ACCOUNTS, hasData: false })
    const { result, unmount } = await renderHook(() => useImpactCheck('household-1'))
    expect(result.current.hasData).toBe(false)
    await unmount()
  })

  it('calculate() derives availableCashAgorot from eligible cash accounts only, and produces a deterministic result for a given amount', async () => {
    resetDefaults()
    const { result, unmount } = await renderHook(() => useImpactCheck('household-1'))
    const impact = result.current.calculate(20_000)
    expect(impact.hypotheticalExpenseAgorot).toBe(20_000)
    expect(impact.currentSafeToSpendAgorot).toBe(500_000)
    expect(impact.postPurchaseSafeToSpendAgorot).toBe(480_000)
    await unmount()
  })

  it('excludes a credit-card account balance from the modeled cash figure, matching eligibleCashAccounts.ts', async () => {
    resetDefaults()
    mockUseAccounts.mockReturnValue({
      ...DEFAULT_ACCOUNTS,
      accounts: [
        { id: 'acc-bank', type: 'checking', is_active: true, include_in_total: true },
        { id: 'acc-card', type: 'credit_card', is_active: true, include_in_total: true },
      ],
    })
    mockUseAccountBalances.mockReturnValue({ ...DEFAULT_BALANCES, balances: { 'acc-bank': 500_000, 'acc-card': -80_000 } })
    const { result, unmount } = await renderHook(() => useImpactCheck('household-1'))
    const impact = result.current.calculate(0)
    expect(impact.currentSafeToSpendAgorot).toBe(500_000)
    await unmount()
  })

  it('calculate() returns an independent result each call — no memoized/cached result carried between two different amounts', async () => {
    resetDefaults()
    const { result, unmount } = await renderHook(() => useImpactCheck('household-1'))
    const first = result.current.calculate(10_000)
    const second = result.current.calculate(50_000)
    expect(first.hypotheticalExpenseAgorot).toBe(10_000)
    expect(second.hypotheticalExpenseAgorot).toBe(50_000)
    expect(first.postPurchaseSafeToSpendAgorot).not.toBe(second.postPurchaseSafeToSpendAgorot)
    await unmount()
  })

  it('refetch re-invokes every one of the six composed refetch functions', async () => {
    resetDefaults()
    const { result, unmount } = await renderHook(() => useImpactCheck('household-1'))
    result.current.refetch()
    expect(DEFAULT_ACCOUNTS.refetch).toHaveBeenCalled()
    expect(DEFAULT_BALANCES.refetch).toHaveBeenCalled()
    expect(DEFAULT_OBLIGATIONS.refetch).toHaveBeenCalled()
    expect(DEFAULT_RECURRING.refetch).toHaveBeenCalled()
    expect(DEFAULT_PLANS.refetch).toHaveBeenCalled()
    expect(DEFAULT_MATERIALIZED.refetch).toHaveBeenCalled()
    await unmount()
  })
})
