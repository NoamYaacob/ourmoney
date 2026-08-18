import { beforeEach, describe, expect, it, jest } from '@jest/globals'
import { fireEvent, render } from '@testing-library/react-native'
import '@/i18n'
import Obligations from './index'

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
jest.mock('@/features/categories/hooks/useCategories', () => ({
  useCategories: () => ({
    categories: [{ id: 'cat-1', name_he: 'ביטוח', icon: '🚗', is_active: true }],
    isLoading: false,
  }),
}))

const mockCreateMutate = jest.fn(
  (_variables: unknown, callbacks?: { onSuccess?: () => void; onError?: () => void }) => {
    callbacks?.onSuccess?.()
  }
)
jest.mock('@/features/obligations/hooks/useCreatePlannedObligation', () => ({
  useCreatePlannedObligation: () => ({ mutate: mockCreateMutate, isPending: false, isError: false }),
}))

const mockUsePlannedObligations = jest.fn()
jest.mock('@/features/obligations/hooks/usePlannedObligations', () => ({
  usePlannedObligations: () => mockUsePlannedObligations(),
}))

const OBLIGATIONS = [
  {
    id: 'ob-2',
    household_id: 'household-1',
    name: 'טסט לרכב',
    amount_agorot: 135000,
    due_date: '2027-02-03',
    category_id: null,
    account_id: null,
    is_shared: true,
    notes: null,
    status: 'upcoming',
    created_by: 'user-1',
  },
  {
    id: 'ob-1',
    household_id: 'household-1',
    name: 'ארנונה',
    amount_agorot: 180000,
    due_date: '2026-09-10',
    category_id: 'cat-1',
    account_id: null,
    is_shared: true,
    notes: null,
    status: 'upcoming',
    created_by: 'user-1',
  },
  {
    id: 'ob-3',
    household_id: 'household-1',
    name: 'התחייבות ששולמה',
    amount_agorot: 50000,
    due_date: '2026-01-01',
    category_id: null,
    account_id: null,
    is_shared: true,
    notes: null,
    status: 'completed',
    created_by: 'user-1',
  },
]

