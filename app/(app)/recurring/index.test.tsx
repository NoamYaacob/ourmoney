// Desktop/RTL polish pass (real-browser regression): the 2-column wrap
// grid declared plain flex-row (not flex-row-reverse), which native
// auto-mirrors via Yoga under the forced-RTL flag but NativeWind's
// web-compiled CSS does not — the first recurring item (source order) must
// render top-right, continuing the RTL reading order into the wrap. First
// test coverage for this screen.
import { describe, expect, it, jest } from '@jest/globals'
import { render } from '@testing-library/react-native'
import '@/i18n'
import Recurring from './index'

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
jest.mock('@/features/categories/hooks/useCategories', () => ({
  useCategories: () => ({ categories: [], isLoading: false }),
}))
jest.mock('@/features/recurring/hooks/useCreateRecurringTransaction', () => ({
  useCreateRecurringTransaction: () => ({ mutate: jest.fn(), isPending: false, isError: false }),
}))

const RECURRING = [
  {
    id: 'rec-1',
    description: 'שכירות',
    amount_agorot: -350000,
    frequency: 'monthly',
    next_due_date: '2026-09-01',
    is_active: true,
  },
  {
    id: 'rec-2',
    description: 'ביטוח',
    amount_agorot: -12000,
    frequency: 'monthly',
    next_due_date: '2026-09-05',
    is_active: true,
  },
]
const mockUseRecurringTransactions = jest.fn()
jest.mock('@/features/recurring/hooks/useRecurringTransactions', () => ({
  useRecurringTransactions: () => mockUseRecurringTransactions(),
}))

describe('Recurring list', () => {
  it('reverses the desktop 2-column recurring grid so the first item renders on the right', async () => {
    mockUseRecurringTransactions.mockReturnValue({ recurringTransactions: RECURRING, isLoading: false, error: null })

    const { getByText } = await render(<Recurring />)

    let node = getByText('שכירות').parent
    while (node && !(node.props.className as string | undefined)?.includes('w-[48%]')) {
      node = node.parent
    }
    const gridContainer = node?.parent
    expect(gridContainer?.props.className as string).toContain('web:desktop:flex-row-reverse')
  })
})
