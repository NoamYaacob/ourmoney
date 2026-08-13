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
// Does not touch the separate "update current amount" contribution flow —
// that keeps its existing overwrite semantics untouched.
import { describe, expect, it, jest } from '@jest/globals'
import { fireEvent, render } from '@testing-library/react-native'
import '@/i18n'
import GoalDetail from './[id]'

jest.mock('expo-router', () => ({
  useRouter: () => ({ back: jest.fn() }),
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

const GOAL = {
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
}
jest.mock('@/features/savings/hooks/useSavingsGoals', () => ({
  useSavingsGoals: () => ({ goals: [GOAL], isLoading: false }),
}))

const mockUpdateGoalMutate = jest.fn()
jest.mock('@/features/savings/hooks/useUpdateSavingsGoal', () => ({
  useUpdateSavingsGoal: () => ({ mutate: mockUpdateGoalMutate, isPending: false, isError: false }),
}))

jest.mock('@/features/savings/hooks/useUpdateSavingsGoalProgress', () => ({
  useUpdateSavingsGoalProgress: () => ({ mutate: jest.fn(), isPending: false, isError: false }),
}))
jest.mock('@/features/savings/hooks/useDeleteSavingsGoal', () => ({
  useDeleteSavingsGoal: () => ({ mutate: jest.fn(), isPending: false }),
}))

describe('GoalDetail edit', () => {
  it('prefills the edit form with the goal current name/target', async () => {
    const { getByDisplayValue } = await render(<GoalDetail />)

    expect(getByDisplayValue('חופשה משפחתית')).toBeTruthy()
    expect(getByDisplayValue('5000')).toBeTruthy()
  })

  it('saves an edited name/target via useUpdateSavingsGoal', async () => {
    mockUpdateGoalMutate.mockClear()
    const { getByDisplayValue, getByText } = await render(<GoalDetail />)

    const nameInput = getByDisplayValue('חופשה משפחתית')
    await fireEvent.changeText(nameInput, 'טיול לחו״ל')

    const targetInput = getByDisplayValue('5000')
    await fireEvent.changeText(targetInput, '8000')

    await fireEvent.press(getByText('שמירה'))

    expect(mockUpdateGoalMutate).toHaveBeenCalledWith({
      id: 'goal-1',
      name: 'טיול לחו״ל',
      targetAgorot: 800000,
    })
  })
})
