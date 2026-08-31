// The breakdown screen exists to be trusted, so these tests are about its
// arithmetic rather than its layout: every subtraction it shows has items
// behind it, a group the household does not have is absent rather than
// zeroed, and the instalments component the design file predates is shown
// whenever the engine reserved anything for it.

import { beforeEach, describe, expect, it, jest } from '@jest/globals'
import { fireEvent, render, waitFor } from '@testing-library/react-native'
import i18n from '@/i18n'
import { formatILS } from '@/lib/money/format'
import SafeToSpendDetail from './index'

const mockBack = jest.fn()
jest.mock('expo-router', () => ({
  useRouter: () => ({ push: jest.fn(), back: mockBack }),
}))
jest.mock('@/features/auth/hooks/useAuth', () => ({
  useAuth: () => ({ user: { id: 'user-1' } }),
}))
jest.mock('@/features/household/hooks/useHousehold', () => ({
  useHousehold: () => ({ householdId: 'household-1', isLoading: false }),
}))

function item(overrides: Record<string, unknown>) {
  return {
    sourceType: 'obligation',
    sourceId: 'o1',
    description: 'ארנונה דו־חודשית',
    amountAgorot: 122_400,
    date: '2026-08-28',
    categoryId: null,
    accountId: null,
    ...overrides,
  }
}

const BASE = {
  availableCashAgorot: 1_310_050,
  plannedObligationsAgorot: 347_000,
  recurringAgorot: 824_600,
  installmentsAgorot: 0,
  reservedAgorot: 1_171_600,
  safeToSpendAgorot: 138_450,
  shortfallAgorot: 0,
  items: [
    item({ sourceId: 'o1' }),
    item({ sourceId: 'o2', description: 'טסט ואגרת רכב', amountAgorot: 118_000, date: '2026-09-04' }),
    item({ sourceType: 'recurring', sourceId: 'r1', description: 'משכנתא', amountAgorot: 824_600, date: '2026-08-30' }),
  ],
}
let mockResult = { ...BASE }
jest.mock('@/features/cashflow/hooks/useSafeToSpend', () => ({
  useSafeToSpend: () => ({
    result: mockResult,
    horizon: { start: '2026-08-22', end: '2026-08-31' },
    isLoading: false,
    error: null,
    hasData: true,
  }),
}))

// CP8F — this screen now also mounts ImpactCheckPanel, which composes its
// own useImpactCheck. Mocked at the same module boundary as useSafeToSpend
// above so this screen's own tests never reach the real Supabase client —
// ImpactCheckPanel's own behavior is covered by its own test file.
jest.mock('@/features/cashflow/hooks/useImpactCheck', () => ({
  useImpactCheck: () => ({
    isLoading: false,
    error: null,
    hasData: true,
    refetch: jest.fn(),
    calculate: () => ({
      hypotheticalExpenseAgorot: 0,
      currentSafeToSpendAgorot: 0,
      postPurchaseSafeToSpendAgorot: 0,
      currentLowPointAgorot: 0,
      currentLowPointDate: '2026-09-01',
      postPurchaseLowPointAgorot: 0,
      postPurchaseLowPointDate: '2026-09-01',
      crossesBelowZero: false,
      verdict: 'SAFE',
    }),
  }),
}))

beforeEach(() => {
  mockBack.mockClear()
  mockResult = { ...BASE }
})

describe('safe-to-spend breakdown', () => {
  it('opens on the money that exists and closes on the result', async () => {
    const { getByText } = await render(<SafeToSpendDetail />)

    expect(getByText(i18n.t('safeToSpendDetail.availableCash'))).toBeTruthy()
    expect(getByText(formatILS(BASE.availableCashAgorot))).toBeTruthy()
    expect(getByText(i18n.t('safeToSpendDetail.result'))).toBeTruthy()
    // The hero figure and the equals row are the same number, rendered twice.
    expect(getByText(i18n.t('safeToSpendDetail.intro'))).toBeTruthy()
  })

  it('lists the individual charges behind a group', async () => {
    const { getByText } = await render(<SafeToSpendDetail />)

    // Obligations open by default — the group the household is most likely
    // to be asking about.
    expect(getByText(/ארנונה דו־חודשית/)).toBeTruthy()
    expect(getByText(/טסט ואגרת רכב/)).toBeTruthy()
  })

  it('collapses a group when its header is tapped', async () => {
    const { getByLabelText, queryByText } = await render(<SafeToSpendDetail />)

    // Pressed by its accessible name, not by the label Text inside it —
    // the Text is not the pressable, the row is.
    fireEvent.press(getByLabelText(i18n.t('safeToSpendDetail.obligations')))
    await waitFor(() => expect(queryByText(/ארנונה דו־חודשית/)).toBeNull())
  })

  it('omits a group the household does not have, rather than showing a zero', async () => {
    const { queryByText } = await render(<SafeToSpendDetail />)

    // installmentsAgorot is 0 in the base fixture.
    expect(queryByText(i18n.t('safeToSpendDetail.installments'))).toBeNull()
  })

  it('shows the instalments group whenever the engine reserved for it', async () => {
    // The design file's breakdown has three rows; the engine has four
    // components. A household shown three subtractions and a total
    // reflecting four would be right to distrust the screen.
    mockResult = {
      ...BASE,
      installmentsAgorot: 59_900,
      reservedAgorot: BASE.reservedAgorot + 59_900,
      safeToSpendAgorot: BASE.safeToSpendAgorot - 59_900,
      items: [
        ...BASE.items,
        item({ sourceType: 'installment', sourceId: 'i1', description: 'מחסני רהיטים', amountAgorot: 59_900 }),
      ],
    }
    const { getByText } = await render(<SafeToSpendDetail />)

    expect(getByText(i18n.t('safeToSpendDetail.installments'))).toBeTruthy()
    expect(getByText(formatILS(59_900))).toBeTruthy()
  })

  it('names the shortfall instead of printing a negative available figure', async () => {
    mockResult = { ...BASE, safeToSpendAgorot: -61_200, shortfallAgorot: 61_200 }
    const { getByText, queryByText } = await render(<SafeToSpendDetail />)

    expect(getByText(i18n.t('safeToSpendDetail.shortfallResult'))).toBeTruthy()
    expect(queryByText(i18n.t('safeToSpendDetail.result'))).toBeNull()
  })

  it('always states what the number leaves out', async () => {
    const { getByText } = await render(<SafeToSpendDetail />)
    // The bolded lead-in and the body are separate Text nodes inside one
    // paragraph, so this matches the body's own opening rather than the
    // whole concatenated string.
    expect(getByText(/חיסכון, השקעות וכרטיסי האשראי/)).toBeTruthy()
  })

  it('offers Impact Check as a secondary action, collapsed by default (CP8F)', async () => {
    const { getByText } = await render(<SafeToSpendDetail />)
    expect(getByText(i18n.t('impactCheck.entryLabel'))).toBeTruthy()
  })
})
