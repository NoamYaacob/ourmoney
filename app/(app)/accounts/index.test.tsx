// Regression tests for two confirmed gaps found during the functional
// completeness audit:
//   1. accounts.balance_agorot is a dead column nothing ever updates — this
//      list used to display it directly via formatILS, permanently showing
//      ₪0 regardless of real transaction activity. It now displays a
//      live-computed balance instead.
//   2. Archived accounts (is_active: false) rendered identically to active
//      ones — no visual marker distinguishing them in the list.
import { beforeEach, describe, expect, it, jest } from '@jest/globals'
import { fireEvent, render } from '@testing-library/react-native'
import '@/i18n'
import { formatILS } from '@/lib/money/format'
import Accounts from './index'

jest.mock('expo-router', () => ({
  useRouter: () => ({ push: jest.fn() }),
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
const mockCreateAccountMutate = jest.fn()
jest.mock('@/features/accounts/hooks/useCreateAccount', () => ({
  useCreateAccount: () => ({ mutate: mockCreateAccountMutate, isPending: false, isError: false }),
}))

const ACTIVE_ACCOUNT = {
  id: 'acct-1',
  name: 'עו״ש בנק לאומי',
  type: 'checking',
  is_active: true,
  balance_agorot: 0, // dead column — deliberately not what the screen displays
}
const ARCHIVED_ACCOUNT = {
  id: 'acct-2',
  name: 'חשבון ישן',
  type: 'savings',
  is_active: false,
  balance_agorot: 0,
}
const mockUseAccounts = jest.fn()
jest.mock('@/features/accounts/hooks/useAccounts', () => ({
  useAccounts: () => mockUseAccounts(),
}))
const mockUseAccountBalances = jest.fn()
jest.mock('@/features/accounts/hooks/useAccountBalances', () => ({
  useAccountBalances: () => mockUseAccountBalances(),
}))

describe('Accounts list', () => {
  beforeEach(() => {
    mockCreateAccountMutate.mockClear()
    mockUseAccounts.mockReturnValue({ accounts: [ACTIVE_ACCOUNT, ARCHIVED_ACCOUNT], isLoading: false, error: null })
    mockUseAccountBalances.mockReturnValue({ balances: { 'acct-1': 543200 }, isLoading: false })
  })

  it('shows the live computed balance for an account, not the dead balance_agorot column', async () => {
    const { getAllByText } = await render(<Accounts />)
    // Visual QA + Desktop Polish pass: the desktop-only total-balance
    // summary card (accounts/index.tsx) sums the same active-account
    // balances as the row below it, so with a single active account the
    // identical formatted figure can legitimately appear twice (row +
    // summary) — getAllByText, not getByText, so this doesn't assume
    // whether that second desktop-only element renders in this test's
    // non-web render environment.
    expect(getAllByText(formatILS(543200)).length).toBeGreaterThan(0)
  })

  it('defaults an account with no transactions to a zero balance rather than nothing', async () => {
    const { getAllByText } = await render(<Accounts />)
    // ARCHIVED_ACCOUNT has no entry in the mocked balances map.
    expect(getAllByText(formatILS(0)).length).toBeGreaterThan(0)
  })

  it('shows an archived badge for the inactive account only — the active account renders with none', async () => {
    const { getAllByText } = await render(<Accounts />)
    // Two accounts are rendered (one active, one archived); exactly one
    // "archived" badge must appear, proving the active account gets none.
    expect(getAllByText('בארכיון').length).toBe(1)
  })

  // Design Phase 3 coverage: the empty state and the add-account flow
  // (name validation + type selection via the polished bottom sheet)
  // weren't covered before this phase.
  it('shows the empty state (and still offers the persistent add-account CTA) when there are no accounts', async () => {
    mockUseAccounts.mockReturnValue({ accounts: [], isLoading: false, error: null })

    const { getByText } = await render(<Accounts />)

    expect(getByText('עדיין אין חשבונות.')).toBeTruthy()
    expect(getByText('הוספת חשבון')).toBeTruthy()
  })

  it('does not submit when the account name is blank', async () => {
    const { getByText } = await render(<Accounts />)

    await fireEvent.press(getByText('הוספת חשבון'))
    await fireEvent.press(getByText('הוספת חשבון'))

    expect(mockCreateAccountMutate).not.toHaveBeenCalled()
  })

  it('creates an account with the selected type from the type picker sheet', async () => {
    const { getByText, getByLabelText } = await render(<Accounts />)

    await fireEvent.press(getByText('הוספת חשבון'))
    await fireEvent.changeText(getByLabelText('שם החשבון'), 'קופת חיסכון')

    await fireEvent.press(getByLabelText('סוג חשבון'))
    await fireEvent.press(getByText('השקעות'))

    await fireEvent.press(getByText('הוספת חשבון'))

    expect(mockCreateAccountMutate).toHaveBeenCalledWith(
      { householdId: 'household-1', name: 'קופת חיסכון', type: 'investment', billingCycleDay: null },
      expect.anything()
    )
  })

  it('does not show a billing-cycle-day field for a non-credit_card type', async () => {
    const { getByText, queryByLabelText } = await render(<Accounts />)

    await fireEvent.press(getByText('הוספת חשבון'))
    expect(queryByLabelText('יום סגירת מחזור חיוב')).toBeNull()
  })

  it('creates a credit_card account with the entered billing cycle day', async () => {
    const { getByText, getByLabelText } = await render(<Accounts />)

    await fireEvent.press(getByText('הוספת חשבון'))
    await fireEvent.changeText(getByLabelText('שם החשבון'), 'ויזה כאל')
    await fireEvent.press(getByLabelText('סוג חשבון'))
    await fireEvent.press(getByText('כרטיס אשראי'))
    await fireEvent.changeText(getByLabelText('יום סגירת מחזור חיוב'), '10')
    await fireEvent.press(getByText('הוספת חשבון'))

    expect(mockCreateAccountMutate).toHaveBeenCalledWith(
      { householdId: 'household-1', name: 'ויזה כאל', type: 'credit_card', billingCycleDay: 10 },
      expect.anything()
    )
  })

  it('rejects a billing cycle day outside 1-28 without creating the account', async () => {
    const { getByText, getByLabelText } = await render(<Accounts />)

    await fireEvent.press(getByText('הוספת חשבון'))
    await fireEvent.changeText(getByLabelText('שם החשבון'), 'ויזה כאל')
    await fireEvent.press(getByLabelText('סוג חשבון'))
    await fireEvent.press(getByText('כרטיס אשראי'))
    await fireEvent.changeText(getByLabelText('יום סגירת מחזור חיוב'), '40')
    await fireEvent.press(getByText('הוספת חשבון'))

    expect(getByText('יום סגירת המחזור צריך להיות מספר שלם בין 1 ל-28')).toBeTruthy()
    expect(mockCreateAccountMutate).not.toHaveBeenCalled()
  })

  it('rejects a non-plain-digit billing cycle day (e.g. scientific notation) rather than silently coercing it via Number(...)', async () => {
    const { getByText, getByLabelText } = await render(<Accounts />)

    await fireEvent.press(getByText('הוספת חשבון'))
    await fireEvent.changeText(getByLabelText('שם החשבון'), 'ויזה כאל')
    await fireEvent.press(getByLabelText('סוג חשבון'))
    await fireEvent.press(getByText('כרטיס אשראי'))
    await fireEvent.changeText(getByLabelText('יום סגירת מחזור חיוב'), '1e1')
    await fireEvent.press(getByText('הוספת חשבון'))

    expect(getByText('יום סגירת המחזור צריך להיות מספר שלם בין 1 ל-28')).toBeTruthy()
    expect(mockCreateAccountMutate).not.toHaveBeenCalled()
  })

  // Desktop/RTL polish pass (real-browser regression): the 2-column wrap
  // grid declared plain flex-row (not flex-row-reverse), which native
  // auto-mirrors via Yoga under the forced-RTL flag but NativeWind's
  // web-compiled CSS does not — the first account (source order) must
  // render top-right, continuing the RTL reading order into the wrap.
  it('reverses the desktop 2-column account grid so the first account renders on the right', async () => {
    const { getByText } = await render(<Accounts />)

    // Climb from the account name up to its grid-item wrapper (the
    // Pressable carrying the w-[48%] column width), then one more level
    // to the shared grid container.
    let node = getByText(ACTIVE_ACCOUNT.name).parent
    while (node && !(node.props.className as string | undefined)?.includes('w-[48%]')) {
      node = node.parent
    }
    const gridContainer = node?.parent
    expect(gridContainer?.props.className as string).toContain('web:desktop:flex-row')
  })

  // Visual QA + Desktop Polish pass: the desktop-only total-balance summary
  // card sums `balances` over active accounts only. A fixture with a single
  // active account (the suite's default) can't distinguish "correctly
  // excludes archived" from "incorrectly includes archived with a balance
  // that happens to default to 0" — this uses two active accounts plus an
  // archived account with a large, distinct nonzero balance so an
  // archived-inclusive bug would produce a visibly wrong, distinguishable sum.
  it('sums only active accounts in the desktop total-balance summary, excluding the archived account', async () => {
    mockUseAccounts.mockReturnValue({
      accounts: [
        { ...ACTIVE_ACCOUNT, id: 'acct-1' },
        { ...ACTIVE_ACCOUNT, id: 'acct-4', name: 'עו״ש בנק הפועלים' },
        ARCHIVED_ACCOUNT,
      ],
      isLoading: false,
      error: null,
    })
    mockUseAccountBalances.mockReturnValue({
      balances: { 'acct-1': 10000, 'acct-4': 20000, 'acct-2': 999900 },
      isLoading: false,
    })

    const { getAllByText, queryAllByText } = await render(<Accounts />)

    expect(getAllByText(formatILS(30000)).length).toBeGreaterThan(0)
    // The archived-account-inclusive (wrong) sum would be 1029900 — must never appear.
    expect(queryAllByText(formatILS(1029900)).length).toBe(0)
  })
})
