// Regression test for a confirmed functional-completeness gap: the goal
// edit mutation (useUpdateSavingsGoal) existed and was fully implemented,
// but nothing in the app imported it — there was no edit UI anywhere under
// app/(app)/goals/. docs/PROJECT_SPEC.md explicitly lists "Add / edit goal
// form" under Goals. This proves:
//   1. the edit fields are reachable and prefilled with the goal's current
//      name/target amount as soon as the screen renders — no extra
//      "enter edit mode" step to find (mirrors the always-editable-fields
//      convention in app/(app)/transactions/[id].tsx)
//   2. saving calls useUpdateSavingsGoal's mutate with the edited
//      name/targetAgorot
// Also covers migration 009/ADR-036: every mutation carries expectedVersion,
// a conflict on the identity-edit save shows the shared ConflictModal and
// reload re-snapshots name/target from the fresh row without touching the
// separate progress-update form, and a conflict on the progress update uses
// the goal's live-rendered version (no separate edit session for it).
import { beforeEach, describe, expect, it, jest } from '@jest/globals'
import { fireEvent, render, waitFor } from '@testing-library/react-native'
import '@/i18n'
import { ConcurrencyError } from '@/lib/mutations/concurrencyError'
import GoalDetail from './[id]'

const mockBack = jest.fn()
jest.mock('expo-router', () => ({
  useRouter: () => ({ back: () => mockBack() }),
  useLocalSearchParams: () => ({ id: 'goal-1' }),
}))
// Avoids a deep, environment-specific import chain
// (@expo/vector-icons -> expo-font -> expo-asset) unrelated to what this
// test verifies — same rationale as other screen tests in this repo
// (components/ui/Select.tsx renders an Ionicons chevron).
jest.mock('@expo/vector-icons', () => ({
  Ionicons: () => null,
}))
jest.mock('@/features/auth/hooks/useAuth', () => ({
  useAuth: () => ({ user: { id: 'user-1' } }),
}))
jest.mock('@/features/household/hooks/useHousehold', () => ({
  useHousehold: () => ({ householdId: 'household-1', isLoading: false }),
}))

const BASE_GOAL = {
  id: 'goal-1',
  household_id: 'household-1',
  name: 'חופשה משפחתית',
  target_agorot: 500000,
  current_agorot: 100000,
  account_id: null,
  target_date: null,
  icon: null,
  color: null,
  is_completed: false,
  created_by: 'user-1',
  created_at: '2026-01-01T00:00:00Z',
  version: 1,
}
let mockGoal = { ...BASE_GOAL }
const mockRefetch = jest.fn(async () => ({ data: [mockGoal] }))
jest.mock('@/features/savings/hooks/useSavingsGoals', () => ({
  useSavingsGoals: () => ({ goals: [mockGoal], isLoading: false, refetch: mockRefetch }),
}))

const mockUpdateGoalMutate = jest.fn(
  (_variables: unknown, callbacks?: { onSuccess?: () => void; onError?: (error: unknown) => void }) => {
    callbacks?.onSuccess?.()
  }
)
jest.mock('@/features/savings/hooks/useUpdateSavingsGoal', () => ({
  useUpdateSavingsGoal: () => ({ mutate: mockUpdateGoalMutate, isPending: false, isError: false }),
}))

const mockUpdateProgressMutate = jest.fn(
  (_variables: unknown, callbacks?: { onSuccess?: () => void; onError?: (error: unknown) => void }) => {
    callbacks?.onSuccess?.()
  }
)
jest.mock('@/features/savings/hooks/useUpdateSavingsGoalProgress', () => ({
  useUpdateSavingsGoalProgress: () => ({ mutate: mockUpdateProgressMutate, isPending: false, isError: false }),
}))
const mockDeleteGoalMutate = jest.fn(
  (_variables: unknown, callbacks?: { onSuccess?: () => void; onError?: (error: unknown) => void }) => {
    callbacks?.onSuccess?.()
  }
)
jest.mock('@/features/savings/hooks/useDeleteSavingsGoal', () => ({
  useDeleteSavingsGoal: () => ({ mutate: mockDeleteGoalMutate, isPending: false }),
}))

