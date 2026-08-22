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
import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals'
import { fireEvent, render, waitFor } from '@testing-library/react-native'
import '@/i18n'
import { ConcurrencyError } from '@/lib/mutations/concurrencyError'
import { formatILS } from '@/lib/money/format'
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
// The edit form now offers an account picker (UX-completeness audit
// finding: account_id/target_date were writable in the mutation hook but
// unreachable from any UI) — same mock shape as obligations/[id].test.tsx.
jest.mock('@/features/accounts/hooks/useAccounts', () => ({
  useAccounts: () => ({ accounts: [{ id: 'acc-1', name: 'עו״ש', type: 'checking' }], isLoading: false }),
}))
const mockAccountBalances: Record<string, number> = {}
jest.mock('@/features/accounts/hooks/useAccountBalances', () => ({
  useAccountBalances: () => ({ balances: mockAccountBalances, isLoading: false }),
}))

const BASE_GOAL = {
  id: 'goal-1',
  household_id: 'household-1',
  name: 'חופשה משפחתית',
  target_agorot: 500000,
  current_agorot: 100000,
  account_id: null as string | null,
  progress_source: 'manual' as 'manual' | 'linked_account',
  target_date: null as string | null,
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

// onSuccess is called with { version: expectedVersion + 1 } by default,
// mirroring a real successful CAS bump — the fix under test
// (onSuccess: (result) => setEditingVersion(result.version)) depends on the
// mutate callback actually receiving the new version, not just firing.
const mockUpdateGoalMutate = jest.fn(
  (
    variables: { expectedVersion: number },
    callbacks?: { onSuccess?: (result: { version: number }) => void; onError?: (error: unknown) => void }
  ) => {
    callbacks?.onSuccess?.({ version: variables.expectedVersion + 1 })
  }
)
jest.mock('@/features/savings/hooks/useUpdateSavingsGoal', () => ({
  useUpdateSavingsGoal: () => ({ mutate: mockUpdateGoalMutate, isPending: false, isError: false }),
}))

const mockUpdateProgressMutate = jest.fn(
  (
    variables: { expectedVersion: number },
    callbacks?: { onSuccess?: (result: { version: number }) => void; onError?: (error: unknown) => void }
  ) => {
    callbacks?.onSuccess?.({ version: variables.expectedVersion + 1 })
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
    for (const key of Object.keys(mockAccountBalances)) delete mockAccountBalances[key]
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
        progressSource: 'manual',
      }),
      expect.anything()
    )
  })

  // Foundation item — savings goal progress source (manual vs linked
  // account): explicit opt-in switch, default preserved for existing goals.
  it('defaults the progress-source toggle to manual and sends it unchanged on an uncontested save', async () => {
    const { getByText } = await render(<GoalDetail />)
    await fireEvent.press(getByText('שמירה'))
    expect(mockUpdateGoalMutate).toHaveBeenCalledWith(
      expect.objectContaining({ progressSource: 'manual' }),
      expect.anything()
    )
  })

  it('switching the toggle to linked-account and picking an account sends progressSource: linked_account', async () => {
    const { getByText, getByLabelText } = await render(<GoalDetail />)

    await fireEvent.press(getByLabelText('חשבון מקושר (אופציונלי)'))
    await fireEvent.press(getByText('עו״ש'))
    await fireEvent.press(getByText('לפי יתרת החשבון המקושר'))
    await fireEvent.press(getByText('שמירה'))

    expect(mockUpdateGoalMutate).toHaveBeenCalledWith(
      expect.objectContaining({ accountId: 'acc-1', progressSource: 'linked_account' }),
      expect.anything()
    )
  })

  it('hides the manual progress-update input and shows the linked-progress note for a linked_account goal', async () => {
    mockGoal = { ...BASE_GOAL, account_id: 'acc-1', progress_source: 'linked_account' }
    mockAccountBalances['acc-1'] = 150000
    const { getByText, queryByLabelText } = await render(<GoalDetail />)

    expect(queryByLabelText('עדכון סכום נוכחי')).toBeNull()
    expect(getByText('ההתקדמות מחושבת אוטומטית לפי יתרת החשבון המקושר')).toBeTruthy()
  })

  it('shows a specific error and does not save when linking an account already linked to another goal', async () => {
    mockUpdateGoalMutate.mockImplementationOnce((_variables, callbacks) => {
      callbacks?.onError?.(new Error('account_already_linked'))
    })
    const { getByText, getByLabelText } = await render(<GoalDetail />)

    await fireEvent.press(getByLabelText('חשבון מקושר (אופציונלי)'))
    await fireEvent.press(getByText('עו״ש'))
    await fireEvent.press(getByText('לפי יתרת החשבון המקושר'))
    await fireEvent.press(getByText('שמירה'))

    await waitFor(() =>
      expect(
        getByText('החשבון הזה כבר מקושר כמקור ההתקדמות של יעד אחר. אפשר לבחור חשבון אחר או להשאיר את היעד במעקב ידני.')
      ).toBeTruthy()
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

  // qa-adversarial-reviewer finding: a successful progress update never
  // advanced the pinned progressExpectedVersion — only a fresh goal load or
  // an explicit conflict-reload did. A second, entirely uncontested update
  // later in the same visit would then submit the now-stale pre-first-
  // update version and spuriously conflict against the server's own prior
  // write, even though nobody else touched the row.
  it('carries the just-updated version into a second, uncontested progress update in the same visit, not the stale pre-update version', async () => {
    const { getByLabelText, getByText } = await render(<GoalDetail />)

    await fireEvent.changeText(getByLabelText('עדכון סכום נוכחי'), '2000')
    await fireEvent.press(getByText('עדכון'))
    expect(mockUpdateProgressMutate).toHaveBeenLastCalledWith(
      expect.objectContaining({ expectedVersion: 1 }),
      expect.anything()
    )

    await fireEvent.changeText(getByLabelText('עדכון סכום נוכחי'), '3000')
    await fireEvent.press(getByText('עדכון'))
    expect(mockUpdateProgressMutate).toHaveBeenLastCalledWith(
      expect.objectContaining({ expectedVersion: 2, currentAgorot: 300000 }),
      expect.anything()
    )
  })

  // Same fix, identity-edit form.
  it('carries the just-saved version into a second, uncontested identity edit in the same visit, not the stale pre-save version', async () => {
    const { getByDisplayValue, getByText } = await render(<GoalDetail />)

    await fireEvent.changeText(getByDisplayValue('חופשה משפחתית'), 'טיול לחו״ל')
    await fireEvent.press(getByText('שמירה'))
    expect(mockUpdateGoalMutate).toHaveBeenLastCalledWith(expect.objectContaining({ expectedVersion: 1 }), expect.anything())

    await fireEvent.changeText(getByDisplayValue('טיול לחו״ל'), 'טיול לחו״ל 2')
    await fireEvent.press(getByText('שמירה'))
    expect(mockUpdateGoalMutate).toHaveBeenLastCalledWith(expect.objectContaining({ expectedVersion: 2 }), expect.anything())
  })

  // UX-completeness audit P1 fix: account_id/target_date were writable by
  // useUpdateSavingsGoal but there was no UI field for either — the create
  // form had the same gap, fixed alongside this one.
  it('lets the edit form set an account and an optional target date, sending both on save', async () => {
    mockGoal = { ...BASE_GOAL, account_id: null, target_date: null }
    const { getByText, getByLabelText } = await render(<GoalDetail />)

    await fireEvent.press(getByLabelText('חשבון מקושר (אופציונלי)'))
    await fireEvent.press(getByText('עו״ש'))
    await fireEvent.press(getByText('עם תאריך יעד'))
    await fireEvent.press(getByText('שמירה'))

    expect(mockUpdateGoalMutate).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'goal-1', accountId: 'acc-1', targetDate: expect.any(String) }),
      expect.anything()
    )
  })

  it('sends a null targetDate when the "no target date" toggle is left selected, even though a goal has a previously-set date', async () => {
    mockGoal = { ...BASE_GOAL, target_date: '2026-12-01' }
    const { getByText } = await render(<GoalDetail />)

    await fireEvent.press(getByText('ללא תאריך יעד'))
    await fireEvent.press(getByText('שמירה'))

    expect(mockUpdateGoalMutate).toHaveBeenCalledWith(expect.objectContaining({ targetDate: null }), expect.anything())
  })

  // architecture-reviewer's required fix (raised during this milestone's
  // design-stage review of item 2): without resetting
  // progressExpectedVersion on a progress-conflict reload, the next
  // progress submit would immediately re-conflict against the version it
  // just reloaded, since the pinned value was never refreshed.
  it('reloading from a progress-update conflict resets the progress form, so the next update carries the fresh version, not the stale one', async () => {
    mockUpdateProgressMutate.mockImplementationOnce((_variables, callbacks) => {
      callbacks?.onError?.(new ConcurrencyError('conflict'))
    })
    const freshGoal = { ...BASE_GOAL, current_agorot: 300000, version: 2 }
    mockRefetch.mockImplementationOnce(async () => {
      mockGoal = freshGoal
      return { data: [mockGoal] }
    })

    const { getByText, getByLabelText } = await render(<GoalDetail />)

    await fireEvent.changeText(getByLabelText('עדכון סכום נוכחי'), '2000')
    await fireEvent.press(getByText('עדכון'))

    await waitFor(() => expect(getByText('טען את הגרסה החדשה')).toBeTruthy())
    await fireEvent.press(getByText('טען את הגרסה החדשה'))
    await waitFor(() => expect(mockRefetch).toHaveBeenCalled())

    // The stale draft is discarded (ADR-036's reload policy), and a fresh
    // update now carries the newly-loaded version, not the one that just
    // conflicted.
    await fireEvent.changeText(getByLabelText('עדכון סכום נוכחי'), '3500')
    await fireEvent.press(getByText('עדכון'))

    expect(mockUpdateProgressMutate).toHaveBeenLastCalledWith(
      expect.objectContaining({ goalId: 'goal-1', expectedVersion: 2, currentAgorot: 350000 }),
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

describe('GoalDetail — required monthly saving pace', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockBack.mockClear()
    for (const key of Object.keys(mockAccountBalances)) delete mockAccountBalances[key]
    // A fixed "today" fully independent of whatever date this suite
    // actually runs on — every target_date below is set relative to it,
    // not to the real calendar.
    jest.useFakeTimers({ advanceTimers: false }).setSystemTime(new Date(2026, 7, 22))
  })

  afterEach(() => {
    jest.useRealTimers()
  })

  it('shows no pace projection when the goal has no target date', async () => {
    mockGoal = { ...BASE_GOAL, target_date: null }
    const { queryByText } = await render(<GoalDetail />)
    expect(queryByText('חיסכון חודשי נדרש')).toBeNull()
  })

  it('shows the required monthly saving and an on-track badge for a goal with a future target date', async () => {
    // remaining = 500000 - 100000 = 400000; Aug 22 -> Dec 1 = 3 months -> ceil(400000/3) = 133334
    mockGoal = { ...BASE_GOAL, target_date: '2026-12-01' }
    const { getByText } = await render(<GoalDetail />)

    expect(getByText('חיסכון חודשי נדרש')).toBeTruthy()
    expect(getByText(formatILS(133334))).toBeTruthy()
    expect(getByText('בקצב')).toBeTruthy()
  })

  it('shows an overdue badge for an incomplete goal past its target date, requiring the full remainder', async () => {
    mockGoal = { ...BASE_GOAL, target_date: '2026-08-01' }
    const { getByText } = await render(<GoalDetail />)

    expect(getByText('עבר התאריך היעד')).toBeTruthy()
    expect(getByText(formatILS(400000))).toBeTruthy() // full remainder, not divided by months
  })

  it('hides the pace card once the goal is complete, even with a target date set', async () => {
    mockGoal = { ...BASE_GOAL, current_agorot: 500000, target_date: '2026-12-01' }
    const { queryByText } = await render(<GoalDetail />)
    expect(queryByText('חיסכון חודשי נדרש')).toBeNull()
  })

  it('derives the projection from the live linked-account balance, not the stale stored current_agorot, for a linked_account goal', async () => {
    mockAccountBalances['acc-1'] = 450000
    mockGoal = {
      ...BASE_GOAL,
      account_id: 'acc-1',
      progress_source: 'linked_account',
      current_agorot: 100000, // stale — must be ignored in favor of the live balance
      target_date: '2026-12-01',
    }
    const { getByText } = await render(<GoalDetail />)

    // remaining = 500000 - 450000 = 50000; 3 months -> ceil(50000/3) = 16667
    expect(getByText(formatILS(16667))).toBeTruthy()
  })
})
