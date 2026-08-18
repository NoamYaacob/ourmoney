// Migration 008 (ADR-035) — the transfer detail/edit screen. Mirrors
// transactions/[id].test.tsx and accounts/[id].test.tsx's established
// screen-testing pattern (role-gated delete, prefilled edit form).
import { beforeEach, describe, expect, it, jest } from '@jest/globals'
import { fireEvent, render } from '@testing-library/react-native'
import '@/i18n'
import { formatILS } from '@/lib/money/format'
import TransferDetail from './[id]'

const mockRouterBack = jest.fn()
jest.mock('expo-router', () => ({
  useRouter: () => ({ back: mockRouterBack, push: jest.fn() }),
  useLocalSearchParams: () => ({ id: 'transfer-1' }),
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
const mockUseHousehold = jest.fn(() => ({ householdId: 'household-1', role: 'admin', isLoading: false }))
jest.mock('@/features/household/hooks/useHousehold', () => ({
  useHousehold: () => mockUseHousehold(),
}))
jest.mock('@/features/accounts/hooks/useAccounts', () => ({
  useAccounts: () => ({
    accounts: [
      { id: 'acct-checking', name: 'עו״ש', type: 'checking' },
      { id: 'acct-savings', name: 'חיסכון', type: 'savings' },
    ],
    isLoading: false,
  }),
}))

const TRANSFER = {
  id: 'transfer-1',
  household_id: 'household-1',
  from_account_id: 'acct-checking',
  to_account_id: 'acct-savings',
  amount_agorot: 50000,
  txn_date: '2026-08-15',
  description: 'העברה לחיסכון',
}
jest.mock('@/features/transactions/hooks/useTransfer', () => ({
  useTransfer: () => ({ transfer: TRANSFER, isLoading: false }),
}))

const mockUpdateMutate = jest.fn()
jest.mock('@/features/transactions/hooks/useUpdateTransfer', () => ({
  useUpdateTransfer: () => ({ mutate: mockUpdateMutate, isPending: false, isError: false }),
}))

const mockDeleteMutate = jest.fn()
let mockDeleteIsError = false
jest.mock('@/features/transactions/hooks/useDeleteTransfer', () => ({
  useDeleteTransfer: () => ({ mutate: mockDeleteMutate, isPending: false, isError: mockDeleteIsError }),
}))

describe('TransferDetail', () => {
  beforeEach(() => {
    mockUseHousehold.mockReturnValue({ householdId: 'household-1', role: 'admin', isLoading: false })
    mockUpdateMutate.mockClear()
    mockDeleteMutate.mockClear()
    mockDeleteIsError = false
    mockRouterBack.mockClear()
  })

  it('renders the edit form prefilled with the description and amount', async () => {
    const { getByDisplayValue } = await render(<TransferDetail />)
    expect(getByDisplayValue('העברה לחיסכון')).toBeTruthy()
    expect(getByDisplayValue('500')).toBeTruthy()
  })

  it('shows the transfer amount', async () => {
    const { getByText } = await render(<TransferDetail />)
    expect(getByText(formatILS(50000))).toBeTruthy()
  })

  it('saves an edit via useUpdateTransfer with every field, not a partial patch', async () => {
    const { getByDisplayValue, getByText } = await render(<TransferDetail />)

    const descriptionInput = getByDisplayValue('העברה לחיסכון')
    await fireEvent.changeText(descriptionInput, 'העברה מעודכנת')
    await fireEvent.press(getByText('שמירה'))

    expect(mockUpdateMutate).toHaveBeenCalledWith(
      {
        transferId: 'transfer-1',
        householdId: 'household-1',
        fromAccountId: 'acct-checking',
        toAccountId: 'acct-savings',
        amountAgorot: 50000,
        txnDate: '2026-08-15',
        description: 'העברה מעודכנת',
      },
      expect.anything()
    )
  })

  // delete_transfer() is admin-only server-side (matches
  // useDeleteTransaction.ts's admin-gated hard delete) — the button must be
  // hidden, not merely disabled, for a non-admin.
  it('shows the delete button to an admin', async () => {
    mockUseHousehold.mockReturnValue({ householdId: 'household-1', role: 'admin', isLoading: false })
    const { getByText } = await render(<TransferDetail />)
    expect(getByText('מחיקה')).toBeTruthy()
  })

  it('hides the delete button from a non-admin member', async () => {
    mockUseHousehold.mockReturnValue({ householdId: 'household-1', role: 'member', isLoading: false })
    const { queryByText } = await render(<TransferDetail />)
    expect(queryByText('מחיקה')).toBeNull()
  })

  it('shows a delete error message when the delete mutation fails', async () => {
    mockDeleteIsError = true
    const { getByText } = await render(<TransferDetail />)
    expect(getByText('מחיקת ההעברה נכשלה. נסו שוב')).toBeTruthy()
  })
})
