// Checkpoint 7 regression test — before this fix, this screen showed the
// edited amount twice: once live in the (now AmountField) input, and once
// in a second, static caption at the bottom of the screen that read
// straight from the originally-loaded `transfer` object and never updated
// from the live draft. Editing the amount and looking down the page showed
// the OLD figure still printed, reading as "my edit didn't take" even
// though the mutation payload was correct. The fix removed the stale
// duplicate outright — this test proves it can never come back silently.
import { beforeEach, describe, expect, it, jest } from '@jest/globals'
import { fireEvent, render } from '@testing-library/react-native'
import '@/i18n'
import { formatILS } from '@/lib/money/format'
import TransferDetail from './[id]'

jest.mock('expo-router', () => ({
  useRouter: () => ({ back: jest.fn() }),
  useLocalSearchParams: () => ({ id: 'tr-1' }),
}))
// Avoids a deep, environment-specific import chain
// (@expo/vector-icons -> expo-font -> expo-asset) unrelated to what this
// test verifies — same rationale as every other screen test in this repo.
jest.mock('@expo/vector-icons', () => ({
  Ionicons: () => null,
}))
jest.mock('@/features/auth/hooks/useAuth', () => ({
  useAuth: () => ({ user: { id: 'user-1' } }),
}))
jest.mock('@/features/household/hooks/useHousehold', () => ({
  useHousehold: () => ({ householdId: 'household-1', role: 'admin', isLoading: false }),
}))

const ACCOUNTS = [
  { id: 'acc-checking', household_id: 'household-1', name: 'עו״ש לאומי', type: 'checking', is_active: true },
  { id: 'acc-savings', household_id: 'household-1', name: 'קרן השתלמות', type: 'savings', is_active: true },
]
jest.mock('@/features/accounts/hooks/useAccounts', () => ({
  useAccounts: () => ({ accounts: ACCOUNTS }),
}))

const TRANSFER = {
  id: 'tr-1',
  household_id: 'household-1',
  from_account_id: 'acc-checking',
  to_account_id: 'acc-savings',
  amount_agorot: 200_000, // ₪2,000.00
  txn_date: '2026-08-05',
  description: 'העברה לחיסכון',
}
jest.mock('@/features/transactions/hooks/useTransfer', () => ({
  useTransfer: () => ({ transfer: TRANSFER, isLoading: false, error: null }),
}))

const mockUpdateMutate = jest.fn()
jest.mock('@/features/transactions/hooks/useUpdateTransfer', () => ({
  useUpdateTransfer: () => ({ mutate: mockUpdateMutate, isPending: false, isError: false }),
}))
jest.mock('@/features/transactions/hooks/useDeleteTransfer', () => ({
  useDeleteTransfer: () => ({ mutate: jest.fn(), isPending: false, isError: false }),
}))

describe('TransferDetail', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('prefills the amount field with the loaded transfer amount', async () => {
    const { getByDisplayValue } = await render(<TransferDetail />)
    expect(getByDisplayValue('2000')).toBeTruthy()
  })

  it('updates the visible amount when edited, with no stale second display of the old figure', async () => {
    const { getByDisplayValue, queryByText } = await render(<TransferDetail />)

    await fireEvent.changeText(getByDisplayValue('2000'), '3500')

    // The live field reflects the edit...
    expect(getByDisplayValue('3500')).toBeTruthy()
    // ...and the screen no longer shows the old amount anywhere — this is
    // the exact regression: a second, non-live caption re-printing
    // formatILS(transfer.amount_agorot) regardless of what was typed.
    expect(queryByText(formatILS(200_000))).toBeNull()
  })

  it('saves the live edited amount, not the originally-loaded one', async () => {
    const { getByDisplayValue, getByText } = await render(<TransferDetail />)

    await fireEvent.changeText(getByDisplayValue('2000'), '3500')
    await fireEvent.press(getByText('שמירה'))

    expect(mockUpdateMutate).toHaveBeenCalledWith(
      expect.objectContaining({ transferId: 'tr-1', amountAgorot: 350_000 }),
      expect.anything()
    )
  })
})
