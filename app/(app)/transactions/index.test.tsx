// Design Phase 3: first test coverage for the Transactions list screen
// (none existed before this phase). Covers the empty state and populated
// row rendering — description, category name, and sign-aware amount color
// class, matching Dashboard's Recent Transactions row convention.
import { describe, expect, it, jest } from '@jest/globals'
import { render } from '@testing-library/react-native'
import '@/i18n'
import Transactions from './index'
import { formatILS } from '@/lib/money/format'

jest.mock('expo-router', () => ({
  useRouter: () => ({ push: jest.fn() }),
}))
// Avoids a deep, environment-specific import chain
// (@expo/vector-icons -> expo-font -> expo-asset) unrelated to what this
// test verifies — same rationale as other screen tests in this repo.
jest.mock('@expo/vector-icons', () => ({
  Ionicons: () => null,
}))
jest.mock('@/features/auth/hooks/useAuth', () => ({
  useAuth: () => ({ user: { id: 'user-1' } }),
}))
jest.mock('@/features/household/hooks/useHousehold', () => ({
  useHousehold: () => ({ householdId: 'household-1', isLoading: false }),
}))
jest.mock('@/features/categories/hooks/useCategories', () => ({
  useCategories: () => ({ categories: [{ id: 'cat-1', name_he: 'מזון', icon: '🍔' }] }),
}))

const mockUseTransactions = jest.fn()
jest.mock('@/features/transactions/hooks/useTransactions', () => ({
  useTransactions: () => mockUseTransactions(),
}))

describe('Transactions list', () => {
  it('shows the empty state with an add-transaction CTA when there are no transactions', async () => {
    mockUseTransactions.mockReturnValue({ transactions: [], isLoading: false, error: null })

    const { getByText } = await render(<Transactions />)

    expect(getByText('עדיין אין תנועות. הוסיפו את הראשונה שלכם.')).toBeTruthy()
    expect(getByText('הוספת תנועה')).toBeTruthy()
  })

  it('renders a populated row with description, category name, and a positive-colored income amount', async () => {
    mockUseTransactions.mockReturnValue({
      transactions: [
        {
          id: 'txn-1',
          category_id: 'cat-1',
          description: 'משכורת',
          amount_agorot: 500000,
          txn_date: '2026-08-01',
          is_shared: true,
          is_excluded: false,
        },
      ],
      isLoading: false,
      error: null,
    })

    const { getByText } = await render(<Transactions />)

    expect(getByText('משכורת')).toBeTruthy()
    const amount = getByText(formatILS(500000))
    expect(amount.props.className).toContain('text-positive-light')
    expect(amount.props.className).toContain('dark:text-positive-dark')
  })

  it('gives an expense a neutral (non-positive) amount color, not accent', async () => {
    mockUseTransactions.mockReturnValue({
      transactions: [
        {
          id: 'txn-2',
          category_id: null,
          description: 'קניות בסופר',
          amount_agorot: -5000,
          txn_date: '2026-08-02',
          is_shared: true,
          is_excluded: false,
        },
      ],
      isLoading: false,
      error: null,
    })

    const { getByText } = await render(<Transactions />)

    const amount = getByText(formatILS(-5000))
    expect(amount.props.className).toContain('text-ink-light')
    expect(amount.props.className).not.toContain('positive')
  })
})
