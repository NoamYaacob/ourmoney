// Regression tests for two confirmed gaps found during the functional
// completeness audit:
//   1. transactions_delete RLS restricts hard delete to household admins
//      (useDeleteTransaction.ts's own header comment), but this screen used
//      to show the delete button/confirm-modal to every member regardless
//      of role, offering an action that always fails for non-admins with no
//      error surfaced on failure.
//   2. merchant name and shared/personal were collected at creation
//      (app/(app)/transactions/new.tsx) and supported by
//      useUpdateTransaction, but had no fields on this edit screen — once
//      created, a transaction's merchant/shared status was permanently
//      unreachable from the UI.
import { beforeEach, describe, expect, it, jest } from '@jest/globals'
import { fireEvent, render } from '@testing-library/react-native'
import '@/i18n'
import TransactionDetail from './[id]'

const mockRouterPush = jest.fn()
jest.mock('expo-router', () => ({
  useRouter: () => ({ back: jest.fn(), push: mockRouterPush }),
  useLocalSearchParams: () => ({ id: 'txn-1' }),
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
jest.mock('@/features/accounts/hooks/useAccounts', () => ({
  useAccounts: () => ({ accounts: [{ id: 'acct-1', name: 'עו״ש' }] }),
}))
jest.mock('@/features/categories/hooks/useCategories', () => ({
  useCategories: () => ({ categories: [{ id: 'cat-1', name_he: 'מזון', icon: '🍔' }] }),
}))
// Empty by default — most tests exercise a transaction with no provenance.
// Provenance-specific tests below override this per-run.
let mockRules: {
  id: string
  category_id: string
  field: 'description' | 'merchant_name'
  operator: 'contains' | 'equals' | 'starts_with'
  value: string
}[] = []
jest.mock('@/features/categories/hooks/useCategoryRules', () => ({
  useCategoryRules: () => ({ rules: mockRules }),
}))
jest.mock('@/features/transactions/hooks/useExcludeTransaction', () => ({
  useExcludeTransaction: () => ({ mutate: jest.fn(), isPending: false }),
}))

const mockUpdateMutate = jest.fn()
jest.mock('@/features/transactions/hooks/useUpdateTransaction', () => ({
  useUpdateTransaction: () => ({ mutate: mockUpdateMutate, isPending: false, isError: false }),
}))

const mockDeleteMutate = jest.fn()
let mockDeleteIsError = false
jest.mock('@/features/transactions/hooks/useDeleteTransaction', () => ({
  useDeleteTransaction: () => ({ mutate: mockDeleteMutate, isPending: false, isError: mockDeleteIsError }),
}))

const BASE_TRANSACTION = {
  id: 'txn-1',
  household_id: 'household-1',
  account_id: 'acct-1',
  category_id: 'cat-1',
  amount_agorot: -2000,
  description: 'קפה',
  merchant_name: 'ארומה',
  is_shared: true,
  is_excluded: false,
  txn_date: '2026-01-01',
  matched_rule_id: null as string | null,
}
// Reassignable per test — provenance tests below override matched_rule_id.
let mockTransaction = { ...BASE_TRANSACTION }
jest.mock('@/features/transactions/hooks/useTransaction', () => ({
  useTransaction: () => ({ transaction: mockTransaction, isLoading: false }),
}))

let mockRole: 'admin' | 'member' = 'admin'
jest.mock('@/features/household/hooks/useHousehold', () => ({
  useHousehold: () => ({ householdId: 'household-1', role: mockRole, isLoading: false }),
}))

describe('TransactionDetail', () => {
  beforeEach(() => {
    mockTransaction = { ...BASE_TRANSACTION }
    mockRules = []
    mockRouterPush.mockClear()
  })

  it('shows the delete button and confirm modal for an admin', async () => {
    mockRole = 'admin'
    const { getByText } = await render(<TransactionDetail />)
    expect(getByText('מחיקה')).toBeTruthy()
  })

  it('hides the delete button entirely for a non-admin member, since the delete would always fail server-side', async () => {
    mockRole = 'member'
    const { queryByText } = await render(<TransactionDetail />)
    expect(queryByText('מחיקה')).toBeNull()
  })

  it('shows a delete error message when the delete mutation fails', async () => {
    mockRole = 'admin'
    mockDeleteIsError = true
    const { getByText } = await render(<TransactionDetail />)
    expect(getByText('מחיקת התנועה נכשלה. נסו שוב')).toBeTruthy()
    mockDeleteIsError = false
  })

  it('prefills merchant name and shared status from the transaction, and includes them when saving', async () => {
    mockRole = 'admin'
    mockUpdateMutate.mockClear()
    const { getByDisplayValue, getByText } = await render(<TransactionDetail />)

    expect(getByDisplayValue('ארומה')).toBeTruthy()

    await fireEvent.press(getByText('אישית'))
    await fireEvent.press(getByText('שמירה'))

    expect(mockUpdateMutate).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'txn-1',
        merchantName: 'ארומה',
        isShared: false,
      }),
      expect.anything()
    )
  })

  it('shows rule provenance and navigates to the exact matched rule when matched_rule_id is set', async () => {
    mockTransaction = { ...BASE_TRANSACTION, matched_rule_id: 'rule-1' }
    mockRules = [{ id: 'rule-1', category_id: 'cat-1', field: 'merchant_name', operator: 'contains', value: 'ארומה' }]

    const { getByText } = await render(<TransactionDetail />)

    expect(getByText('סווג אוטומטית לפי הכלל')).toBeTruthy()
    const editRuleButton = getByText('עריכת הכלל')
    expect(editRuleButton).toBeTruthy()

    await fireEvent.press(editRuleButton)

    expect(mockRouterPush).toHaveBeenCalledWith({
      pathname: '/settings/categories',
      params: { editRuleId: 'rule-1' },
    })
  })

  it('does not send categoryId on an unrelated save, so matched_rule_id is not cleared for a save that never touched the category', async () => {
    mockTransaction = { ...BASE_TRANSACTION, matched_rule_id: 'rule-1' }
    mockRules = [{ id: 'rule-1', category_id: 'cat-1', field: 'merchant_name', operator: 'contains', value: 'ארומה' }]
    mockUpdateMutate.mockClear()

    const { getByText } = await render(<TransactionDetail />)
    await fireEvent.press(getByText('שמירה'))

    const [payload] = mockUpdateMutate.mock.calls[0] as [Record<string, unknown>, unknown]
    expect(payload.categoryId).toBeUndefined()
  })

  it('renders with no provenance block and no crash when matched_rule_id is null (never auto-categorized)', async () => {
    mockTransaction = { ...BASE_TRANSACTION, matched_rule_id: null }
    mockRules = []

    const { queryByText } = await render(<TransactionDetail />)

    expect(queryByText('סווג אוטומטית לפי הכלל')).toBeNull()
    expect(queryByText('עריכת הכלל')).toBeNull()
  })

  it('renders with no provenance block and no crash when matched_rule_id points at a since-deleted rule', async () => {
    mockTransaction = { ...BASE_TRANSACTION, matched_rule_id: 'rule-deleted' }
    // The rule is absent from the household's current rule list — the FK's
    // ON DELETE SET NULL means this specific combination shouldn't persist,
    // but the UI must still degrade cleanly if it's ever seen (stale cache,
    // race, etc.), never crash on a lookup miss.
    mockRules = []

    const { queryByText } = await render(<TransactionDetail />)

    expect(queryByText('סווג אוטומטית לפי הכלל')).toBeNull()
    expect(queryByText('עריכת הכלל')).toBeNull()
  })
})
