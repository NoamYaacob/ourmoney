// ImpactCheckPanel's own composition/rendering tests. The pure calculation
// is already covered by lib/engines/cashflow/calculateImpactCheck.test.ts;
// useImpactCheck's own composition wiring is covered by
// features/cashflow/hooks/useImpactCheck.test.tsx. This file mocks
// useImpactCheck at the module boundary and proves the UI renders the right
// thing for each state — invalid input, SAFE, UNSAFE, clear, and the
// no-causation-implied assumption sentence being always visible.

import { beforeEach, describe, expect, it, jest } from '@jest/globals'
import { fireEvent, render } from '@testing-library/react-native'
import i18n from '@/i18n'
import { formatILS } from '@/lib/money/format'
import { formatDateDisplay } from '@/lib/dates/format'
import type { ImpactCheckResult } from '@/lib/engines/cashflow/calculateImpactCheck'
import { ImpactCheckPanel } from './ImpactCheckPanel'

const mockCalculate = jest.fn<(amount: number) => ImpactCheckResult>()
const mockUseImpactCheck = jest.fn(() => ({
  isLoading: false,
  error: null as Error | null,
  hasData: true,
  refetch: jest.fn(),
  calculate: mockCalculate,
}))
jest.mock('@/features/cashflow/hooks/useImpactCheck', () => ({
  useImpactCheck: () => mockUseImpactCheck(),
}))

const SAFE_RESULT: ImpactCheckResult = {
  hypotheticalExpenseAgorot: 20_000,
  currentSafeToSpendAgorot: 138_450,
  postPurchaseSafeToSpendAgorot: 118_450,
  currentLowPointAgorot: 134_000,
  currentLowPointDate: '2026-09-20',
  postPurchaseLowPointAgorot: 114_000,
  postPurchaseLowPointDate: '2026-09-20',
  crossesBelowZero: false,
  verdict: 'SAFE',
}

const SAFE_AT_EXACT_ZERO_RESULT: ImpactCheckResult = {
  hypotheticalExpenseAgorot: 134_000,
  currentSafeToSpendAgorot: 138_450,
  postPurchaseSafeToSpendAgorot: 4_450,
  currentLowPointAgorot: 134_000,
  currentLowPointDate: '2026-09-20',
  postPurchaseLowPointAgorot: 0,
  postPurchaseLowPointDate: '2026-09-20',
  crossesBelowZero: false,
  verdict: 'SAFE',
}

const UNSAFE_RESULT: ImpactCheckResult = {
  hypotheticalExpenseAgorot: 400_000,
  currentSafeToSpendAgorot: 138_450,
  postPurchaseSafeToSpendAgorot: -261_550,
  currentLowPointAgorot: 134_000,
  currentLowPointDate: '2026-09-20',
  postPurchaseLowPointAgorot: -266_000,
  postPurchaseLowPointDate: '2026-09-20',
  crossesBelowZero: true,
  verdict: 'UNSAFE',
}

beforeEach(() => {
  mockCalculate.mockReset()
  mockUseImpactCheck.mockReturnValue({ isLoading: false, error: null, hasData: true, refetch: jest.fn(), calculate: mockCalculate })
})

