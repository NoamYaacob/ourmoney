// The screen exists to answer "what was that spent on". Its figures must be
// the same ones the row that led here showed — one calculation, not two.

import { beforeEach, describe, expect, it, jest } from '@jest/globals'
import { render } from '@testing-library/react-native'
import i18n from '@/i18n'
import { formatILS } from '@/lib/money/format'
import BudgetCategoryDetail from './[categoryId]'

const mockPush = jest.fn()
const mockReplace = jest.fn()
jest.mock('expo-router', () => ({
  useRouter: () => ({ push: mockPush, replace: mockReplace }),
  useLocalSearchParams: () => ({ categoryId: 'cat-super' }),
}))
jest.mock('nativewind', () => ({ useColorScheme: () => ({ colorScheme: 'light' }) }))
jest.mock('@/features/auth/hooks/useAuth', () => ({ useAuth: () => ({ user: { id: 'u1' } }) }))
jest.mock('@/features/household/hooks/useHousehold', () => ({
  useHousehold: () => ({ householdId: 'h1', isLoading: false }),
}))

const CATEGORY = {
  categoryId: 'cat-super',
  categoryNameHe: 'סופרמרקט',
  categoryIcon: '🛒',
  allocatedAgorot: 450_000,
  spentAgorot: 382_000,
  remainingAgorot: 68_000,
  percentSpent: 84,
}

const mockUseBudgetProgress = jest.fn()
jest.mock('@/features/budgets/hooks/useBudgetProgress', () => ({
  useBudgetProgress: () => mockUseBudgetProgress(),
}))

const mockUseTransactions = jest.fn()
jest.mock('@/features/transactions/hooks/useTransactions', () => ({
  useTransactions: () => mockUseTransactions(),
}))

function txn(over: Record<string, unknown> = {}) {
  return {
    id: 't1',
    description: 'שופרסל דיל',
    amount_agorot: -41_280,
    txn_date: '2026-08-21',
    is_excluded: false,
    transfer_id: null,
    ...over,
  }
}

beforeEach(() => {
  mockPush.mockClear()
  mockUseBudgetProgress.mockReturnValue({ categories: [CATEGORY], isLoading: false, error: null })
  mockUseTransactions.mockReturnValue({ transactions: [txn()], isLoading: false, error: null })
})

describe('Budget category detail', () => {
  it('shows the same remaining figure the list row showed', async () => {
    const { getByText } = await render(<BudgetCategoryDetail />)
    expect(getByText('סופרמרקט')).toBeTruthy()
    expect(getByText(formatILS(CATEGORY.remainingAgorot))).toBeTruthy()
  })

  it('lists the category’s own transactions', async () => {
    const { getByText } = await render(<BudgetCategoryDetail />)
    expect(getByText('שופרסל דיל')).toBeTruthy()
  })

  it('averages over the same rows it counts, and no others', async () => {
    // An excluded transaction and a transfer leg are in neither the budget's
    // spend nor this average — otherwise the sentence would divide a figure
    // the screen shows by a count it does not.
    mockUseTransactions.mockReturnValue({
      transactions: [
        txn({ id: 'a', amount_agorot: -30_000 }),
        txn({ id: 'b', amount_agorot: -10_000 }),
        txn({ id: 'c', amount_agorot: -99_000, is_excluded: true }),
        txn({ id: 'd', amount_agorot: -99_000, transfer_id: 'tr1' }),
        txn({ id: 'e', amount_agorot: 50_000 }),
      ],
      isLoading: false,
      error: null,
    })

    const { getByText } = await render(<BudgetCategoryDetail />)

    // Matched on the count and the leading words only. The amount is
    // deliberately out of the pattern: formatILS embeds bidi control marks,
    // and asserting on their exact placement tests ICU rather than this
    // screen. Two rows counted, and 40,000 agorot over two rows is 20,000
    // each — which is what "בממוצע ₪200.00" says.
    expect(getByText(/^2 תנועות החודש, בממוצע /)).toBeTruthy()
    expect(getByText(new RegExp('200'))).toBeTruthy()
  })

  it('says so rather than rendering a blank card when the category is not in this budget', async () => {
    mockUseBudgetProgress.mockReturnValue({ categories: [], isLoading: false, error: null })

    const { getByText } = await render(<BudgetCategoryDetail />)

    expect(getByText(i18n.t('budgets.category.notFound'))).toBeTruthy()
  })

  it('offers an empty state, not an empty card, when nothing was spent here', async () => {
    mockUseTransactions.mockReturnValue({ transactions: [], isLoading: false, error: null })

    const { getByText } = await render(<BudgetCategoryDetail />)

    expect(getByText(i18n.t('budgets.category.detailEmpty'))).toBeTruthy()
  })
})
