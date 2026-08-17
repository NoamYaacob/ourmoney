// Design Phase 3: original coverage — empty state and populated row
// rendering (description, category name, sign-aware amount color class).
// Search + Filters milestone: added coverage for the new search/filter
// bar, the server-vs-client filter split (asserted via what useTransactions
// is called with), the no-results vs true-empty distinction, and
// clear-filters. Filter state's route-param persistence itself (the
// mechanism that survives Transactions -> Detail -> back) is proven at the
// pure-function level in features/transactions/lib/transactionFilters.test.ts
// (the round-trip tests) — this file additionally proves the screen reads
// that state exclusively from route params (never local component state),
// by rendering with preset params and asserting the resulting
// useTransactions call, which is what makes that persistence work: there
// is no local state a remount/back-navigation could lose.
import { beforeEach, describe, expect, it, jest } from '@jest/globals'
import { fireEvent, render } from '@testing-library/react-native'
import '@/i18n'
import Transactions from './index'
import { formatILS } from '@/lib/money/format'

let mockSearchParams: Record<string, string> = {}
const mockSetParams = jest.fn()
const mockPush = jest.fn()
jest.mock('expo-router', () => ({
  useRouter: () => ({ push: mockPush, setParams: mockSetParams }),
  useLocalSearchParams: () => mockSearchParams,
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
jest.mock('@/features/accounts/hooks/useAccounts', () => ({
  useAccounts: () => ({ accounts: [{ id: 'acct-1', name: 'עו״ש' }] }),
}))
jest.mock('@/features/categories/hooks/useCategories', () => ({
  useCategories: () => ({ categories: [{ id: 'cat-1', name_he: 'מזון', icon: '🍔' }] }),
}))

const mockUseTransactions = jest.fn()
jest.mock('@/features/transactions/hooks/useTransactions', () => ({
  useTransactions: (...args: unknown[]) => mockUseTransactions(...args),
}))

const mockBulkMutateAsync = jest.fn<(...args: unknown[]) => Promise<{ updatedIds: string[]; missingIds: string[] }>>()
let mockBulkIsPending = false
jest.mock('@/features/transactions/hooks/useBulkUpdateTransactionCategory', () => ({
  useBulkUpdateTransactionCategory: () => ({ mutateAsync: mockBulkMutateAsync, isPending: mockBulkIsPending }),
}))

// Climbs from a node up to the nearest ancestor whose className contains
// `marker`, rather than a fixed number of `.parent` hops — resilient to the
// exact wrapper nesting between the queried text and the element under test.
function climbTo(node: any, marker: string) {
  let current = node
  while (current && !((current.props?.className as string | undefined) ?? '').includes(marker)) {
    current = current.parent
  }
  return current
}

describe('Transactions list', () => {
  beforeEach(() => {
    mockSearchParams = {}
    mockSetParams.mockClear()
    mockPush.mockClear()
    mockBulkMutateAsync.mockClear()
    mockBulkMutateAsync.mockResolvedValue({ updatedIds: [], missingIds: [] })
    mockBulkIsPending = false
  })

  it('shows the empty message and exactly one add-transaction CTA (the floating action, not a duplicate button)', async () => {
    mockUseTransactions.mockReturnValue({ transactions: [], isLoading: false, error: null })

    const { getAllByText, getByLabelText, queryAllByText } = await render(<Transactions />)

    // Desktop polish pass (round 2): the empty state now renders twice —
    // a compact mobile version and a full-size desktop version, toggled by
    // `web:desktop:hidden` / `hidden web:desktop:flex` wrappers RNTL can't
    // evaluate as real CSS — so both copies of the message legitimately
    // exist in the tree at once.
    expect(getAllByText('עדיין אין תנועות. הוסיפו את הראשונה שלכם.').length).toBe(2)
    // Phase 3.1: the empty state's own actionLabel button was removed — the
    // screen's floatingAction FAB is the one "add transaction" CTA now, so
    // its accessible label is the only place this text should appear (no
    // visible "הוספת תנועה" Text/Button left in the empty-state itself).
    expect(getByLabelText('הוספת תנועה')).toBeTruthy()
    expect(queryAllByText('הוספת תנועה')).toHaveLength(0)
  })

  // Desktop polish pass (round 2): a real-browser visual check at a
  // realistic ~900px viewport height found the earlier "bounded region
  // near the top" treatment still read as a small card floating in mostly
  // empty page — `web:desktop:flex-1 web:desktop:justify-center` claims
  // the column's remaining vertical space (Screen's own content column is
  // already `flex-1`, see Screen.tsx) and centers the card within it
  // instead of leaving that space as dead canvas below a top-anchored box.
  // Mobile keeps the exact original unscoped "items-center pt-10" box —
  // asserted below by confirming the bare (non-`web:desktop:`-prefixed)
  // tokens contain no `flex-1`/`justify-center` of their own.
  it("gives the desktop empty state the column's remaining space, centered, instead of a small top-anchored box", async () => {
    mockUseTransactions.mockReturnValue({ transactions: [], isLoading: false, error: null })

    const { getAllByText } = await render(<Transactions />)

    const card = climbTo(getAllByText('עדיין אין תנועות. הוסיפו את הראשונה שלכם.')[0], 'max-w-[520px]')
    const cardClassName = card?.props.className as string
    expect(cardClassName).toContain('web:desktop:max-w-[520px]')
    expect(cardClassName).toContain('web:desktop:rounded-card')
    expect(cardClassName).toContain('web:desktop:border')

    const outerBox = card?.parent
    const outerTokens = ((outerBox?.props.className as string) ?? '').split(/\s+/)
    expect(outerTokens).toContain('items-center')
    expect(outerTokens).toContain('pt-10')
    expect(outerTokens).not.toContain('flex-1')
    expect(outerTokens).not.toContain('justify-center')
    expect(outerTokens).toContain('web:desktop:flex-1')
    expect(outerTokens).toContain('web:desktop:justify-center')
  })

  // Desktop polish pass (round 2): `compact` has no responsive variant, so
  // the desktop card renders a second, full-size EmptyState instead of
  // reusing the mobile compact one — guards that each variant is correctly
  // shown/hidden per breakpoint rather than both showing at once on either.
  it('shows the compact empty state only off desktop, and the full-size one only at desktop', async () => {
    mockUseTransactions.mockReturnValue({ transactions: [], isLoading: false, error: null })

    const { getAllByText } = await render(<Transactions />)

    const [mobileMessage, desktopMessage] = getAllByText('עדיין אין תנועות. הוסיפו את הראשונה שלכם.')
    const mobileWrapper = climbTo(mobileMessage, 'web:desktop:hidden')
    const desktopWrapper = climbTo(desktopMessage, 'web:desktop:flex')
    const mobileTokens = ((mobileWrapper?.props.className as string) ?? '').split(/\s+/)
    const desktopTokens = ((desktopWrapper?.props.className as string) ?? '').split(/\s+/)
    expect(mobileTokens).toContain('web:desktop:hidden')
    expect(mobileTokens).not.toContain('hidden')
    expect(desktopTokens).toContain('hidden')
    expect(desktopTokens).toContain('web:desktop:flex')
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
          transfer_id: null,
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

  // Desktop/RTL polish pass (real-browser regression): the title+CSV-import
  // header was a plain flex-row, which native auto-mirrors via Yoga under
  // the forced-RTL flag but NativeWind's web-compiled CSS does not — a
  // headless-browser measurement found the title rendering on the physical
  // left on web (should be right, since it's listed first/primary).
  it('reverses the title/CSV-import header row on web so the title renders on the right', async () => {
    mockUseTransactions.mockReturnValue({ transactions: [], isLoading: false, error: null })

    const { getByText } = await render(<Transactions />)

    const header = getByText('תנועות').parent
    expect(header?.props.className as string).toContain('web:flex-row-reverse')
  })

  // Desktop polish pass: a simple 3-column row list (icon, description,
  // amount) stretched to the `wide` (1150px desktop) content cap read as
  // absurdly wide rows — narrowed to `medium` (flat 800px), matching the
  // "simple list screens ~760-1000px" desktop guideline.
  it('caps the desktop content width at the medium (800px) token, not the wide (1150px) one', async () => {
    mockUseTransactions.mockReturnValue({ transactions: [], isLoading: false, error: null })

    const { getByText } = await render(<Transactions />)

    const contentColumn = getByText('תנועות').parent?.parent
    const className = contentColumn?.props.className as string
    expect(className).toContain('web:tablet:max-w-[800px]')
    expect(className).not.toContain('web:desktop:max-w-[1150px]')
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
          transfer_id: null,
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

  // Migration 008 (ADR-035).
  describe('internal transfers', () => {
    const TRANSFER_LEG = {
      id: 't-transfer-1',
      category_id: null,
      description: 'העברה לחיסכון',
      merchant_name: null,
      amount_agorot: -50000,
      txn_date: '2026-08-04',
      is_shared: true,
      is_excluded: false,
      transfer_id: 'transfer-1',
    }
    const ORDINARY_TXN = {
      id: 't1',
      category_id: null,
      description: 'קניות בסופר',
      merchant_name: null,
      amount_agorot: -5000,
      txn_date: '2026-08-02',
      is_shared: true,
      is_excluded: false,
      transfer_id: null,
    }

    it('gives a transfer row an accent (neutral) amount color, not positive/expense-ink', async () => {
      mockUseTransactions.mockReturnValue({ transactions: [TRANSFER_LEG], isLoading: false, error: null })

      const { getByText } = await render(<Transactions />)

      const amount = getByText(formatILS(-50000))
      expect(amount.props.className).toContain('text-accent-light')
      expect(amount.props.className).toContain('dark:text-accent-dark')
      expect(amount.props.className).not.toContain('text-positive')
      expect(amount.props.className).not.toContain('text-ink-light')
    })

    it('labels a transfer row with the transfer label, not a category name or the personal suffix (even when is_shared is false)', async () => {
      mockUseTransactions.mockReturnValue({
        transactions: [{ ...TRANSFER_LEG, is_shared: false }],
        isLoading: false,
        error: null,
      })

      const { getByText, queryByText } = await render(<Transactions />)

      expect(getByText(`העברה · ${TRANSFER_LEG.txn_date}`)).toBeTruthy()
      expect(queryByText('אישית')).toBeNull()
    })

    it('tapping a transfer row navigates to the transfer detail screen, not the transaction detail screen', async () => {
      mockUseTransactions.mockReturnValue({ transactions: [TRANSFER_LEG], isLoading: false, error: null })

      const { getByText } = await render(<Transactions />)
      await fireEvent.press(getByText('העברה לחיסכון'))

      expect(mockPush).toHaveBeenCalledWith('/transfers/transfer-1')
      expect(mockPush).not.toHaveBeenCalledWith(`/transactions/${TRANSFER_LEG.id}`)
    })

    it('the transfer type filter chip shows only transfer rows', async () => {
      mockSearchParams = { type: 'transfer' }
      mockUseTransactions.mockReturnValue({
        transactions: [TRANSFER_LEG, ORDINARY_TXN],
        isLoading: false,
        error: null,
      })

      const { getByText, queryByText } = await render(<Transactions />)

      expect(getByText('העברה לחיסכון')).toBeTruthy()
      expect(queryByText('קניות בסופר')).toBeNull()
    })

    it('pressing the transfer type chip updates the route params', async () => {
      mockUseTransactions.mockReturnValue({ transactions: [], isLoading: false, error: null })

      const { getByTestId } = await render(<Transactions />)
      await fireEvent.press(getByTestId('transactions-filter-type-transfer'))

      expect(mockSetParams).toHaveBeenCalledWith(expect.objectContaining({ type: 'transfer' }))
    })

    it('a transfer row is not selectable in selection mode — tapping it does nothing', async () => {
      mockUseTransactions.mockReturnValue({ transactions: [TRANSFER_LEG, ORDINARY_TXN], isLoading: false, error: null })

      const { getByText } = await render(<Transactions />)
      await fireEvent.press(getByText('בחירה'))
      await fireEvent.press(getByText('העברה לחיסכון'))

      expect(getByText('0 נבחרו')).toBeTruthy()
    })

    it('"select all" does not include transfer rows', async () => {
      mockUseTransactions.mockReturnValue({ transactions: [TRANSFER_LEG, ORDINARY_TXN], isLoading: false, error: null })

      const { getByText } = await render(<Transactions />)
      await fireEvent.press(getByText('בחירה'))
      await fireEvent.press(getByText('בחר הכל'))

      // Only TXN_1 is selectable — the transfer leg is excluded from the
      // selectable set entirely (RLS would reject a bulk category write on
      // it anyway, since transactions_update excludes transfer legs).
      expect(getByText('1 נבחרו')).toBeTruthy()
    })
  })

  describe('search + filters', () => {
    it('typing in the search field updates the route params, not local-only state', async () => {
      mockUseTransactions.mockReturnValue({ transactions: [], isLoading: false, error: null })

      const { getByLabelText } = await render(<Transactions />)
      await fireEvent.changeText(getByLabelText('חיפוש'), 'סופר')

      expect(mockSetParams).toHaveBeenCalledWith(expect.objectContaining({ q: 'סופר' }))
    })

    it('filters the visible list by description/merchant/category text (client-side, given the server-fetched set)', async () => {
      mockSearchParams = { q: 'סופר' }
      mockUseTransactions.mockReturnValue({
        transactions: [
          { id: 't1', category_id: null, description: 'קניות בסופר', merchant_name: null, amount_agorot: -5000, txn_date: '2026-08-02', is_shared: true, is_excluded: false, transfer_id: null },
          { id: 't2', category_id: null, description: 'דלק', merchant_name: null, amount_agorot: -3000, txn_date: '2026-08-03', is_shared: true, is_excluded: false, transfer_id: null },
        ],
        isLoading: false,
        error: null,
      })

      const { getByText, queryByText } = await render(<Transactions />)

      expect(getByText('קניות בסופר')).toBeTruthy()
      expect(queryByText('דלק')).toBeNull()
    })

    it('pressing an income/expense type chip updates the route params', async () => {
      mockUseTransactions.mockReturnValue({ transactions: [], isLoading: false, error: null })

      const { getByTestId } = await render(<Transactions />)
      await fireEvent.press(getByTestId('transactions-filter-type-expense'))

      expect(mockSetParams).toHaveBeenCalledWith(expect.objectContaining({ type: 'expense' }))
    })

    it('pressing a shared/personal chip updates the route params', async () => {
      mockUseTransactions.mockReturnValue({ transactions: [], isLoading: false, error: null })

      const { getByTestId } = await render(<Transactions />)
      await fireEvent.press(getByTestId('transactions-filter-shared-personal'))

      expect(mockSetParams).toHaveBeenCalledWith(expect.objectContaining({ shared: 'personal' }))
    })

    it('pressing the account filter and choosing a specific account updates the route params', async () => {
      mockUseTransactions.mockReturnValue({ transactions: [], isLoading: false, error: null })

      const { getByRole, getByText } = await render(<Transactions />)
      await fireEvent.press(getByRole('button', { name: 'חשבון' }))
      await fireEvent.press(getByText('עו״ש'))

      expect(mockSetParams).toHaveBeenCalledWith(expect.objectContaining({ accountId: 'acct-1' }))
    })

    it('pressing the category filter and choosing "ללא קטגוריה" sets categoryId to the uncategorized sentinel', async () => {
      mockUseTransactions.mockReturnValue({ transactions: [], isLoading: false, error: null })

      const { getByRole, getByText } = await render(<Transactions />)
      await fireEvent.press(getByRole('button', { name: 'קטגוריה' }))
      await fireEvent.press(getByText('ללא קטגוריה'))

      expect(mockSetParams).toHaveBeenCalledWith(expect.objectContaining({ categoryId: 'uncategorized' }))
    })

    it('a period param translates into the matching periodStart/periodEnd passed to useTransactions', async () => {
      mockSearchParams = { period: 'current_month' }
      mockUseTransactions.mockReturnValue({ transactions: [], isLoading: false, error: null })

      await render(<Transactions />)

      const [, filters] = mockUseTransactions.mock.calls[mockUseTransactions.mock.calls.length - 1] as [unknown, Record<string, unknown>]
      expect(filters).toHaveProperty('periodStart')
      expect(filters).toHaveProperty('periodEnd')
    })

    it('an accountId param is passed through to useTransactions as a server-side filter', async () => {
      mockSearchParams = { accountId: 'acct-1' }
      mockUseTransactions.mockReturnValue({ transactions: [], isLoading: false, error: null })

      await render(<Transactions />)

      const [, filters] = mockUseTransactions.mock.calls[mockUseTransactions.mock.calls.length - 1] as [unknown, Record<string, unknown>]
      expect(filters).toEqual(expect.objectContaining({ accountId: 'acct-1' }))
    })

    it('a categoryId=uncategorized param is passed through as the uncategorized flag, not categoryId', async () => {
      mockSearchParams = { categoryId: 'uncategorized' }
      mockUseTransactions.mockReturnValue({ transactions: [], isLoading: false, error: null })

      await render(<Transactions />)

      const [, filters] = mockUseTransactions.mock.calls[mockUseTransactions.mock.calls.length - 1] as [unknown, Record<string, unknown>]
      expect(filters).toEqual(expect.objectContaining({ uncategorized: true }))
      expect(filters).not.toHaveProperty('categoryId')
    })

    it('composes multiple active params into a single consistent query + local filter pass', async () => {
      mockSearchParams = { q: 'סופר', period: 'current_month', accountId: 'acct-1', type: 'expense', shared: 'shared' }
      mockUseTransactions.mockReturnValue({
        transactions: [
          { id: 't1', category_id: null, description: 'קניות בסופר', merchant_name: null, amount_agorot: -5000, txn_date: '2026-08-02', is_shared: true, is_excluded: false, transfer_id: null },
        ],
        isLoading: false,
        error: null,
      })

      await render(<Transactions />)

      const [, filters] = mockUseTransactions.mock.calls[mockUseTransactions.mock.calls.length - 1] as [unknown, Record<string, unknown>]
      expect(filters).toEqual(
        expect.objectContaining({ accountId: 'acct-1', isShared: true, periodStart: expect.any(String), periodEnd: expect.any(String) })
      )
    })

    it('shows the no-results message (distinct from the true-empty message) when a filter is active and nothing matches', async () => {
      mockSearchParams = { q: 'לא קיים' }
      mockUseTransactions.mockReturnValue({
        transactions: [
          { id: 't1', category_id: null, description: 'קניות בסופר', merchant_name: null, amount_agorot: -5000, txn_date: '2026-08-02', is_shared: true, is_excluded: false, transfer_id: null },
        ],
        isLoading: false,
        error: null,
      })

      const { getByText, queryByText } = await render(<Transactions />)

      expect(getByText('לא נמצאו תנועות שמתאימות לחיפוש או לסינון')).toBeTruthy()
      expect(queryByText('עדיין אין תנועות. הוסיפו את הראשונה שלכם.')).toBeNull()
    })

    it('the no-results state includes a clear-filters action that resets params to defaults', async () => {
      mockSearchParams = { q: 'לא קיים' }
      mockUseTransactions.mockReturnValue({
        transactions: [
          { id: 't1', category_id: null, description: 'קניות בסופר', merchant_name: null, amount_agorot: -5000, txn_date: '2026-08-02', is_shared: true, is_excluded: false, transfer_id: null },
        ],
        isLoading: false,
        error: null,
      })

      const { getAllByText } = await render(<Transactions />)
      const clearButtons = getAllByText('ניקוי סינון')
      await fireEvent.press(clearButtons[0]!)

      expect(mockSetParams).toHaveBeenCalledWith(
        expect.objectContaining({ q: '', period: 'all_time', accountId: 'all', categoryId: 'all', type: 'all', shared: 'all' })
      )
    })

    it('shows the true-empty message, not no-results, when no filter is active and the household has zero transactions', async () => {
      mockSearchParams = {}
      mockUseTransactions.mockReturnValue({ transactions: [], isLoading: false, error: null })

      const { getAllByText, queryByText } = await render(<Transactions />)

      expect(getAllByText('עדיין אין תנועות. הוסיפו את הראשונה שלכם.').length).toBeGreaterThan(0)
      expect(queryByText('לא נמצאו תנועות שמתאימות לחיפוש או לסינון')).toBeNull()
    })

    it('shows a result count and a clear-filters action once a filter is active', async () => {
      mockSearchParams = { type: 'expense' }
      mockUseTransactions.mockReturnValue({
        transactions: [
          { id: 't1', category_id: null, description: 'קניות בסופר', merchant_name: null, amount_agorot: -5000, txn_date: '2026-08-02', is_shared: true, is_excluded: false, transfer_id: null },
        ],
        isLoading: false,
        error: null,
      })

      const { getByText } = await render(<Transactions />)

      expect(getByText('1 תנועות')).toBeTruthy()
      expect(getByText('ניקוי סינון')).toBeTruthy()
    })

    it('does not show a clear-filters action when no filter is active', async () => {
      mockSearchParams = {}
      mockUseTransactions.mockReturnValue({ transactions: [], isLoading: false, error: null })

      const { queryByText } = await render(<Transactions />)

      expect(queryByText('ניקוי סינון')).toBeNull()
    })

    it('an excluded transaction still renders (and is still labeled) under an active filter — exclusion behavior is unchanged', async () => {
      mockSearchParams = { type: 'expense' }
      mockUseTransactions.mockReturnValue({
        transactions: [
          { id: 't1', category_id: null, description: 'קניות בסופר', merchant_name: null, amount_agorot: -5000, txn_date: '2026-08-02', is_shared: true, is_excluded: true, transfer_id: null },
        ],
        isLoading: false,
        error: null,
      })

      const { getByText } = await render(<Transactions />)

      expect(getByText('קניות בסופר')).toBeTruthy()
      expect(getByText('לא נכלל בתקציב')).toBeTruthy()
    })
  })

  describe('bulk categorization / selection mode', () => {
    const TXN_1 = { id: 't1', category_id: null, description: 'קניות בסופר', merchant_name: null, amount_agorot: -5000, txn_date: '2026-08-02', is_shared: true, is_excluded: false, transfer_id: null }
    const TXN_2 = { id: 't2', category_id: null, description: 'דלק', merchant_name: null, amount_agorot: -3000, txn_date: '2026-08-03', is_shared: true, is_excluded: false, transfer_id: null }

    it('does not select anything when entering selection mode', async () => {
      mockUseTransactions.mockReturnValue({ transactions: [TXN_1, TXN_2], isLoading: false, error: null })

      const { getByText, queryByText } = await render(<Transactions />)
      await fireEvent.press(getByText('בחירה'))

      expect(getByText('0 נבחרו')).toBeTruthy()
      expect(queryByText('שינוי קטגוריה')).toBeNull() // no selection yet -> bulk action not offered
    })

    it('selecting one row updates the selected count', async () => {
      mockUseTransactions.mockReturnValue({ transactions: [TXN_1, TXN_2], isLoading: false, error: null })

      const { getByText } = await render(<Transactions />)
      await fireEvent.press(getByText('בחירה'))
      await fireEvent.press(getByText('קניות בסופר'))

      expect(getByText('1 נבחרו')).toBeTruthy()
    })

    it('pressing an already-selected row deselects it', async () => {
      mockUseTransactions.mockReturnValue({ transactions: [TXN_1, TXN_2], isLoading: false, error: null })

      const { getByText } = await render(<Transactions />)
      await fireEvent.press(getByText('בחירה'))
      await fireEvent.press(getByText('קניות בסופר'))
      expect(getByText('1 נבחרו')).toBeTruthy()

      await fireEvent.press(getByText('קניות בסופר'))
      expect(getByText('0 נבחרו')).toBeTruthy()
    })

    it('"select all" selects every currently visible (filtered) transaction', async () => {
      mockUseTransactions.mockReturnValue({ transactions: [TXN_1, TXN_2], isLoading: false, error: null })

      const { getByText } = await render(<Transactions />)
      await fireEvent.press(getByText('בחירה'))
      await fireEvent.press(getByText('בחר הכל'))

      expect(getByText('2 נבחרו')).toBeTruthy()
    })

    it('"deselect all" clears the selection but stays in selection mode', async () => {
      mockUseTransactions.mockReturnValue({ transactions: [TXN_1, TXN_2], isLoading: false, error: null })

      const { getByText, queryByText } = await render(<Transactions />)
      await fireEvent.press(getByText('בחירה'))
      await fireEvent.press(getByText('בחר הכל'))
      await fireEvent.press(getByText('נקה בחירה'))

      expect(getByText('0 נבחרו')).toBeTruthy()
      // Still in selection mode — the "בחירה" entry point is gone, "בטל" is present.
      expect(queryByText('בחירה')).toBeNull()
      expect(getByText('בטל')).toBeTruthy()
    })

    it('"בטל" (cancel) exits selection mode and clears the selection, restoring normal row navigation', async () => {
      mockUseTransactions.mockReturnValue({ transactions: [TXN_1, TXN_2], isLoading: false, error: null })

      const { getByText, queryByText } = await render(<Transactions />)
      await fireEvent.press(getByText('בחירה'))
      await fireEvent.press(getByText('בחר הכל'))
      await fireEvent.press(getByText('בטל'))

      expect(queryByText('0 נבחרו')).toBeNull()
      expect(queryByText('בטל')).toBeNull()
      expect(getByText('בחירה')).toBeTruthy() // back to the entry point

      await fireEvent.press(getByText('קניות בסופר'))
      expect(mockPush).toHaveBeenCalledWith('/transactions/t1') // normal navigation restored
    })

    it('changing a filter while selection mode is active clears the selection (documented safe behavior)', async () => {
      mockUseTransactions.mockReturnValue({ transactions: [TXN_1, TXN_2], isLoading: false, error: null })

      const { getByText, rerender } = await render(<Transactions />)
      await fireEvent.press(getByText('בחירה'))
      await fireEvent.press(getByText('בחר הכל'))
      expect(getByText('2 נבחרו')).toBeTruthy()

      // Simulate a filter change: the route param changes and the screen
      // re-renders with a narrower visible set — exactly what happens when
      // the user picks a different filter while selection mode is active.
      mockSearchParams = { type: 'expense' }
      mockUseTransactions.mockReturnValue({ transactions: [TXN_1], isLoading: false, error: null })
      await rerender(<Transactions />)

      expect(getByText('0 נבחרו')).toBeTruthy()
    })

    it('bulk-categorizing updates only the selected transactions, sending exactly those ids', async () => {
      mockUseTransactions.mockReturnValue({ transactions: [TXN_1, TXN_2], isLoading: false, error: null })
      mockBulkMutateAsync.mockResolvedValue({ updatedIds: ['t1'], missingIds: [] })

      const { getByText, getByRole } = await render(<Transactions />)
      await fireEvent.press(getByText('בחירה'))
      await fireEvent.press(getByText('קניות בסופר')) // select only t1, not t2

      await fireEvent.press(getByRole('button', { name: 'שינוי קטגוריה' }))
      await fireEvent.press(getByText('מזון'))

      expect(mockBulkMutateAsync).toHaveBeenCalledWith({
        householdId: 'household-1',
        transactionIds: ['t1'],
        categoryId: 'cat-1',
      })
    })

    it('supports assigning "ללא קטגוריה" (uncategorized) as the bulk target', async () => {
      mockUseTransactions.mockReturnValue({ transactions: [TXN_1], isLoading: false, error: null })
      mockBulkMutateAsync.mockResolvedValue({ updatedIds: ['t1'], missingIds: [] })

      const { getByText, getByRole } = await render(<Transactions />)
      await fireEvent.press(getByText('בחירה'))
      await fireEvent.press(getByText('קניות בסופר'))
      await fireEvent.press(getByRole('button', { name: 'שינוי קטגוריה' }))
      await fireEvent.press(getByText('ללא קטגוריה'))

      expect(mockBulkMutateAsync).toHaveBeenCalledWith(
        expect.objectContaining({ categoryId: null })
      )
    })

    it('shows a success message and exits selection mode when every selected row updates', async () => {
      mockUseTransactions.mockReturnValue({ transactions: [TXN_1, TXN_2], isLoading: false, error: null })
      mockBulkMutateAsync.mockResolvedValue({ updatedIds: ['t1', 't2'], missingIds: [] })

      const { getByText, getByRole, queryByText } = await render(<Transactions />)
      await fireEvent.press(getByText('בחירה'))
      await fireEvent.press(getByText('בחר הכל'))
      await fireEvent.press(getByRole('button', { name: 'שינוי קטגוריה' }))
      await fireEvent.press(getByText('מזון'))

      expect(getByText('2 תנועות עודכנו לקטגוריה החדשה')).toBeTruthy()
      expect(queryByText('בטל')).toBeNull() // selection mode exited
    })

    it('partial success keeps only the not-updated rows selected and shows a partial message (failed rows do not vanish from selection)', async () => {
      mockUseTransactions.mockReturnValue({ transactions: [TXN_1, TXN_2], isLoading: false, error: null })
      mockBulkMutateAsync.mockResolvedValue({ updatedIds: ['t1'], missingIds: ['t2'] })

      const { getByText, getByRole } = await render(<Transactions />)
      await fireEvent.press(getByText('בחירה'))
      await fireEvent.press(getByText('בחר הכל'))
      await fireEvent.press(getByRole('button', { name: 'שינוי קטגוריה' }))
      await fireEvent.press(getByText('מזון'))

      expect(getByText('1 מתוך 2 תנועות עודכנו. השאר נשארו מסומנים — נסו שוב')).toBeTruthy()
      // Still in selection mode with exactly the un-updated row selected.
      expect(getByText('1 נבחרו')).toBeTruthy()
      expect(getByText('בטל')).toBeTruthy()
    })

    it('treats a thrown error as a total failure — the full original selection is preserved, not cleared', async () => {
      mockUseTransactions.mockReturnValue({ transactions: [TXN_1, TXN_2], isLoading: false, error: null })
      mockBulkMutateAsync.mockRejectedValue(new Error('network error'))

      const { getByText, getByRole } = await render(<Transactions />)
      await fireEvent.press(getByText('בחירה'))
      await fireEvent.press(getByText('בחר הכל'))
      await fireEvent.press(getByRole('button', { name: 'שינוי קטגוריה' }))
      await fireEvent.press(getByText('מזון'))

      expect(getByText('עדכון הקטגוריה נכשל. נסו שוב')).toBeTruthy()
      expect(getByText('2 נבחרו')).toBeTruthy() // nothing was cleared
    })

    it('shows a disabled loading control instead of the category picker while a bulk update is in flight (double-submit protection)', async () => {
      mockUseTransactions.mockReturnValue({ transactions: [TXN_1], isLoading: false, error: null })
      mockBulkIsPending = true

      const { getByText, queryByRole } = await render(<Transactions />)
      await fireEvent.press(getByText('בחירה'))
      await fireEvent.press(getByText('קניות בסופר'))

      // The category-picking trigger itself is not interactable while pending.
      expect(queryByRole('button', { name: 'שינוי קטגוריה' })).toBeNull()
    })

    it('gives a selected row a non-color-only, screen-reader-visible selected state (accessibilityRole/State, not color alone)', async () => {
      mockUseTransactions.mockReturnValue({ transactions: [TXN_1], isLoading: false, error: null })

      const { getByText, getByLabelText } = await render(<Transactions />)
      await fireEvent.press(getByText('בחירה'))
      await fireEvent.press(getByText('קניות בסופר'))

      const row = getByLabelText('קניות בסופר, נבחר')
      expect(row.props.accessibilityRole).toBe('checkbox')
      expect(row.props.accessibilityState).toEqual({ checked: true })
    })

    it('an unselected row in selection mode is labeled and stated as not selected', async () => {
      mockUseTransactions.mockReturnValue({ transactions: [TXN_1], isLoading: false, error: null })

      const { getByText, getByLabelText } = await render(<Transactions />)
      await fireEvent.press(getByText('בחירה'))

      const row = getByLabelText('קניות בסופר, לא נבחר')
      expect(row.props.accessibilityState).toEqual({ checked: false })
    })

    it('the selection entry point is hidden while there is nothing to select', async () => {
      mockUseTransactions.mockReturnValue({ transactions: [], isLoading: false, error: null })

      const { queryByText } = await render(<Transactions />)
      expect(queryByText('בחירה')).toBeNull()
    })
  })
})