describe('Obligations list', () => {
  beforeEach(() => {
    mockCreateMutate.mockClear()
    mockUsePlannedObligations.mockReturnValue({ obligations: OBLIGATIONS, isLoading: false, error: null })
  })

  it('lists upcoming obligations sorted by nearest due date first, excluding completed ones', async () => {
    const { getByText, queryByText } = await render(<Obligations />)

    const arnona = getByText('ארנונה')
    const test = getByText('טסט לרכב')
    // ארנונה (2026-09-10) is nearer than טסט לרכב (2027-02-03) — its row
    // must appear first in the tree (RTL top-to-bottom reading order).
    expect(arnona).toBeTruthy()
    expect(test).toBeTruthy()
    expect(queryByText('התחייבות ששולמה')).toBeNull()
  })

  // UX-completeness audit P1 fix: completed/cancelled obligations vanished
  // from this screen entirely with no way to look them up again — no way
  // to confirm a mark-paid/cancel action actually took effect.
  it('keeps completed/cancelled obligations out of view until the history toggle is pressed, then shows them most-recent first', async () => {
    const { getByText, queryByText } = await render(<Obligations />)

    expect(queryByText('התחייבות ששולמה')).toBeNull()

    await fireEvent.press(getByText('היסטוריית התחייבויות'))

    expect(getByText('התחייבות ששולמה')).toBeTruthy()
  })

  it('hides the history toggle entirely when there is no completed/cancelled history', async () => {
    mockUsePlannedObligations.mockReturnValue({ obligations: [OBLIGATIONS[0], OBLIGATIONS[1]], isLoading: false, error: null })
    const { queryByText } = await render(<Obligations />)

    expect(queryByText('היסטוריית התחייבויות')).toBeNull()
  })

  it('toggles the history section closed again on a second press', async () => {
    const { getByText, queryByText } = await render(<Obligations />)

    await fireEvent.press(getByText('היסטוריית התחייבויות'))
    expect(getByText('התחייבות ששולמה')).toBeTruthy()

    await fireEvent.press(getByText('הסתרת היסטוריה'))
    expect(queryByText('התחייבות ששולמה')).toBeNull()
  })

  // UX-completeness audit P2 fix: obligations was the one list among
  // accounts/recurring/goals/obligations that never got the shared
  // 2-column desktop grid treatment.
  it('reverses the desktop 2-column obligations grid so the first (nearest-due) item renders on the right', async () => {
    const { getByText } = await render(<Obligations />)

    let node = getByText('ארנונה').parent
    while (node && !(node.props.className as string | undefined)?.includes('w-[48%]')) {
      node = node.parent
    }
    const gridContainer = node?.parent
    expect(gridContainer?.props.className as string).toContain('web:desktop:flex-row-reverse')
  })

  it('shows an empty state when there are no upcoming obligations', async () => {
    mockUsePlannedObligations.mockReturnValue({
      obligations: [{ ...OBLIGATIONS[2] }],
      isLoading: false,
      error: null,
    })

    const { getByText } = await render(<Obligations />)
    expect(getByText('עדיין אין התחייבויות מתוכננות.')).toBeTruthy()
  })

  it('marks a past-due obligation distinctly', async () => {
    mockUsePlannedObligations.mockReturnValue({
      obligations: [{ ...OBLIGATIONS[1], due_date: '2020-01-01' }],
      isLoading: false,
      error: null,
    })

    const { getByText } = await render(<Obligations />)
    expect(getByText(/באיחור/)).toBeTruthy()
  })

  it('validates a missing name before creating', async () => {
    mockUsePlannedObligations.mockReturnValue({ obligations: [], isLoading: false, error: null })
    const { getByText } = await render(<Obligations />)

    await fireEvent.press(getByText('הוספת התחייבות'))
    await fireEvent.press(getByText('הוספת התחייבות'))

    expect(getByText('יש להזין שם להתחייבות')).toBeTruthy()
    expect(mockCreateMutate).not.toHaveBeenCalled()
  })

  it('validates a non-positive amount before creating', async () => {
    mockUsePlannedObligations.mockReturnValue({ obligations: [], isLoading: false, error: null })
    const { getByText, getByLabelText } = await render(<Obligations />)

    await fireEvent.press(getByText('הוספת התחייבות'))
    await fireEvent.changeText(getByLabelText('שם ההתחייבות'), 'ביטוח רכב')
    await fireEvent.changeText(getByLabelText('סכום'), '0')
    await fireEvent.press(getByText('הוספת התחייבות'))

    expect(mockCreateMutate).not.toHaveBeenCalled()
  })

  it('creates a shared obligation with the entered fields, defaulting to no category/account when not chosen', async () => {
    mockUsePlannedObligations.mockReturnValue({ obligations: [], isLoading: false, error: null })
    const { getByText, getByLabelText } = await render(<Obligations />)

    await fireEvent.press(getByText('הוספת התחייבות'))
    await fireEvent.changeText(getByLabelText('שם ההתחייבות'), 'ביטוח רכב')
    await fireEvent.changeText(getByLabelText('סכום'), '4200')
    await fireEvent.press(getByText('הוספת התחייבות'))

    expect(mockCreateMutate).toHaveBeenCalledTimes(1)
    const [variables] = mockCreateMutate.mock.calls[0] as [
      { name: string; amountAgorot: number; categoryId: string | null; accountId: string | null; isShared: boolean },
    ]
    expect(variables.name).toBe('ביטוח רכב')
    expect(variables.amountAgorot).toBe(420000)
    expect(variables.categoryId).toBeNull()
    expect(variables.accountId).toBeNull()
    expect(variables.isShared).toBe(true)
  })

  it('creates a personal obligation when the personal chip is selected', async () => {
    mockUsePlannedObligations.mockReturnValue({ obligations: [], isLoading: false, error: null })
    const { getByText, getByLabelText } = await render(<Obligations />)

    await fireEvent.press(getByText('הוספת התחייבות'))
    await fireEvent.changeText(getByLabelText('שם ההתחייבות'), 'טיפול לרכב')
    await fireEvent.changeText(getByLabelText('סכום'), '600')
    await fireEvent.press(getByText('אישית'))
    await fireEvent.press(getByText('הוספת התחייבות'))

    expect(mockCreateMutate).toHaveBeenCalledTimes(1)
    const [variables] = mockCreateMutate.mock.calls[0] as [{ isShared: boolean }]
    expect(variables.isShared).toBe(false)
  })
})
