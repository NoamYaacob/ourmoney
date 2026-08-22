// Screen-level tests for the mobile transactions feed. They hold the four
// departures the brief asked for: filters are not on the page, rows group
// by date, uncategorised work gets a strip rather than a warning, and an
// active filter is visible and removable without opening the sheet.
//
// The filter-sheet tests come LAST on purpose, and that ordering is load
// bearing. The sheet is a react-native Modal; RNTL treats everything
// outside a visible modal as hidden, and a tree that has had one opened
// leaves later page-level queries in this file finding nothing — even
// across `cleanup()`, and even for queries by testID. Reordering these
// describes, or adding a new sheet-opening test above the others, will make
// unrelated tests below fail with "unable to find" on markup that is
// demonstrably rendering. Add new page-content tests above this line.

import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals'
import { cleanup, fireEvent, render, waitFor, within } from '@testing-library/react-native'
import i18n from '@/i18n'
import { formatILS } from '@/lib/money/format'
import { MobileTransactions } from './MobileTransactions'
import type { Transaction } from '@/types/app'

const mockPush = jest.fn()
jest.mock('expo-router', () => ({
  useRouter: () => ({ push: mockPush }),
  useLocalSearchParams: () => ({}),
}))
jest.mock('@/features/auth/hooks/useAuth', () => ({
  useAuth: () => ({ user: { id: 'user-1' } }),
}))
jest.mock('@/features/household/hooks/useHousehold', () => ({
  useHousehold: () => ({ householdId: 'household-1', isLoading: false }),
}))
jest.mock('@/features/accounts/hooks/useAccounts', () => ({
  useAccounts: () => ({ accounts: [{ id: 'acc-1', name: 'עו״ש לאומי' }], isLoading: false }),
}))
jest.mock('@/features/categories/hooks/useCategories', () => ({
  useCategories: () => ({
    categories: [{ id: 'cat-1', name_he: 'סופרמרקט', icon: 'cart' }],
    isLoading: false,
  }),
}))

let mockUncategorized: unknown[] = []
jest.mock('@/features/budgets/hooks/useUncategorizedTransactions', () => ({
  useUncategorizedTransactions: () => ({ uncategorized: mockUncategorized, isLoading: false, error: null }),
}))

let mockTransactions: unknown[] = []
jest.mock('@/features/transactions/hooks/useTransactions', () => ({
  useTransactions: () => ({ transactions: mockTransactions, isLoading: false, error: null }),
}))

function txn(overrides: Partial<Transaction> & { id: string; txn_date: string; amount_agorot: number }) {
  return {
    household_id: 'h1',
    account_id: 'acc-1',
    category_id: 'cat-1',
    description: overrides.id,
    merchant: null,
    is_shared: true,
    is_excluded: false,
    transfer_id: null,
    recurring_id: null,
    installment_plan_id: null,
    installment_index: null,
    paid_by: null,
    created_by: null,
    created_at: '2026-08-22T00:00:00Z',
    updated_at: '2026-08-22T00:00:00Z',
    version: 1,
    categorization_source: null,
    category_rule_id: null,
    ...overrides,
  }
}

// Explicit, because these tests open a Modal. RNTL treats everything
// outside a visible modal as hidden, so a tree left mounted with the filter
// sheet open makes the NEXT test's page queries silently find nothing.
afterEach(() => {
  cleanup()
})

beforeEach(() => {
  mockPush.mockClear()
  mockUncategorized = []
  mockTransactions = [
    txn({ id: 'שופרסל דיל', txn_date: '2026-08-21', amount_agorot: -412_80 }),
    txn({ id: 'קפה נמרוד', txn_date: '2026-08-21', amount_agorot: -96_00, is_shared: false }),
    txn({ id: 'פז יעלון', txn_date: '2026-08-20', amount_agorot: -287_40 }),
  ]
})

