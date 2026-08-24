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
    mockUseAccounts.mockReturnValue({ accounts: [ACTIVE_ACCOUNT, ARCHIVED_ACCOUNT], isLoading: false, error: null, hasData: true })
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
    // One rendering now, not two. The screen used to draw a flat list for
    // the phone and grouped sections for desktop, so every account appeared
    // twice in the tree; both design files group them identically, so the
    // grouping is shared and each account is rendered exactly once.
    expect(getAllByText('בארכיון').length).toBe(1)
  })

  // Design Phase 3 coverage: the empty state and the add-account flow
  // (name validation + type selection via the polished bottom sheet)
  // weren't covered before this phase.
  it('shows the empty state (and still offers the persistent add-account CTA) when there are no accounts', async () => {
    mockUseAccounts.mockReturnValue({ accounts: [], isLoading: false, error: null, hasData: true })

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
  // Desktop Claude Design pass: the pre-redesign desktop screen used a flat
  // 2-column card grid; the mockup instead groups accounts by what they
  // mean financially — liquid (checking/cash), owed (credit cards),
  // illiquid (everything else) — matching the exact same
  // isEligibleCashAccount boundary Safe-to-Spend already uses for
  // "liquid." ACTIVE_ACCOUNT (type: checking) belongs in the liquid group.
  it('groups the account list by liquid/owed/illiquid on both platforms', async () => {
    const { getAllByText } = await render(<Accounts />)

    const liquidHeadings = getAllByText(/כסף נוזלי/)
    const accountNames = getAllByText(ACTIVE_ACCOUNT.name)
    // One heading, and the checking account under it exactly once.
    expect(liquidHeadings).toHaveLength(1)
    expect(accountNames).toHaveLength(1)
  })

  it('never shows the "owed" (credit card) heading when the household has no credit-card accounts', async () => {
    const { queryByText } = await render(<Accounts />)

    expect(queryByText(/כסף שחייבים/)).toBeNull()
  })

  // Visual QA + Desktop Polish pass: the desktop-only total-balance summary
  // card sums `balances` over active accounts only. A fixture with a single
  // active account (the suite's default) can't distinguish "correctly
  // excludes archived" from "incorrectly includes archived with a balance
  // that happens to default to 0" — this uses two active accounts plus an
  // archived account with a large, distinct nonzero balance so an
  // archived-inclusive bug would produce a visibly wrong, distinguishable sum.
  it('sums only active accounts into the desktop summary card\'s net-worth line, excluding the archived account', async () => {
    mockUseAccounts.mockReturnValue({
      accounts: [
        { ...ACTIVE_ACCOUNT, id: 'acct-1' },
        { ...ACTIVE_ACCOUNT, id: 'acct-4', name: 'עו״ש בנק הפועלים' },
        ARCHIVED_ACCOUNT,
      ],
      isLoading: false,
      error: null,
      hasData: true,
    })
    mockUseAccountBalances.mockReturnValue({
      balances: { 'acct-1': 10000, 'acct-4': 20000, 'acct-2': 999900 },
      isLoading: false,
    })

    const { getByText, queryByText } = await render(<Accounts />)

    expect(getByText(formatILS(30000), { exact: false })).toBeTruthy()
    // The archived-account-inclusive (wrong) sum would be 1029900 — must never appear.
    expect(queryByText(formatILS(1029900), { exact: false })).toBeNull()
  })
})
