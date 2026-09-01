// Mocks every composed feature hook directly, the same technique
// useFinancialAlerts.test.tsx already uses — the pure calculation itself is
// already covered by lib/engines/cashflow/calculateImpactCheck.test.ts; this
// file only proves the composition/assembly wiring and the "no persistence,
// no caching per amount" contract.

import { describe, expect, it, jest } from '@jest/globals'
import { renderHook } from '@testing-library/react-native'
import { useImpactCheck } from './useImpactCheck'
import { getCurrentBillingCycleRange } from '@/features/accounts/lib/creditCardCycle'
import { localDateString } from '@/features/budgets/lib/budgetPeriod'

const DEFAULT_ACCOUNTS = {
  accounts: [{ id: 'acc-bank', name: 'עו״ש', type: 'checking', is_active: true, include_in_total: true, billing_cycle_day: null as number | null }],
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

// RRR P1 finding #7: the seventh composed source, fetched bounded to a
// recent window and used only to compute each credit card's own current-
// cycle spend (assembleForecastInputs.ts). Empty by default here — no card
// in this suite's fixtures — so every pre-existing test's figures are
// unaffected unless a test explicitly sets transactions.
const DEFAULT_TRANSACTIONS = { transactions: [] as unknown[], isLoading: false, error: null as Error | null, hasData: true, refetch: jest.fn() }
const mockUseTransactions = jest.fn(() => DEFAULT_TRANSACTIONS)
jest.mock('@/features/transactions/hooks/useTransactions', () => ({
  useTransactions: () => mockUseTransactions(),
}))

function resetDefaults() {
  mockUseAccounts.mockReturnValue(DEFAULT_ACCOUNTS)
  mockUseAccountBalances.mockReturnValue(DEFAULT_BALANCES)
  mockUsePlannedObligations.mockReturnValue(DEFAULT_OBLIGATIONS)
  mockUseRecurringTransactions.mockReturnValue(DEFAULT_RECURRING)
  mockUseInstallmentPlans.mockReturnValue(DEFAULT_PLANS)
  mockUseInstallmentMaterializedCounts.mockReturnValue(DEFAULT_MATERIALIZED)
  mockUseTransactions.mockReturnValue(DEFAULT_TRANSACTIONS)
}

describe('useImpactCheck', () => {
  it('hasData is true only once every one of the seven composed sources has resolved', async () => {
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
        { id: 'acc-bank', name: 'עו״ש', type: 'checking', is_active: true, include_in_total: true, billing_cycle_day: null },
        { id: 'acc-card', name: 'ויזה כאל', type: 'credit_card', is_active: true, include_in_total: true, billing_cycle_day: null },
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

  it('refetch re-invokes every one of the seven composed refetch functions', async () => {
    resetDefaults()
    const { result, unmount } = await renderHook(() => useImpactCheck('household-1'))
    result.current.refetch()
    expect(DEFAULT_ACCOUNTS.refetch).toHaveBeenCalled()
    expect(DEFAULT_BALANCES.refetch).toHaveBeenCalled()
    expect(DEFAULT_OBLIGATIONS.refetch).toHaveBeenCalled()
    expect(DEFAULT_RECURRING.refetch).toHaveBeenCalled()
    expect(DEFAULT_PLANS.refetch).toHaveBeenCalled()
    expect(DEFAULT_MATERIALIZED.refetch).toHaveBeenCalled()
    expect(DEFAULT_TRANSACTIONS.refetch).toHaveBeenCalled()
    await unmount()
  })

  // RRR P1 finding #7 regression: proves the wiring reaches useImpactCheck,
  // not just the pure engine (already covered by calculateImpactCheck.test.ts).
  it('reserves a credit card\'s current-cycle posted spend in calculate()\'s result', async () => {
    resetDefaults()
    mockUseAccounts.mockReturnValue({
      ...DEFAULT_ACCOUNTS,
      accounts: [
        { id: 'acc-bank', name: 'עו״ש', type: 'checking', is_active: true, include_in_total: true, billing_cycle_day: null },
        { id: 'acc-card', name: 'ויזה כאל', type: 'credit_card', is_active: true, include_in_total: true, billing_cycle_day: 10 },
      ],
    })
    // The hook derives "today" from the real clock (localDateString()), so
    // the fixture transaction's date is computed relative to that same real
    // "today" — never a hardcoded date — to stay inside the current cycle
    // regardless of which real date this test happens to run on.
    const currentCycle = getCurrentBillingCycleRange(10, localDateString())
    mockUseTransactions.mockReturnValue({
      ...DEFAULT_TRANSACTIONS,
      transactions: [
        { account_id: 'acc-card', amount_agorot: -41_280, txn_date: currentCycle.start, transfer_id: null, is_excluded: false },
      ],
    })
    const { result, unmount } = await renderHook(() => useImpactCheck('household-1'))
    const impact = result.current.calculate(0)
    expect(impact.currentSafeToSpendAgorot).toBe(500_000 - 41_280)
    await unmount()
  })
})