describe('MobileTransactions — the feed', () => {
  it('groups rows by date and totals each day', async () => {
    const { getByText } = await render(<MobileTransactions />)

    expect(getByText('שופרסל דיל')).toBeTruthy()
    expect(getByText('פז יעלון')).toBeTruthy()
    // 412.80 + 96.00 on the 21st.
    expect(getByText(formatILS(508_80))).toBeTruthy()
  })

  it('marks a personal transaction apart from a shared one', async () => {
    const { getByText } = await render(<MobileTransactions />)

    expect(getByText(i18n.t('transactions.form.personal'))).toBeTruthy()
  })

  it('opens a transaction on tap', async () => {
    const { getByText } = await render(<MobileTransactions />)

    fireEvent.press(getByText('שופרסל דיל'))
    expect(mockPush).toHaveBeenCalledWith('/transactions/שופרסל דיל')
  })

  it('sends a transfer row to the transfer screen, not the transaction one', async () => {
    mockTransactions = [txn({ id: 'העברה לחיסכון', txn_date: '2026-08-20', amount_agorot: -2_000_00, transfer_id: 'tr-1' })]
    const { getByText } = await render(<MobileTransactions />)

    fireEvent.press(getByText('העברה לחיסכון'))
    expect(mockPush).toHaveBeenCalledWith('/transfers/tr-1')
  })
})

describe('MobileTransactions — uncategorised work', () => {
  it('offers the categorisation job with its count and the money it holds back', async () => {
    mockUncategorized = [
      txn({ id: 'u1', txn_date: '2026-08-21', amount_agorot: -1_000_00, category_id: null }),
      txn({ id: 'u2', txn_date: '2026-08-21', amount_agorot: -208_00, category_id: null }),
    ]
    const { getByTestId } = await render(<MobileTransactions />)

    // Queried through the strip's own testID rather than by page text: the
    // filter sheet in the tests above is a Modal, and RNTL treats content
    // outside a visible modal as hidden, which makes plain text queries
    // here depend on what a previous test left mounted.
    const strip = within(getByTestId('uncategorized-strip'))
    expect(strip.getByText(i18n.t('transactions.mobile.uncategorizedTitle', { count: 2 }))).toBeTruthy()
    expect(
      strip.getByText(i18n.t('transactions.mobile.uncategorizedSubtitle', { amount: formatILS(1_208_00) }))
    ).toBeTruthy()
    expect(strip.getByText(i18n.t('transactions.mobile.uncategorizedAction'))).toBeTruthy()
  })

  it('says nothing at all when everything is categorised', async () => {
    const { queryByTestId } = await render(<MobileTransactions />)

    expect(queryByTestId('uncategorized-strip')).toBeNull()
  })
})

describe('MobileTransactions — filters', () => {
  it('keeps the filter controls off the page until asked for', async () => {
    const { getAllByLabelText, queryByText, getByLabelText } = await render(<MobileTransactions />)

    // The sheet's own title is the tell — nothing from it renders yet.
    expect(queryByText(i18n.t('transactions.mobile.filterSheetTitle'))).toBeNull()

    fireEvent.press(getByLabelText(i18n.t('transactions.mobile.filterButton')))
    await waitFor(() => expect(queryByText(i18n.t('transactions.mobile.filterSheetTitle'))).toBeTruthy())

    // Dismissed before the test ends. A left-open Modal is not just untidy:
    // RNTL treats everything outside a visible modal as hidden, so the next
    // test's queries would silently find nothing on the page behind it.
    // The scrim carries the sheet's own title as its accessible name, so
    // both it and the header match — the scrim is the first.
    fireEvent.press(getAllByLabelText(i18n.t('transactions.mobile.filterSheetTitle'))[0]!)
    await waitFor(() => expect(queryByText(i18n.t('transactions.mobile.applyFilters'))).toBeNull())
  })

  it('records an applied filter on the page, and lets it be cleared there', async () => {
    const { getByRole, getByLabelText, queryByText } = await render(<MobileTransactions />)

    fireEvent.press(getByLabelText(i18n.t('transactions.mobile.filterButton')))
    await waitFor(() => expect(queryByText(i18n.t('transactions.mobile.filterSheetTitle'))).toBeTruthy())

    // Pressed by accessible name rather than by the label Text inside —
    // the Text is not the pressable, the chip is.
    fireEvent.press(getByRole('button', { name: i18n.t('transactions.filters.shared.personal') }))
    fireEvent.press(getByRole('button', { name: i18n.t('transactions.mobile.applyFilters') }))

    // The page now carries a record of what is filtered, and a way out of
    // it that does not require reopening the sheet.
    const chip = await waitFor(() =>
      getByRole('button', { name: i18n.t('transactions.filters.shared.personal') })
    )
    fireEvent.press(chip)

    await waitFor(() => expect(queryByText(i18n.t('transactions.mobile.resetFilters'))).toBeNull())
  })
})
