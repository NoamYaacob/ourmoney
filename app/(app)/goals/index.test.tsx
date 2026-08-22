// Desktop/RTL polish pass (real-browser regression): the 2-column wrap
// grid declared plain flex-row (not flex-row-reverse), which native
// auto-mirrors via Yoga under the forced-RTL flag but NativeWind's
// web-compiled CSS does not — the first goal (source order) must render
// top-right, continuing the RTL reading order into the wrap. First test
// coverage for this screen.
import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals'
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
    mockUseSavingsGoals.mockReturnValue({ goals: [], isLoading: false, error: null })

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
    mockUseSavingsGoals.mockReturnValue({ goals: [], isLoading: false, error: null })

    const { getByText, getByLabelText, getByPlaceholderText } = await render(<Goals />)

    await fireEvent.press(getByText('הוספת יעד חיסכון'))
    await fireEvent.changeText(getByPlaceholderText('לדוגמה: חופשה משפחתית'), 'טיול')
    await fireEvent.changeText(getByLabelText('סכום יעד'), '1000')
    await fireEvent.press(getByText('הוספת יעד'))

    expect(mockCreateGoalMutate).toHaveBeenCalledWith(expect.objectContaining({ targetDate: null }), expect.anything())
  })

  it('reverses the desktop 2-column goals grid so the first goal renders on the right', async () => {
    mockUseSavingsGoals.mockReturnValue({ goals: GOALS, isLoading: false, error: null })

    const { getByText } = await render(<Goals />)

    let node = getByText('קרן חירום').parent
    while (node && !(node.props.className as string | undefined)?.includes('w-[48%]')) {
      node = node.parent
    }
    const gridContainer = node?.parent
    expect(gridContainer?.props.className as string).toContain('web:desktop:flex-row')
  })
})

describe('Goals list — behind-schedule badge', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    // Fixed "today," independent of the real calendar — every target_date
    // below is set relative to this literal, not to whatever day the suite
    // actually runs on.
    jest.useFakeTimers({ advanceTimers: false }).setSystemTime(new Date(2026, 7, 22))
  })

  afterEach(() => {
    jest.useRealTimers()
  })

  it('shows an overdue badge for an incomplete goal whose target date has already passed', async () => {
    mockUseSavingsGoals.mockReturnValue({
      goals: [{ ...GOALS[0], target_date: '2026-08-01' }],
      isLoading: false,
      error: null,
    })

    const { getByText } = await render(<Goals />)
    expect(getByText('עבר התאריך היעד')).toBeTruthy()
  })

  it('shows no badge for an incomplete goal with a future target date', async () => {
    mockUseSavingsGoals.mockReturnValue({
      goals: [{ ...GOALS[0], target_date: '2026-12-01' }],
      isLoading: false,
      error: null,
    })

    const { queryByText } = await render(<Goals />)
    expect(queryByText('עבר התאריך היעד')).toBeNull()
    expect(queryByText('מפגר בקצב')).toBeNull()
  })

  it('shows no badge for a goal with no target date at all', async () => {
    mockUseSavingsGoals.mockReturnValue({
      goals: [{ ...GOALS[0], target_date: null }],
      isLoading: false,
      error: null,
    })

    const { queryByText } = await render(<Goals />)
    expect(queryByText('עבר התאריך היעד')).toBeNull()
  })

  it('prefers the completed badge over a behind-schedule badge for a completed goal, even with an overdue target date', async () => {
    mockUseSavingsGoals.mockReturnValue({
      goals: [{ ...GOALS[0], is_completed: true, current_agorot: 500000, target_date: '2020-01-01' }],
      isLoading: false,
      error: null,
    })

    const { getByText, queryByText } = await render(<Goals />)
    expect(getByText('היעד הושג! 🎉')).toBeTruthy()
    expect(queryByText('עבר התאריך היעד')).toBeNull()
  })
})
