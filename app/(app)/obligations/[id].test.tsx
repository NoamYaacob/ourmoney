import { beforeEach, describe, expect, it, jest } from '@jest/globals'
import { fireEvent, render } from '@testing-library/react-native'
import '@/i18n'
import ObligationDetail from './[id]'

const mockBack = jest.fn()
let mockId = 'ob-1'
jest.mock('expo-router', () => ({
  useRouter: () => ({ back: () => mockBack() }),
  useLocalSearchParams: () => ({ id: mockId }),
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

const mockUpdateMutate = jest.fn(
  (_variables: unknown, callbacks?: { onSuccess?: () => void; onError?: () => void }) => {
    callbacks?.onSuccess?.()
  }
)
jest.mock('@/features/obligations/hooks/useUpdatePlannedObligation', () => ({
  useUpdatePlannedObligation: () => ({ mutate: mockUpdateMutate, isPending: false, isError: false }),
}))

const mockDeleteMutate = jest.fn(
  (_id: string, callbacks?: { onSuccess?: () => void; onError?: () => void }) => {
    callbacks?.onSuccess?.()
  }
)
jest.mock('@/features/obligations/hooks/useDeletePlannedObligation', () => ({
  useDeletePlannedObligation: () => ({ mutate: mockDeleteMutate, isPending: false }),
}))

let mockObligations: Record<string, unknown>[] = []
jest.mock('@/features/obligations/hooks/usePlannedObligations', () => ({
  usePlannedObligations: () => ({ obligations: mockObligations, isLoading: false }),
}))

const UPCOMING_OBLIGATION = {
  id: 'ob-1',
  household_id: 'household-1',
  name: 'ארנונה',
  amount_agorot: 180000,
  due_date: '2026-09-10',
  category_id: null,
  account_id: null,
  is_shared: true,
  notes: null,
  status: 'upcoming',
  created_by: 'user-1',
}

describe('Obligation detail', () => {
  beforeEach(() => {
    mockId = 'ob-1'
    mockObligations = [UPCOMING_OBLIGATION]
    mockUpdateMutate.mockClear()
    mockDeleteMutate.mockClear()
    mockBack.mockClear()
  })

  it('shows a not-found state for an unknown id', async () => {
    mockId = 'does-not-exist'
    const { getByText } = await render(<ObligationDetail />)
    expect(getByText('ההתחייבות לא נמצאה')).toBeTruthy()
  })

  it('edits the obligation without duplicating it — a single update call, not a create', async () => {
    const { getByText, getByLabelText } = await render(<ObligationDetail />)

    await fireEvent.press(getByText('עריכה'))
    await fireEvent.changeText(getByLabelText('שם ההתחייבות'), 'ארנונה מעודכנת')
    await fireEvent.press(getByText('שמירה'))

    expect(mockUpdateMutate).toHaveBeenCalledTimes(1)
    const [variables] = mockUpdateMutate.mock.calls[0] as [{ id: string; name: string }]
    expect(variables.id).toBe('ob-1')
    expect(variables.name).toBe('ארנונה מעודכנת')
  })

  it('marks the obligation as paid, setting status to completed', async () => {
    const { getByText } = await render(<ObligationDetail />)

    await fireEvent.press(getByText('סימון כשולם'))

    expect(mockUpdateMutate).toHaveBeenCalledWith(
      { id: 'ob-1', status: 'completed' },
      expect.anything()
    )
  })

  it('cancels the obligation, setting status to cancelled', async () => {
    const { getByText } = await render(<ObligationDetail />)

    await fireEvent.press(getByText('ביטול ההתחייבות'))

    expect(mockUpdateMutate).toHaveBeenCalledWith(
      { id: 'ob-1', status: 'cancelled' },
      expect.anything()
    )
  })

  it('hides mark-paid and cancel actions once the obligation is already completed', async () => {
    mockObligations = [{ ...UPCOMING_OBLIGATION, status: 'completed' }]
    const { queryByText } = await render(<ObligationDetail />)

    expect(queryByText('סימון כשולם')).toBeNull()
    expect(queryByText('ביטול ההתחייבות')).toBeNull()
  })

  it('deletes the obligation after confirming, then navigates back', async () => {
    const { getByText, getAllByText } = await render(<ObligationDetail />)

    await fireEvent.press(getByText('מחיקה'))
    // The confirm modal's own confirm button shares the same label as the
    // trigger that opened it — both are mounted at once once the modal is
    // visible, so press the last "מחיקה" node (the modal's confirm button).
    const deleteButtons = getAllByText('מחיקה')
    await fireEvent.press(deleteButtons[deleteButtons.length - 1]!)

    expect(mockDeleteMutate).toHaveBeenCalledWith('ob-1', expect.anything())
    expect(mockBack).toHaveBeenCalled()
  })
})
