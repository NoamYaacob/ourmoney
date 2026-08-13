// Regression test for a confirmed gap found during the functional
// completeness audit: features/accounts/hooks/useUpdateAccount.ts was fully
// wired (query invalidation, partial-field update) but nothing in the app
// imported it — there was no edit entry point on this screen at all.
// Mirrors app/(app)/transactions/[id].test.tsx's established
// screen-testing pattern.
import { describe, expect, it, jest } from '@jest/globals'
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
jest.mock('@/features/household/hooks/useHousehold', () => ({
  useHousehold: () => ({ householdId: 'household-1', role: 'admin', isLoading: false }),
}))

const ACCOUNT = {
  id: 'acct-1',
  household_id: 'household-1',
  name: 'עו״ש בנק לאומי',
  type: 'checking',
  is_active: true,
  balance_agorot: 0, // dead column — deliberately not what the screen displays
}
jest.mock('@/features/accounts/hooks/useAccounts', () => ({
  useAccounts: () => ({ accounts: [ACCOUNT], isLoading: false }),
}))
jest.mock('@/features/accounts/hooks/useAccountBalances', () => ({
  useAccountBalances: () => ({ balances: { 'acct-1': 543200 }, isLoading: false }),
}))
jest.mock('@/features/accounts/hooks/useArchiveAccount', () => ({
  useArchiveAccount: () => ({ mutate: jest.fn(), isPending: false }),
}))
jest.mock('@/features/accounts/hooks/useDeleteAccount', () => ({
  useDeleteAccount: () => ({ mutate: jest.fn(), isPending: false, isError: false }),
}))

const mockUpdateMutate = jest.fn()
jest.mock('@/features/accounts/hooks/useUpdateAccount', () => ({
  useUpdateAccount: () => ({ mutate: mockUpdateMutate, isPending: false, isError: false }),
}))

describe('AccountDetail', () => {
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
    })
  })
})
