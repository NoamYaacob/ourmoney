import { beforeEach, describe, expect, it, jest } from '@jest/globals'
import { fireEvent, render } from '@testing-library/react-native'
import i18n from '@/i18n'
import CashFlow from './index'
import type { HorizonKind } from '@/lib/engines/cashflow/horizonRange'

const mockPush = jest.fn()
jest.mock('expo-router', () => ({
  useRouter: () => ({ push: mockPush }),
}))
jest.mock('@expo/vector-icons', () => ({
  Ionicons: () => null,
}))
jest.mock('@/features/auth/hooks/useAuth', () => ({
  useAuth: () => ({ user: { id: 'user-1' } }),
}))
jest.mock('@/features/household/hooks/useHousehold', () => ({
  useHousehold: () => ({ householdId: 'household-1', isLoading: false }),
}))

const DEFAULT_RESULT = {
  availableCashAgorot: 830000,
  plannedObligationsAgorot: 47500,
  recurringAgorot: 15000,
  reservedAgorot: 62500,
  safeToSpendAgorot: 767500,
  shortfallAgorot: 0,
  items: [
    { sourceType: 'recurring' as const, sourceId: 'rec-1', description: 'אינטרנט', amountAgorot: 15000, date: '2026-09-18', categoryId: null, accountId: null },
    { sourceType: 'obligation' as const, sourceId: 'ob-1', description: 'ארנונה', amountAgorot: 47500, date: '2026-09-10', categoryId: null, accountId: null },
  ],
}
const mockUseSafeToSpend = jest.fn<
  (householdId: string | null | undefined, horizonKind: HorizonKind) => {
    result: typeof DEFAULT_RESULT
    horizon: { kind: HorizonKind; start: string; end: string }
    isLoading: boolean
    error: Error | null
  }
>()
jest.mock('@/features/cashflow/hooks/useSafeToSpend', () => ({
  useSafeToSpend: (householdId: string | null | undefined, horizonKind: HorizonKind) =>
    mockUseSafeToSpend(householdId, horizonKind),
}))

function defaultResult(overrides: Partial<typeof DEFAULT_RESULT> = {}) {
  return {
    result: { ...DEFAULT_RESULT, ...overrides },
    horizon: { kind: 'month' as const, start: '2026-08-16', end: '2026-08-31' },
    isLoading: false,
    error: null as Error | null,
  }
}

describe('CashFlow detail screen', () => {
  beforeEach(() => {
    mockPush.mockClear()
    mockUseSafeToSpend.mockReset()
    mockUseSafeToSpend.mockReturnValue(defaultResult())
  })

  it('renders the full breakdown: available cash, obligations, recurring, reserved, safe-to-spend', async () => {
    const { getByText, getAllByText } = await render(<CashFlow />)

    expect(getByText(i18n.t('cashFlow.availableCash'))).toBeTruthy()
    expect(getByText(i18n.t('cashFlow.plannedObligations'))).toBeTruthy()
    expect(getByText(i18n.t('cashFlow.recurringCharges'))).toBeTruthy()
    expect(getByText(i18n.t('cashFlow.reserved'))).toBeTruthy()
    expect(getByText(i18n.t('cashFlow.safeToSpend'))).toBeTruthy()
    expect(getAllByText(/7,675/).length).toBeGreaterThanOrEqual(1) // ₪7,675.00 safe-to-spend
  })

  it('renders the itemized list sorted by date with correct source labels', async () => {
    const { getByText, getAllByText } = await render(<CashFlow />)

    expect(getByText('ארנונה')).toBeTruthy()
    expect(getByText('אינטרנט')).toBeTruthy()
    expect(getAllByText(i18n.t('cashFlow.source.obligation'))).toHaveLength(1)
    expect(getAllByText(i18n.t('cashFlow.source.recurring'))).toHaveLength(1)
  })

  it('shows the empty state when there are no reserved items', async () => {
    mockUseSafeToSpend.mockReturnValue(defaultResult({ items: [], plannedObligationsAgorot: 0, recurringAgorot: 0, reservedAgorot: 0 }))

    const { getByText, queryByText } = await render(<CashFlow />)

    expect(getByText(i18n.t('cashFlow.empty'))).toBeTruthy()
    expect(queryByText('ארנונה')).toBeNull()
  })

  it('shows the shortfall message when safe-to-spend is negative', async () => {
    mockUseSafeToSpend.mockReturnValue(
      defaultResult({ availableCashAgorot: 10000, safeToSpendAgorot: -52500, shortfallAgorot: 52500 })
    )

    const { getByText } = await render(<CashFlow />)

    expect(getByText(/חסר.*525/)).toBeTruthy()
  })

  it('shows an error message when the query fails', async () => {
    mockUseSafeToSpend.mockReturnValue({ ...defaultResult(), error: new Error('network down') })

    const { getByText } = await render(<CashFlow />)

    expect(getByText(i18n.t('cashFlow.errors.generic'))).toBeTruthy()
  })

  it('navigates to the obligation detail screen when an obligation item is tapped', async () => {
    const { getByText } = await render(<CashFlow />)

    await fireEvent.press(getByText('ארנונה'))

    expect(mockPush).toHaveBeenCalledWith('/obligations/ob-1')
  })

  it('navigates to the recurring detail screen when a recurring item is tapped', async () => {
    const { getByText } = await render(<CashFlow />)

    await fireEvent.press(getByText('אינטרנט'))

    expect(mockPush).toHaveBeenCalledWith('/recurring/rec-1')
  })

  it('switches horizon and re-queries useSafeToSpend with the new horizon kind', async () => {
    const { getByText } = await render(<CashFlow />)

    await fireEvent.press(getByText(i18n.t('cashFlow.horizon.week')))

    expect(mockUseSafeToSpend).toHaveBeenLastCalledWith('household-1', 'week')
  })

  it('defaults to the month horizon on first render', async () => {
    await render(<CashFlow />)

    expect(mockUseSafeToSpend).toHaveBeenCalledWith('household-1', 'month')
  })
})
