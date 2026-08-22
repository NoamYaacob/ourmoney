import { beforeEach, describe, expect, it, jest } from '@jest/globals'
import { fireEvent, render } from '@testing-library/react-native'
import '@/i18n'
import Installments from './index'

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
    { id: 'acc-cc', name: 'ויזה כאל', type: 'credit_card', is_active: true },
    { id: 'acc-checking', name: 'עו״ש', type: 'checking', is_active: true },
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
        { id: 'acc-cc', name: 'ויזה כאל', type: 'credit_card', is_active: true },
        { id: 'acc-checking', name: 'עו״ש', type: 'checking', is_active: true },
      ],
      isLoading: false,
    })
  })

  it('lists plans with remaining balance and installment progress', async () => {
    const { getByText } = await render(<Installments />)

    expect(getByText('ספה חדשה')).toBeTruthy()
    expect(getByText('שולמו 1 מתוך 3 תשלומים')).toBeTruthy()
    // remaining = 300000 - 100000*1 = 200000 agorot = ₪2,000.00
    expect(getByText(/2,000/)).toBeTruthy()
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
      accounts: [{ id: 'acc-checking', name: 'עו״ש', type: 'checking', is_active: true }],
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
