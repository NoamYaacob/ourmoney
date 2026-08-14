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
  it('shows the empty message and exactly one add-transaction CTA (the floating action, not a duplicate button)', async () => {
    mockUseTransactions.mockReturnValue({ transactions: [], isLoading: false, error: null })

    const { getByText, getByLabelText, queryAllByText } = await render(<Transactions />)

    expect(getByText('עדיין אין תנועות. הוסיפו את הראשונה שלכם.')).toBeTruthy()
    // Phase 3.1: the empty state's own actionLabel button was removed — the
    // screen's floatingAction FAB is the one "add transaction" CTA now, so
    // its accessible label is the only place this text should appear (no
    // visible "הוספת תנועה" Text/Button left in the empty-state itself).
    expect(getByLabelText('הוספת תנועה')).toBeTruthy()
    expect(queryAllByText('הוספת תנועה')).toHaveLength(0)
  })

  // Desktop polish pass: a real-browser visual check found the empty state
  // floating in an "enormous unused whitespace" on a wide desktop window —
  // this gives it a deliberate, moderately-sized bounded region (same
  // border/surface tokens as Card, capped width, not vertically centered
  // against the viewport) at the desktop breakpoint only. Mobile keeps the
  // exact original "items-center pt-10" box (asserted by absence of the
  // desktop-only classes making any mobile-visible difference — none of the
  // `web:desktop:` classes apply off that breakpoint).
  it('gives the desktop empty state a bounded, non-oversized region instead of floating on a huge blank page', async () => {
    mockUseTransactions.mockReturnValue({ transactions: [], isLoading: false, error: null })

    const { getByText } = await render(<Transactions />)

    const boundedRegion = getByText('עדיין אין תנועות. הוסיפו את הראשונה שלכם.').parent?.parent
    const className = boundedRegion?.props.className as string
    expect(className).toContain('items-center')
    expect(className).not.toContain('flex-1')
    expect(className).not.toContain('justify-center')
    expect(className).toContain('web:desktop:max-w-[640px]')
    expect(className).toContain('web:desktop:rounded-card')
    expect(className).toContain('web:desktop:border')
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
