import { beforeEach, describe, expect, it, jest } from '@jest/globals'
import { fireEvent, render } from '@testing-library/react-native'
import i18n from '@/i18n'
import Installments from './index'
import { getCurrentBillingCycleRange } from '@/features/accounts/lib/creditCardCycle'
import { localDateString } from '@/features/budgets/lib/budgetPeriod'
import { formatDateDisplay } from '@/lib/dates/format'
import { formatILS } from '@/lib/money/format'

jest.mock('expo-router', () => ({
  useRouter: () => ({ push: jest.fn() }),
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
const mockUseAccounts = jest.fn(() => ({
  accounts: [
    { id: 'acc-cc', name: 'ויזה כאל', type: 'credit_card', is_active: true, billing_cycle_day: null as number | null },
    { id: 'acc-checking', name: 'עו״ש', type: 'checking', is_active: true, billing_cycle_day: null as number | null },
  ],
  isLoading: false,
}))
jest.mock('@/features/accounts/hooks/useAccounts', () => ({
  useAccounts: () => mockUseAccounts(),
}))
jest.mock('@/features/categories/hooks/useCategories', () => ({
  useCategories: () => ({
    categories: [{ id: 'cat-1', name_he: 'ריהוט', icon: '🛋️', is_active: true }],
    isLoading: false,
  }),
}))

const mockCreateMutate = jest.fn(
  (_variables: unknown, callbacks?: { onSuccess?: () => void; onError?: () => void }) => {
    callbacks?.onSuccess?.()
  }
)
jest.mock('@/features/installments/hooks/useCreateInstallmentPlan', () => ({
  useCreateInstallmentPlan: () => ({ mutate: mockCreateMutate, isPending: false, isError: false }),
}))

const mockUseInstallmentPlans = jest.fn()
jest.mock('@/features/installments/hooks/useInstallmentPlans', () => ({
  useInstallmentPlans: () => mockUseInstallmentPlans(),
}))

const mockUseInstallmentMaterializedCounts = jest.fn()
jest.mock('@/features/installments/hooks/useInstallmentMaterializedCounts', () => ({
  useInstallmentMaterializedCounts: () => mockUseInstallmentMaterializedCounts(),
}))

// Desktop Claude Design pass: the billing-cycle cards read from this same
// hook's credit_card_cycle entries — empty by default so every existing
// test below (none of which cares about the cards) renders that section
// as a no-op.
const mockUseUpcomingCommitments = jest.fn(() => ({ commitments: [] as unknown[], isLoading: false, hasPartialError: false }))
jest.mock('@/features/cashflow/hooks/useUpcomingCommitments', () => ({
  useUpcomingCommitments: () => mockUseUpcomingCommitments(),
}))

const PLANS = [
  {
    id: 'plan-1',
    household_id: 'household-1',
    account_id: 'acc-cc',
    category_id: 'cat-1',
    merchant_name: 'איקאה',
    description: 'ספה חדשה',
    total_agorot: 300000,
    installment_count: 3,
    monthly_agorot: 100000,
    first_charge_date: '2026-08-10',
    is_shared: true,
    created_by: 'user-1',
    version: 1,
  },
]

describe('Installments list', () => {
  beforeEach(() => {
    mockCreateMutate.mockClear()
    mockUseInstallmentPlans.mockReturnValue({ plans: PLANS, isLoading: false, error: null })
    mockUseInstallmentMaterializedCounts.mockReturnValue({ materializedCounts: { 'plan-1': 1 } })
    mockUseAccounts.mockReturnValue({
      accounts: [
        { id: 'acc-cc', name: 'ויזה כאל', type: 'credit_card', is_active: true, billing_cycle_day: null },
        { id: 'acc-checking', name: 'עו״ש', type: 'checking', is_active: true, billing_cycle_day: null },
      ],
      isLoading: false,
    })
  })

  it('lists plans with what is left to pay and how many instalments remain', async () => {
    const { getAllByLabelText, getByText } = await render(<Installments />)

    expect(getByText('ספה חדשה')).toBeTruthy()
    // The row and its pill track both announce the count — the track is a
    // picture, so the number has to be said in words somewhere.
    expect(getAllByLabelText(/שולמו 1 מתוך 3 תשלומים/).length).toBeGreaterThanOrEqual(1)
    // remaining = 300000 - 100000*1 = 200000 agorot = ₪2,000.00, in the
    // list head's own total.
    expect(getByText(/2,000/)).toBeTruthy()
  })

  it('shows an error message instead of the list when useInstallmentPlans errors', async () => {
    mockUseInstallmentPlans.mockReturnValue({ plans: [], isLoading: false, error: new Error('network error') })

    const { getByText, queryByText } = await render(<Installments />)

    expect(getByText('משהו השתבש. נסו שוב')).toBeTruthy()
    expect(queryByText('עדיין אין רכישות בתשלומים.')).toBeNull()
  })

  it('shows an empty state when there are no plans', async () => {
    mockUseInstallmentPlans.mockReturnValue({ plans: [], isLoading: false, error: null })
    mockUseInstallmentMaterializedCounts.mockReturnValue({ materializedCounts: {} })

    const { getByText } = await render(<Installments />)
    expect(getByText('עדיין אין רכישות בתשלומים.')).toBeTruthy()
  })

  it('validates a missing description before creating', async () => {
    mockUseInstallmentPlans.mockReturnValue({ plans: [], isLoading: false, error: null })
    const { getByText } = await render(<Installments />)

    await fireEvent.press(getByText('הוספת רכישה בתשלומים'))
    await fireEvent.press(getByText('הוספת רכישה'))

    expect(getByText('יש להזין תיאור לרכישה')).toBeTruthy()
    expect(mockCreateMutate).not.toHaveBeenCalled()
  })

  it('validates a missing account before creating', async () => {
    mockUseInstallmentPlans.mockReturnValue({ plans: [], isLoading: false, error: null })
    const { getByText, getByLabelText } = await render(<Installments />)

    await fireEvent.press(getByText('הוספת רכישה בתשלומים'))
    await fireEvent.changeText(getByLabelText('תיאור הרכישה'), 'מקרר חדש')
    await fireEvent.press(getByText('הוספת רכישה'))

    expect(getByText('יש לבחור חשבון כרטיס אשראי')).toBeTruthy()
    expect(mockCreateMutate).not.toHaveBeenCalled()
  })

  it('validates a non-positive total amount before creating', async () => {
    mockUseInstallmentPlans.mockReturnValue({ plans: [], isLoading: false, error: null })
    const { getByText, getByLabelText } = await render(<Installments />)

    await fireEvent.press(getByText('הוספת רכישה בתשלומים'))
    await fireEvent.changeText(getByLabelText('תיאור הרכישה'), 'מקרר חדש')
    await fireEvent.press(getByLabelText('חשבון'))
    await fireEvent.press(getByText('ויזה כאל'))
    await fireEvent.changeText(getByLabelText('סכום כולל'), '0')
    await fireEvent.changeText(getByLabelText('מספר תשלומים'), '3')
    await fireEvent.press(getByText('הוספת רכישה'))

    expect(mockCreateMutate).not.toHaveBeenCalled()
  })

  it('validates an invalid installment count before creating', async () => {
    mockUseInstallmentPlans.mockReturnValue({ plans: [], isLoading: false, error: null })
    const { getByText, getByLabelText } = await render(<Installments />)

    await fireEvent.press(getByText('הוספת רכישה בתשלומים'))
    await fireEvent.changeText(getByLabelText('תיאור הרכישה'), 'מקרר חדש')
    await fireEvent.press(getByLabelText('חשבון'))
    await fireEvent.press(getByText('ויזה כאל'))
    await fireEvent.changeText(getByLabelText('סכום כולל'), '3000')
    await fireEvent.changeText(getByLabelText('מספר תשלומים'), '0')
    await fireEvent.press(getByText('הוספת רכישה'))

    expect(mockCreateMutate).not.toHaveBeenCalled()
  })

  it('creates a plan with the entered fields, restricting the account picker to credit-card accounts only', async () => {
    mockUseInstallmentPlans.mockReturnValue({ plans: [], isLoading: false, error: null })
    const { getByText, getByLabelText, queryByText } = await render(<Installments />)

    await fireEvent.press(getByText('הוספת רכישה בתשלומים'))
    await fireEvent.changeText(getByLabelText('תיאור הרכישה'), 'מקרר חדש')
    await fireEvent.press(getByLabelText('חשבון'))
    expect(getByText('ויזה כאל')).toBeTruthy()
    expect(queryByText('עו״ש')).toBeNull()
    await fireEvent.press(getByText('ויזה כאל'))
    await fireEvent.changeText(getByLabelText('סכום כולל'), '3000')
    await fireEvent.changeText(getByLabelText('מספר תשלומים'), '3')
    await fireEvent.press(getByText('הוספת רכישה'))

    expect(mockCreateMutate).toHaveBeenCalledTimes(1)
    const [variables] = mockCreateMutate.mock.calls[0] as [
      { description: string; accountId: string; totalAgorot: number; installmentCount: number },
    ]
    expect(variables.description).toBe('מקרר חדש')
    expect(variables.accountId).toBe('acc-cc')
    expect(variables.totalAgorot).toBe(300000)
    expect(variables.installmentCount).toBe(3)
  })

  // mobile-expo-reviewer finding: a household with zero active credit-card
  // accounts (or the accounts query still resolving, since useAccounts
  // defaults to an empty array until it settles) hit a dead end — the form
  // rendered only an error message with no way back, leaving isAdding stuck
  // true forever.
  it('offers a way back out of the add form when there are no credit-card accounts to choose from', async () => {
    mockUseInstallmentPlans.mockReturnValue({ plans: [], isLoading: false, error: null })
    mockUseAccounts.mockReturnValue({
      accounts: [{ id: 'acc-checking', name: 'עו״ש', type: 'checking', is_active: true, billing_cycle_day: null }],
      isLoading: false,
    })
    const { getByText, queryByText } = await render(<Installments />)

    await fireEvent.press(getByText('הוספת רכישה בתשלומים'))
    expect(getByText('כדי להוסיף רכישה בתשלומים יש קודם להוסיף חשבון כרטיס אשראי')).toBeTruthy()

    await fireEvent.press(getByText('ביטול'))

    expect(queryByText('כדי להוסיף רכישה בתשלומים יש קודם להוסיף חשבון כרטיס אשראי')).toBeNull()
    expect(getByText('הוספת רכישה בתשלומים')).toBeTruthy()
  })
})

// Desktop Claude Design pass: the billing-cycle cards, built from
// useUpcomingCommitments' own credit_card_cycle entries plus the account's
// own billing_cycle_day (for the countdown ring's cycle range) — no new
// query of their own.
describe('Installments — desktop billing-cycle cards', () => {
  beforeEach(() => {
    mockUseInstallmentPlans.mockReturnValue({ plans: [], isLoading: false, error: null })
    mockUseInstallmentMaterializedCounts.mockReturnValue({ materializedCounts: {} })
    mockUseAccounts.mockReturnValue({
      accounts: [{ id: 'acc-cc', name: 'ויזה כאל', type: 'credit_card', is_active: true, billing_cycle_day: 10 }],
      isLoading: false,
    })
    mockUseUpcomingCommitments.mockReturnValue({ commitments: [], isLoading: false, hasPartialError: false })
  })

  it('shows a card for a credit-card account with an open, spent-on cycle', async () => {
    mockUseUpcomingCommitments.mockReturnValue({
      commitments: [
        {
          id: 'credit_card_cycle:acc-cc',
          source: 'credit_card_cycle',
          sourceId: 'acc-cc',
          description: 'ויזה כאל',
          amountAgorot: 841260,
          sharedAgorot: 841260,
          personalAgorot: 0,
          date: getCurrentBillingCycleRange(10, localDateString()).end,
          categoryId: null,
          accountId: 'acc-cc',
        },
      ],
      isLoading: false,
      hasPartialError: false,
    })

    const { getByText, getAllByText } = await render(<Installments />)

    const range = getCurrentBillingCycleRange(10, localDateString())
    expect(getAllByText('ויזה כאל').length).toBeGreaterThanOrEqual(1)
    expect(getByText(`${i18n.t('installments.cycleCards.nextCharge')} · ${formatDateDisplay(range.end)}`)).toBeTruthy()
    // Twice now: the cycle total, and the "regular spend" legend line
    // beneath the split bar — this card has no instalment charges in it, so
    // the whole cycle is regular spending and the two figures agree.
    expect(getAllByText(formatILS(841260)).length).toBeGreaterThanOrEqual(1)
    expect(
      getByText(i18n.t('installments.cycleCards.range', { start: formatDateDisplay(range.start), end: formatDateDisplay(range.end) }))
    ).toBeTruthy()
  })

  it('shows no billing-cycle cards when no card has spend in its current cycle', async () => {
    const { queryByText } = await render(<Installments />)

    expect(queryByText(new RegExp(i18n.t('installments.cycleCards.nextCharge')))).toBeNull()
  })

  // The desktop title moved to the shell bar (components/ui/DesktopTopBar),
  // which titles itself from the route segment and is covered by that
  // component's own tests. The screen keeps only its mobile header, and the
  // phone frame titles it the way its nav destination does — the
  // billing-cycle cards are half of what this screen shows, so the narrower
  // "רכישות בתשלומים" undersold it.
  it('keeps its mobile header, titled as the frame titles it', async () => {
    const { getByText } = await render(<Installments />)
    expect(getByText(i18n.t('nav.creditAndPayments'))).toBeTruthy()
  })
})
