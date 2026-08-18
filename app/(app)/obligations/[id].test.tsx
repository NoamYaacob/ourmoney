import { beforeEach, describe, expect, it, jest } from '@jest/globals'
import { fireEvent, render, waitFor } from '@testing-library/react-native'
import '@/i18n'
import { ConcurrencyError } from '@/lib/mutations/concurrencyError'
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
  (_variables: unknown, callbacks?: { onSuccess?: () => void; onError?: (error: unknown) => void }) => {
    callbacks?.onSuccess?.()
  }
)
jest.mock('@/features/obligations/hooks/useUpdatePlannedObligation', () => ({
  useUpdatePlannedObligation: () => ({ mutate: mockUpdateMutate, isPending: false, isError: false }),
}))

const mockSetStatusMutate = jest.fn(
  (_variables: unknown, callbacks?: { onSuccess?: () => void; onError?: (error: unknown) => void }) => {
    callbacks?.onSuccess?.()
  }
)
jest.mock('@/features/obligations/hooks/useSetPlannedObligationStatus', () => ({
  useSetPlannedObligationStatus: () => ({ mutate: mockSetStatusMutate, isPending: false }),
}))

const mockDeleteMutate = jest.fn(
  (_variables: unknown, callbacks?: { onSuccess?: () => void; onError?: (error: unknown) => void }) => {
    callbacks?.onSuccess?.()
  }
)
jest.mock('@/features/obligations/hooks/useDeletePlannedObligation', () => ({
  useDeletePlannedObligation: () => ({ mutate: mockDeleteMutate, isPending: false }),
}))

