// Desktop/RTL polish pass (real-browser regression): the 2-column wrap
// grid declared plain flex-row (not flex-row-reverse), which native
// auto-mirrors via Yoga under the forced-RTL flag but NativeWind's
// web-compiled CSS does not — the first goal (source order) must render
// top-right, continuing the RTL reading order into the wrap. First test
// coverage for this screen.
import { describe, expect, it, jest } from '@jest/globals'
import { render } from '@testing-library/react-native'
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
  useAccounts: () => ({ accounts: [], isLoading: false }),
}))
jest.mock('@/features/savings/hooks/useCreateSavingsGoal', () => ({
  useCreateSavingsGoal: () => ({ mutate: jest.fn(), isPending: false, isError: false }),
}))

const GOALS = [
  { id: 'goal-1', name: 'קרן חירום', current_agorot: 100000, target_agorot: 500000, is_completed: false },
  { id: 'goal-2', name: 'חופשה', current_agorot: 20000, target_agorot: 300000, is_completed: false },
]
const mockUseSavingsGoals = jest.fn()
jest.mock('@/features/savings/hooks/useSavingsGoals', () => ({
  useSavingsGoals: () => mockUseSavingsGoals(),
}))

describe('Goals list', () => {
  it('reverses the desktop 2-column goals grid so the first goal renders on the right', async () => {
    mockUseSavingsGoals.mockReturnValue({ goals: GOALS, isLoading: false, error: null })

    const { getByText } = await render(<Goals />)

    let node = getByText('קרן חירום').parent
    while (node && !(node.props.className as string | undefined)?.includes('w-[48%]')) {
      node = node.parent
    }
    const gridContainer = node?.parent
    expect(gridContainer?.props.className as string).toContain('web:desktop:flex-row-reverse')
  })
})