describe('GoalDetail edit', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockBack.mockClear()
    mockGoal = { ...BASE_GOAL }
  })

  it('prefills the edit form with the goal current name/target', async () => {
    const { getByDisplayValue } = await render(<GoalDetail />)

    expect(getByDisplayValue('חופשה משפחתית')).toBeTruthy()
    expect(getByDisplayValue('5000')).toBeTruthy()
  })

  it('saves an edited name/target via useUpdateSavingsGoal, carrying the loaded version', async () => {
    const { getByDisplayValue, getByText } = await render(<GoalDetail />)

    const nameInput = getByDisplayValue('חופשה משפחתית')
    await fireEvent.changeText(nameInput, 'טיול לחו״ל')

    const targetInput = getByDisplayValue('5000')
    await fireEvent.changeText(targetInput, '8000')

    await fireEvent.press(getByText('שמירה'))

    expect(mockUpdateGoalMutate).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'goal-1',
        expectedVersion: 1,
        name: 'טיול לחו״ל',
        targetAgorot: 800000,
      }),
      expect.anything()
    )
  })

  it('updates progress via the live-rendered version, independent of the identity-edit snapshot', async () => {
    const { getByLabelText, getByText } = await render(<GoalDetail />)

    await fireEvent.changeText(getByLabelText('עדכון סכום נוכחי'), '2000')
    await fireEvent.press(getByText('עדכון'))

    expect(mockUpdateProgressMutate).toHaveBeenCalledWith(
      expect.objectContaining({ goalId: 'goal-1', expectedVersion: 1, currentAgorot: 200000 }),
      expect.anything()
    )
  })

  it('shows the conflict modal on a stale identity-edit save without touching the progress form', async () => {
    mockUpdateGoalMutate.mockImplementationOnce((_variables, callbacks) => {
      callbacks?.onError?.(new ConcurrencyError('conflict'))
    })
    const { getByText, getByLabelText } = await render(<GoalDetail />)

    await fireEvent.changeText(getByLabelText('עדכון סכום נוכחי'), '2000')
    await fireEvent.press(getByText('שמירה'))

    await waitFor(() => expect(getByText('כבר בוצע שינוי בפריט הזה ממכשיר או משתמש אחר.')).toBeTruthy())
    // The unrelated, still-unsaved progress input is untouched by the
    // identity-edit conflict.
    expect(getByLabelText('עדכון סכום נוכחי').props.value).toBe('2000')
  })

  it('reloading from an identity-edit conflict re-snapshots name/target from the fresh row', async () => {
    mockUpdateGoalMutate.mockImplementationOnce((_variables, callbacks) => {
      callbacks?.onError?.(new ConcurrencyError('conflict'))
    })
    // This screen's reload path re-syncs from the useSavingsGoals() list
    // hook's own reactive data after refetch() resolves (it does not use
    // refetch()'s return value directly, unlike the obligations/recurring
    // screens) — so the mock must actually update what that hook returns,
    // the same way a real refetch would update the TanStack Query cache.
    const freshGoal = { ...BASE_GOAL, name: 'יעד מהמכשיר האחר', version: 2 }
    mockRefetch.mockImplementationOnce(async () => {
      mockGoal = freshGoal
      return { data: [mockGoal] }
    })

    const { getByText, getByDisplayValue } = await render(<GoalDetail />)

    await fireEvent.press(getByText('שמירה'))

    await waitFor(() => expect(getByText('טען את הגרסה החדשה')).toBeTruthy())
    await fireEvent.press(getByText('טען את הגרסה החדשה'))

    await waitFor(() => expect(mockRefetch).toHaveBeenCalled())
    await waitFor(() => expect(getByDisplayValue('יעד מהמכשיר האחר')).toBeTruthy())
  })

  it('shows the conflict modal on a stale progress update', async () => {
    mockUpdateProgressMutate.mockImplementationOnce((_variables, callbacks) => {
      callbacks?.onError?.(new ConcurrencyError('conflict'))
    })
    const { getByLabelText, getByText } = await render(<GoalDetail />)

    await fireEvent.changeText(getByLabelText('עדכון סכום נוכחי'), '2000')
    await fireEvent.press(getByText('עדכון'))

    await waitFor(() => expect(getByText('כבר בוצע שינוי בפריט הזה ממכשיר או משתמש אחר.')).toBeTruthy())
  })

  // Regression test — qa-adversarial-reviewer finding (Concurrent Edit
  // Protection milestone): this screen's delete onError handler originally
  // had no `else` branch, so a delete_savings_goal failure that is neither
  // 'conflict' nor 'not_found' (e.g. 'not_a_member' when membership was
  // revoked mid-session, or 'unauthenticated' on an expired session) was
  // silently swallowed — the confirm dialog closed, no ConflictModal opened,
  // no ErrorMessage rendered, and the goal was left undeleted with zero
  // feedback. Fixed by adding a deleteError state + else branch, matching
  // the existing actionError pattern in obligations/[id].tsx and
  // recurring/[id].tsx.
  it('surfaces a non-concurrency delete failure instead of silently closing the confirm dialog', async () => {
    mockDeleteGoalMutate.mockImplementationOnce((_variables, callbacks) => {
      callbacks?.onError?.(new Error('not_a_member'))
    })
    const { getByText, getAllByText } = await render(<GoalDetail />)

    await fireEvent.press(getByText('מחיקה'))
    const deleteButtons = getAllByText('מחיקה')
    await fireEvent.press(deleteButtons[deleteButtons.length - 1]!)

    // The screen must not navigate back (the goal was not deleted) and must
    // show some error to the user rather than silently doing nothing.
    expect(mockBack).not.toHaveBeenCalled()
    await waitFor(() => expect(getByText('משהו השתבש. נסו שוב')).toBeTruthy())
  })
})
