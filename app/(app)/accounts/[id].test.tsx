// Regression test for a confirmed gap found during the functional
// completeness audit: features/accounts/hooks/useUpdateAccount.ts was fully
// wired (query invalidation, partial-field update) but nothing in the app
// imported it — there was no edit entry point on this screen at all.
// Mirrors app/(app)/transactions/[id].test.tsx's established
// screen-testing pattern.
import { beforeEach, describe, expect, it, jest } from '@jest/globals'
import { fireEvent, render } from '@testing-library/react-native'
import '@/i18n'
import { formatILS } from '@/lib/money/format'
import AccountDetail from './[id]'

jest.mock('expo-router', () => ({
  useRouter: () => ({ back: jest.fn() }),
  useLocalSearchParams: () => ({ id: 'acct-1' }),
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
const mockUseHousehold = jest.fn(() => ({ householdId: 'household-1', role: 'admin', isLoading: false }))
jest.mock('@/features/household/hooks/useHousehold', () => ({
  useHousehold: () => mockUseHousehold(),
}))

const ACCOUNT = {
  id: 'acct-1',
  household_id: 'household-1',
  name: 'עו״ש בנק לאומי',
  type: 'checking',
  is_active: true,
  balance_agorot: 0, // dead column — deliberately not what the screen displays
  billing_cycle_day: null,
}
jest.mock('@/features/accounts/hooks/useAccounts', () => ({
  useAccounts: () => ({ accounts: [ACCOUNT], isLoading: false }),
}))
jest.mock('@/features/accounts/hooks/useAccountBalances', () => ({
  useAccountBalances: () => ({ balances: { 'acct-1': 543200 }, isLoading: false }),
}))
jest.mock('@/features/accounts/hooks/useCreditCardCycleSpend', () => ({
  useCreditCardCycleSpend: () => ({ spendAgorot: null, range: null, isLoading: false, error: null }),
}))
const mockArchiveMutate = jest.fn(
  (_id: unknown, callbacks?: { onSuccess?: () => void; onError?: (error: unknown) => void }) => {
    callbacks?.onSuccess?.()
  }
)
jest.mock('@/features/accounts/hooks/useArchiveAccount', () => ({
  useArchiveAccount: () => ({ mutate: mockArchiveMutate, isPending: false }),
}))
jest.mock('@/features/accounts/hooks/useDeleteAccount', () => ({
  useDeleteAccount: () => ({ mutate: jest.fn(), isPending: false, isError: false }),
}))

const mockUpdateMutate = jest.fn()
jest.mock('@/features/accounts/hooks/useUpdateAccount', () => ({
  useUpdateAccount: () => ({ mutate: mockUpdateMutate, isPending: false, isError: false }),
}))

describe('AccountDetail', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockUseHousehold.mockReturnValue({ householdId: 'household-1', role: 'admin', isLoading: false })
  })

  it('renders the edit form prefilled with the account name', async () => {
    const { getByDisplayValue } = await render(<AccountDetail />)
    expect(getByDisplayValue('עו״ש בנק לאומי')).toBeTruthy()
  })

  it('shows the live computed balance, not the dead balance_agorot column', async () => {
    const { getByText } = await render(<AccountDetail />)
    expect(getByText(formatILS(543200))).toBeTruthy()
  })

  it('saves an edited name via useUpdateAccount with the correct id and type', async () => {
    mockUpdateMutate.mockClear()
    const { getByDisplayValue, getByText } = await render(<AccountDetail />)

    const nameInput = getByDisplayValue('עו״ש בנק לאומי')
    await fireEvent.changeText(nameInput, 'חשבון עו״ש חדש')
    await fireEvent.press(getByText('שמירה'))

    expect(mockUpdateMutate).toHaveBeenCalledWith({
      id: 'acct-1',
      name: 'חשבון עו״ש חדש',
      type: 'checking',
      billingCycleDay: null,
    })
  })

  // Regression: accounts_delete RLS is admin-only (is_household_admin), but
  // the delete button was rendered unconditionally regardless of the
  // caller's own role — a non-admin saw a fully actionable destructive
  // control that would inevitably fail server-side. Mirrors Settings'
  // existing admin-gating pattern for household rename/remove-member.
  it('shows the delete button to an admin', async () => {
    mockUseHousehold.mockReturnValue({ householdId: 'household-1', role: 'admin', isLoading: false })
    const { getByText } = await render(<AccountDetail />)
    expect(getByText('מחיקה')).toBeTruthy()
  })

  it('hides the delete button from a non-admin member', async () => {
    mockUseHousehold.mockReturnValue({ householdId: 'household-1', role: 'member', isLoading: false })
    const { queryByText } = await render(<AccountDetail />)
    expect(queryByText('מחיקה')).toBeNull()
  })

  // UX-completeness audit P1 fix: archiving hides an account from every
  // future transaction/transfer picker — a single un-confirmed tap for an
  // action with that much reach was inconsistent with delete's existing
  // confirm modal on the very same screen.
  it('requires confirmation before archiving, matching the delete button\'s own confirm modal', async () => {
    const { getByText, getAllByText } = await render(<AccountDetail />)

    await fireEvent.press(getByText('העברה לארכיון'))
    expect(mockArchiveMutate).not.toHaveBeenCalled()

    const confirmButtons = getAllByText('העברה לארכיון')
    await fireEvent.press(confirmButtons[confirmButtons.length - 1]!)

    expect(mockArchiveMutate).toHaveBeenCalledWith('acct-1', expect.anything())
  })

  it('lets the archive confirmation be cancelled without archiving', async () => {
    const { getByText } = await render(<AccountDetail />)

    await fireEvent.press(getByText('העברה לארכיון'))
    await fireEvent.press(getByText('ביטול'))

    expect(mockArchiveMutate).not.toHaveBeenCalled()
  })
})
