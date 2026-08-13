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
jest.mock('@/features/accounts/hooks/useAccountBalances', () => ({
  useAccountBalances: () => ({ balances: { 'acct-1': 543200 }, isLoading: false }),
}))

describe('Accounts list', () => {
  beforeEach(() => {
    mockCreateAccountMutate.mockClear()
    mockUseAccounts.mockReturnValue({ accounts: [ACTIVE_ACCOUNT, ARCHIVED_ACCOUNT], isLoading: false, error: null })
  })

  it('shows the live computed balance for an account, not the dead balance_agorot column', async () => {
    const { getByText } = await render(<Accounts />)
    expect(getByText(formatILS(543200))).toBeTruthy()
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
      { householdId: 'household-1', name: 'קופת חיסכון', type: 'investment' },
      expect.anything()
    )
  })
})