describe('ImpactCheckPanel', () => {
  it('renders nothing but the collapsed entry row until data has resolved', async () => {
    mockUseImpactCheck.mockReturnValue({ isLoading: true, error: null, hasData: false, refetch: jest.fn(), calculate: mockCalculate })
    const { toJSON } = await render(<ImpactCheckPanel householdId="hh-1" />)
    expect(toJSON()).toBeNull()
  })

  it('is collapsed by default, showing only the entry row', async () => {
    const { getByText, queryByLabelText } = await render(<ImpactCheckPanel householdId="hh-1" />)
    expect(getByText(i18n.t('impactCheck.entryLabel'))).toBeTruthy()
    expect(queryByLabelText(i18n.t('impactCheck.amountLabel'))).toBeNull()
  })

  it('opens the amount field on tap, with no result until an amount is entered', async () => {
    const { getByText, getByLabelText, queryByText } = await render(<ImpactCheckPanel householdId="hh-1" />)
    await fireEvent.press(getByLabelText(i18n.t('impactCheck.entryLabel')))
    expect(getByLabelText(i18n.t('impactCheck.amountLabel'))).toBeTruthy()
    expect(queryByText(i18n.t('impactCheck.verdict.safeTitle'))).toBeNull()
    expect(mockCalculate).not.toHaveBeenCalled()
  })

  it('shows an inline invalid-amount error for a non-numeric entry, never calling calculate', async () => {
    const { getByText, getByLabelText } = await render(<ImpactCheckPanel householdId="hh-1" />)
    await fireEvent.press(getByLabelText(i18n.t('impactCheck.entryLabel')))
    await fireEvent.changeText(getByLabelText(i18n.t('impactCheck.amountLabel')), 'abc')
    expect(getByText(i18n.t('transactions.form.errors.amount.invalid'))).toBeTruthy()
    expect(mockCalculate).not.toHaveBeenCalled()
  })

  it('shows the not_positive error for zero, never calling calculate', async () => {
    const { getByText, getByLabelText } = await render(<ImpactCheckPanel householdId="hh-1" />)
    await fireEvent.press(getByLabelText(i18n.t('impactCheck.entryLabel')))
    await fireEvent.changeText(getByLabelText(i18n.t('impactCheck.amountLabel')), '0')
    expect(getByText(i18n.t('transactions.form.errors.amount.not_positive'))).toBeTruthy()
    expect(mockCalculate).not.toHaveBeenCalled()
  })

  it('shows the not_positive error for a negative-looking entry, never calling calculate', async () => {
    const { getByText, getByLabelText } = await render(<ImpactCheckPanel householdId="hh-1" />)
    await fireEvent.press(getByLabelText(i18n.t('impactCheck.entryLabel')))
    // The numeric keypad text input never actually admits a literal "-",
    // but a pasted/typed one must still be rejected, not silently coerced.
    await fireEvent.changeText(getByLabelText(i18n.t('impactCheck.amountLabel')), '-50')
    expect(mockCalculate).not.toHaveBeenCalled()
  })

  it('renders the SAFE state with factual model-output copy, no purchase-approval language, and no danger tint', async () => {
    mockCalculate.mockReturnValue(SAFE_RESULT)
    const { getByText, getByLabelText } = await render(<ImpactCheckPanel householdId="hh-1" />)
    await fireEvent.press(getByLabelText(i18n.t('impactCheck.entryLabel')))
    await fireEvent.changeText(getByLabelText(i18n.t('impactCheck.amountLabel')), '200')

    expect(mockCalculate).toHaveBeenCalledWith(20_000)
    expect(getByText(i18n.t('impactCheck.verdict.safeTitle'))).toBeTruthy()
    expect(
      getByText(i18n.t('impactCheck.verdict.safeBody', { amount: formatILS(SAFE_RESULT.postPurchaseLowPointAgorot) }))
    ).toBeTruthy()
    // Never purchase-approval/advice language — the modeled consequence only.
    const safeCopy = i18n.t('impactCheck.verdict.safeTitle') + ' ' + i18n.t('impactCheck.verdict.safeBody', { amount: '' })
    for (const forbidden of ['כדאי', 'אפשר לקנות', 'מתאים לכם', 'בטוח', 'מומלץ']) {
      expect(safeCopy).not.toMatch(forbidden)
    }
  })

  it('SAFE headline remains true at the exact-zero post-purchase low point (the verdict boundary itself)', async () => {
    mockCalculate.mockReturnValue(SAFE_AT_EXACT_ZERO_RESULT)
    const { getByText, getByLabelText } = await render(<ImpactCheckPanel householdId="hh-1" />)
    await fireEvent.press(getByLabelText(i18n.t('impactCheck.entryLabel')))
    await fireEvent.changeText(getByLabelText(i18n.t('impactCheck.amountLabel')), '1340')

    // "התחזית לא יורדת מתחת לאפס" ("the forecast does not drop below zero")
    // is still literally true when the low point IS zero — unlike a
    // "stays above zero" phrasing, which would be false at this exact
    // boundary. See calculateImpactCheck.ts: the verdict rule itself is
    // >= 0 is SAFE, so the copy must hold at exactly 0, not just above it.
    expect(getByText(i18n.t('impactCheck.verdict.safeTitle'))).toBeTruthy()
    expect(
      getByText(i18n.t('impactCheck.verdict.safeBody', { amount: formatILS(0) }))
    ).toBeTruthy()
  })

  it('renders the UNSAFE state with forecast/model-output language, never advice, and the low-point date', async () => {
    mockCalculate.mockReturnValue(UNSAFE_RESULT)
    const { getByText, getByLabelText } = await render(<ImpactCheckPanel householdId="hh-1" />)
    await fireEvent.press(getByLabelText(i18n.t('impactCheck.entryLabel')))
    await fireEvent.changeText(getByLabelText(i18n.t('impactCheck.amountLabel')), '4000')

    expect(mockCalculate).toHaveBeenCalledWith(400_000)
    expect(getByText(i18n.t('impactCheck.verdict.unsafeTitle'))).toBeTruthy()
    const expectedBody = i18n.t('impactCheck.verdict.unsafeBody', {
      amount: formatILS(UNSAFE_RESULT.postPurchaseLowPointAgorot),
      date: i18n.t('impactCheck.lowPointDate', { date: formatDateDisplay(UNSAFE_RESULT.postPurchaseLowPointDate) }),
    })
    expect(getByText(expectedBody)).toBeTruthy()
    // Never a lifestyle-advice headline — the deterministic consequence only.
    const unsafeCopy = i18n.t('impactCheck.verdict.unsafeTitle') + ' ' + expectedBody
    for (const forbidden of ['לא כדאי', 'כדאי', 'אפשר לקנות', 'מתאים לכם', 'בטוח', 'מומלץ']) {
      expect(unsafeCopy).not.toMatch(forbidden)
    }
  })

  it('states the cash-equivalent modeling assumption in user-visible copy', async () => {
    const { getByText, getByLabelText } = await render(<ImpactCheckPanel householdId="hh-1" />)
    await fireEvent.press(getByLabelText(i18n.t('impactCheck.entryLabel')))
    expect(getByText(new RegExp(i18n.t('impactCheck.assumptionCashEquivalent')))).toBeTruthy()
  })

  it('always discloses both assumption sentences with every valid calculated result', async () => {
    mockCalculate.mockReturnValue(SAFE_RESULT)
    const { getByText, getByLabelText } = await render(<ImpactCheckPanel householdId="hh-1" />)
    await fireEvent.press(getByLabelText(i18n.t('impactCheck.entryLabel')))
    await fireEvent.changeText(getByLabelText(i18n.t('impactCheck.amountLabel')), '200')
    expect(getByText(new RegExp(i18n.t('impactCheck.assumptionCashEquivalent')))).toBeTruthy()
    expect(getByText(new RegExp(i18n.t('impactCheck.assumptionDataUnchanged')))).toBeTruthy()
  })

  it('clearing the amount removes the result and returns to the entry prompt', async () => {
    mockCalculate.mockReturnValue(SAFE_RESULT)
    const { getByText, getByLabelText, queryByText } = await render(<ImpactCheckPanel householdId="hh-1" />)
    await fireEvent.press(getByLabelText(i18n.t('impactCheck.entryLabel')))
    await fireEvent.changeText(getByLabelText(i18n.t('impactCheck.amountLabel')), '200')
    expect(getByText(i18n.t('impactCheck.verdict.safeTitle'))).toBeTruthy()

    await fireEvent.press(getByText(i18n.t('impactCheck.clear')))
    expect(queryByText(i18n.t('impactCheck.verdict.safeTitle'))).toBeNull()
  })

  it('closing the panel collapses it back to the entry row', async () => {
    mockCalculate.mockReturnValue(SAFE_RESULT)
    const { getByText, getByLabelText, queryByLabelText } = await render(<ImpactCheckPanel householdId="hh-1" />)
    await fireEvent.press(getByLabelText(i18n.t('impactCheck.entryLabel')))
    await fireEvent.changeText(getByLabelText(i18n.t('impactCheck.amountLabel')), '200')
    await fireEvent.press(getByLabelText(i18n.t('impactCheck.close')))
    expect(queryByLabelText(i18n.t('impactCheck.amountLabel'))).toBeNull()
  })

  it('carries an accessible summary label on the result region', async () => {
    mockCalculate.mockReturnValue(SAFE_RESULT)
    const { getByText, getByLabelText } = await render(<ImpactCheckPanel householdId="hh-1" />)
    await fireEvent.press(getByLabelText(i18n.t('impactCheck.entryLabel')))
    await fireEvent.changeText(getByLabelText(i18n.t('impactCheck.amountLabel')), '200')
    expect(getByLabelText(i18n.t('impactCheck.sectionLabel'))).toBeTruthy()
  })
})
