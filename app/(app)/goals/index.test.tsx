// Desktop/RTL polish pass (real-browser regression): the 2-column wrap
// grid declared plain flex-row (not flex-row-reverse), which native
// auto-mirrors via Yoga under the forced-RTL flag but NativeWind's
// web-compiled CSS does not — the first goal (source order) must render
// top-right, continuing the RTL reading order into the wrap. First test
// coverage for this screen.
import { beforeEach, describe, expect, it, jest } from '@jest/globals'
import { fireEvent, render } from '@testing-library/react-native'
import '@/i18n'
import Goals from './index'

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
jest.mock('@/features/accounts/hooks/useAccounts', () => ({
  useAccounts: () => ({ accounts: [{ id: 'acc-1', name: 'עו״ש', type: 'checking' }], isLoading: false }),
}))
jest.mock('@/features/accounts/hooks/useAccountBalances', () => ({
  useAccountBalances: () => ({ balances: {}, isLoading: false }),
}))
const mockCreateGoalMutate = jest.fn(
  (_variables: unknown, callbacks?: { onSuccess?: () => void; onError?: (error: unknown) => void }) => {
    callbacks?.onSuccess?.()
  }
)
jest.mock('@/features/savings/hooks/useCreateSavingsGoal', () => ({
  useCreateSavingsGoal: () => ({ mutate: mockCreateGoalMutate, isPending: false, isError: false }),
}))

const GOALS = [
  {
    id: 'goal-1',
    name: 'קרן חירום',
    current_agorot: 100000,
    target_agorot: 500000,
    is_completed: false,
    progress_source: 'manual',
    account_id: null,
  },
  {
    id: 'goal-2',
    name: 'חופשה',
    current_agorot: 20000,
    target_agorot: 300000,
    is_completed: false,
    progress_source: 'manual',
    account_id: null,
  },
]
const mockUseSavingsGoals = jest.fn()
jest.mock('@/features/savings/hooks/useSavingsGoals', () => ({
  useSavingsGoals: () => mockUseSavingsGoals(),
}))

describe('Goals list', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  // UX-completeness audit P1 fix: account_id/target_date were writable by
  // useCreateSavingsGoal but there was no UI field for either.
  it('lets the create form set an account and an optional target date, sending both on create', async () => {
    mockUseSavingsGoals.mockReturnValue({ goals: [], isLoading: false, error: null, hasData: true })

    const { getByText, getByLabelText, getByPlaceholderText } = await render(<Goals />)

    await fireEvent.press(getByText('הוספת יעד חיסכון'))
    await fireEvent.changeText(getByPlaceholderText('לדוגמה: חופשה משפחתית'), 'טיול')
    await fireEvent.changeText(getByLabelText('סכום יעד'), '1000')
    await fireEvent.press(getByLabelText('חשבון מקושר (אופציונלי)'))
    await fireEvent.press(getByText('עו״ש'))
    await fireEvent.press(getByText('עם תאריך יעד'))
    await fireEvent.press(getByText('הוספת יעד'))

    expect(mockCreateGoalMutate).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'טיול', accountId: 'acc-1', targetDate: expect.any(String) }),
      expect.anything()
    )
  })

  it('defaults to no target date, sending targetDate: null on create', async () => {
    mockUseSavingsGoals.mockReturnValue({ goals: [], isLoading: false, error: null, hasData: true })

    const { getByText, getByLabelText, getByPlaceholderText } = await render(<Goals />)

    await fireEvent.press(getByText('הוספת יעד חיסכון'))
    await fireEvent.changeText(getByPlaceholderText('לדוגמה: חופשה משפחתית'), 'טיול')
    await fireEvent.changeText(getByLabelText('סכום יעד'), '1000')
    await fireEvent.press(getByText('הוספת יעד'))

    expect(mockCreateGoalMutate).toHaveBeenCalledWith(expect.objectContaining({ targetDate: null }), expect.anything())
  })

  // Part 4/21 of the product-quality audit: this form had no way back once
  // opened — every sibling add-form (Obligations, Recurring, Installments,
  // Accounts) pairs submit with a cancel that closes the form.
  it('offers a way to cancel out of the add form without creating anything', async () => {
    mockUseSavingsGoals.mockReturnValue({ goals: [], isLoading: false, error: null, hasData: true })

    const { getByText, getByPlaceholderText, queryByText } = await render(<Goals />)

    await fireEvent.press(getByText('הוספת יעד חיסכון'))
    await fireEvent.changeText(getByPlaceholderText('לדוגמה: חופשה משפחתית'), 'טיול')
    await fireEvent.press(getByText('ביטול'))

    expect(mockCreateGoalMutate).not.toHaveBeenCalled()
    expect(queryByText('ביטול')).toBeNull()
    expect(getByText('הוספת יעד חיסכון')).toBeTruthy()
  })

  // The 2-column grid is gone. Both frames draw one column of goal rows
  // inside a single card, each carrying the thing the grid never said: how
  // it is going. Every figure in that sentence comes from
  // calculateSavingsPace, which the screen already ran and then ignored.
  it('says how each goal is going, not just how full its bar is', async () => {
    mockUseSavingsGoals.mockReturnValue({ goals: GOALS, isLoading: false, error: null, hasData: true })

    const { getByText, getAllByText } = await render(<Goals />)

    expect(getByText('קרן חירום')).toBeTruthy()
    // A percent per goal, and a pace chip per goal.
    expect(getAllByText(/^\d+%$/).length).toBe(GOALS.length)
  })

  it('states plainly that a goal with no target date has no projection', async () => {
    // calculateSavingsPace returns null without a target date, and the row
    // must not invent one — "hide instead of inventing precision".
    const noDate = [{ ...GOALS[0], id: 'g-nodate', name: 'ללא תאריך', target_date: null }]
    mockUseSavingsGoals.mockReturnValue({ goals: noDate, isLoading: false, error: null, hasData: true })

    const { getByText } = await render(<Goals />)

    expect(getByText(/לא נקבע תאריך יעד/)).toBeTruthy()
  })
})