const mockRefetch = jest.fn(async () => ({ data: mockObligations }))
let mockObligations: Record<string, unknown>[] = []
jest.mock('@/features/obligations/hooks/usePlannedObligations', () => ({
  usePlannedObligations: () => ({ obligations: mockObligations, isLoading: false, refetch: mockRefetch }),
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
  version: 1,
}

describe('Obligation detail', () => {
  beforeEach(() => {
    mockId = 'ob-1'
    mockObligations = [UPCOMING_OBLIGATION]
    mockUpdateMutate.mockClear()
    mockSetStatusMutate.mockClear()
    mockDeleteMutate.mockClear()
    mockRefetch.mockClear()
    mockBack.mockClear()
  })

  it('shows a not-found state for an unknown id', async () => {
    mockId = 'does-not-exist'
    const { getByText } = await render(<ObligationDetail />)
    expect(getByText('ההתחייבות לא נמצאה')).toBeTruthy()
  })

  it('edits the obligation without duplicating it — a single update call carrying the loaded version', async () => {
    const { getByText, getByLabelText } = await render(<ObligationDetail />)

    await fireEvent.press(getByText('עריכה'))
    await fireEvent.changeText(getByLabelText('שם ההתחייבות'), 'ארנונה מעודכנת')
    await fireEvent.press(getByText('שמירה'))

    expect(mockUpdateMutate).toHaveBeenCalledTimes(1)
    const [variables] = mockUpdateMutate.mock.calls[0] as [{ id: string; name: string; expectedVersion: number }]
    expect(variables.id).toBe('ob-1')
    expect(variables.name).toBe('ארנונה מעודכנת')
    expect(variables.expectedVersion).toBe(1)
  })

  it('marks the obligation as paid via the narrow status RPC, sending the currently-rendered version, after confirming (UX-completeness audit fix: this was previously a single un-confirmed tap)', async () => {
    const { getByText, getAllByText } = await render(<ObligationDetail />)

    await fireEvent.press(getByText('סימון כשולם'))
    expect(mockSetStatusMutate).not.toHaveBeenCalled()
    const confirmButtons = getAllByText('סימון כשולם')
    await fireEvent.press(confirmButtons[confirmButtons.length - 1]!)

    expect(mockSetStatusMutate).toHaveBeenCalledWith(
      { id: 'ob-1', expectedVersion: 1, status: 'completed' },
      expect.anything()
    )
    expect(mockUpdateMutate).not.toHaveBeenCalled()
  })

  it('cancels the obligation via the narrow status RPC, sending the currently-rendered version, after confirming (UX-completeness audit fix)', async () => {
    const { getByText, getAllByText } = await render(<ObligationDetail />)

    await fireEvent.press(getByText('ביטול ההתחייבות'))
    expect(mockSetStatusMutate).not.toHaveBeenCalled()
    const confirmButtons = getAllByText('ביטול ההתחייבות')
    await fireEvent.press(confirmButtons[confirmButtons.length - 1]!)

    expect(mockSetStatusMutate).toHaveBeenCalledWith(
      { id: 'ob-1', expectedVersion: 1, status: 'cancelled' },
      expect.anything()
    )
  })

  it('hides mark-paid and cancel actions once the obligation is already completed', async () => {
    mockObligations = [{ ...UPCOMING_OBLIGATION, status: 'completed' }]
    const { queryByText } = await render(<ObligationDetail />)

    expect(queryByText('סימון כשולם')).toBeNull()
    expect(queryByText('ביטול ההתחייבות')).toBeNull()
  })

  it('deletes the obligation after confirming, sending the currently-rendered version, then navigates back', async () => {
    const { getByText, getAllByText } = await render(<ObligationDetail />)

    await fireEvent.press(getByText('מחיקה'))
    const deleteButtons = getAllByText('מחיקה')
    await fireEvent.press(deleteButtons[deleteButtons.length - 1]!)

    expect(mockDeleteMutate).toHaveBeenCalledWith({ id: 'ob-1', expectedVersion: 1 }, expect.anything())
    expect(mockBack).toHaveBeenCalled()
  })

  it('shows the conflict modal instead of a generic error when a save loses to a newer version, and does not silently overwrite the newer server data', async () => {
    mockUpdateMutate.mockImplementationOnce((_variables, callbacks) => {
      callbacks?.onError?.(new ConcurrencyError('conflict'))
    })
    const { getByText, queryByText } = await render(<ObligationDetail />)

    await fireEvent.press(getByText('עריכה'))
    await fireEvent.press(getByText('שמירה'))

    await waitFor(() => expect(getByText('כבר בוצע שינוי בפריט הזה ממכשיר או משתמש אחר.')).toBeTruthy())
    // No generic-error fallback text alongside the conflict-specific modal.
    expect(queryByText('משהו השתבש. נסו שוב')).toBeNull()
  })

  it('reloading from a conflict refetches and re-populates the edit form with the fresh server version', async () => {
    mockUpdateMutate.mockImplementationOnce((_variables, callbacks) => {
      callbacks?.onError?.(new ConcurrencyError('conflict'))
    })
    const freshObligation = { ...UPCOMING_OBLIGATION, name: 'ארנונה מהמכשיר האחר', version: 2 }
    mockRefetch.mockResolvedValueOnce({ data: [freshObligation] })

    const { getByText, getByLabelText, getByDisplayValue } = await render(<ObligationDetail />)

    await fireEvent.press(getByText('עריכה'))
    await fireEvent.changeText(getByLabelText('שם ההתחייבות'), 'הטיוטה שלי שלא נשמרה')
    await fireEvent.press(getByText('שמירה'))

    await waitFor(() => expect(getByText('טען את הגרסה החדשה')).toBeTruthy())
    await fireEvent.press(getByText('טען את הגרסה החדשה'))

    await waitFor(() => expect(mockRefetch).toHaveBeenCalled())
    // The form now reflects the freshly-reloaded server row, not the
    // discarded stale draft.
    await waitFor(() => expect(getByDisplayValue('ארנונה מהמכשיר האחר')).toBeTruthy())
  })

  it('shows the not-found variant of the conflict modal when the obligation was deleted elsewhere', async () => {
    mockSetStatusMutate.mockImplementationOnce((_variables, callbacks) => {
      callbacks?.onError?.(new ConcurrencyError('not_found'))
    })
    const { getByText, getAllByText } = await render(<ObligationDetail />)

    await fireEvent.press(getByText('סימון כשולם'))
    const confirmButtons = getAllByText('סימון כשולם')
    await fireEvent.press(confirmButtons[confirmButtons.length - 1]!)

    await waitFor(() => expect(getByText('הפריט הזה נמחק או שאינו זמין יותר.')).toBeTruthy())
  })
})
