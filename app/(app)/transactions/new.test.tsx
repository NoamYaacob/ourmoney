// Design Phase 2 regression coverage for the redesigned Add Transaction
// screen — every field/validation/submit call is unchanged from Phase 1
// (app/(app)/transactions/new.tsx's own header comment), only the
// presentation changed (SegmentedControl instead of Chip pairs, AmountField
// instead of a plain Input, Select's 'row' variant for account/category).
// These tests exercise the NEW controls but assert on the SAME underlying
// behavior: the exact mutate() payload, the exact validation error copy.
import { beforeEach, describe, expect, it, jest } from '@jest/globals'
import { fireEvent, render, waitFor } from '@testing-library/react-native'
import '@/i18n'
import NewTransaction from './new'

jest.mock('expo-router', () => ({
  useRouter: () => ({ back: jest.fn(), push: jest.fn() }),
}))
// Avoids a deep, environment-specific import chain
// (@expo/vector-icons -> expo-font -> expo-asset) unrelated to what this
// test verifies — same rationale as transactions/[id].test.tsx's identical
// mock (Select/AmountField/the account-icon badge all render an Ionicons
// glyph in this screen now).
jest.mock('@expo/vector-icons', () => ({
  Ionicons: () => null,
}))
jest.mock('@/features/auth/hooks/useAuth', () => ({
  useAuth: () => ({ user: { id: 'user-1' } }),
}))
jest.mock('@/features/household/hooks/useHousehold', () => ({
  useHousehold: () => ({ householdId: 'household-1', isLoading: false }),
}))
jest.mock('@/features/household/hooks/useHouseholdMembers', () => ({
  useHouseholdMembers: () => ({ members: [{ userId: 'user-1', displayName: 'נועם', role: 'admin' }] }),
}))
jest.mock('@/features/accounts/hooks/useAccounts', () => ({
  useAccounts: () => ({
    accounts: [
      { id: 'acct-1', name: 'עו״ש', type: 'checking' },
      { id: 'acct-2', name: 'מזומן', type: 'cash' },
    ],
    isLoading: false,
  }),
}))
jest.mock('@/features/categories/hooks/useCategories', () => ({
  useCategories: () => ({
    categories: [
      { id: 'cat-1', name_he: 'מזון וסופרמרקט', icon: '🛒', is_income: false },
      { id: 'cat-2', name_he: 'משכורת', icon: '💼', is_income: true },
    ],
    isLoading: false,
  }),
}))

const mockCreateMutate = jest.fn()
let mockIsPending = false
let mockIsError = false
jest.mock('@/features/transactions/hooks/useCreateTransaction', () => ({
  useCreateTransaction: () => ({ mutate: mockCreateMutate, isPending: mockIsPending, isError: mockIsError }),
}))

async function fillRequiredFields(getByLabelText: Awaited<ReturnType<typeof render>>['getByLabelText'], amount = '50') {
  await fireEvent.changeText(getByLabelText('סכום'), amount)
  await fireEvent.changeText(getByLabelText('תיאור'), 'קניות בסופר')
}

describe('NewTransaction (Add Transaction)', () => {
  beforeEach(() => {
    mockCreateMutate.mockClear()
    mockIsPending = false
    mockIsError = false
  })

  it('defaults to expense, and submits a negative signed amount', async () => {
    const { getByLabelText, getByText } = await render(<NewTransaction />)

    await fillRequiredFields(getByLabelText)
    await fireEvent.press(getByText('שמירת תנועה'))

    expect(mockCreateMutate).toHaveBeenCalledWith(
      expect.objectContaining({ amountAgorot: -5000, accountId: 'acct-1', isShared: true }),
      expect.anything()
    )
  })

  it('switches to income via the segmented control and submits a positive signed amount', async () => {
    const { getByLabelText, getByText } = await render(<NewTransaction />)

    await fireEvent.press(getByText('הכנסה'))
    await fillRequiredFields(getByLabelText)
    await fireEvent.press(getByText('שמירת תנועה'))

    expect(mockCreateMutate).toHaveBeenCalledWith(expect.objectContaining({ amountAgorot: 5000 }), expect.anything())
  })

  it('switches to personal via the shared/personal segmented control and submits isShared: false', async () => {
    const { getByLabelText, getByText } = await render(<NewTransaction />)

    await fireEvent.press(getByText('אישית'))
    await fillRequiredFields(getByLabelText)
    await fireEvent.press(getByText('שמירת תנועה'))

    expect(mockCreateMutate).toHaveBeenCalledWith(expect.objectContaining({ isShared: false }), expect.anything())
  })

  it('selects a category from the bottom sheet and submits its id, auto-switching to income for an income category', async () => {
    const { getByLabelText, getByText } = await render(<NewTransaction />)

    await fireEvent.press(getByLabelText('קטגוריה (אופציונלי)'))
    await fireEvent.press(getByText('משכורת'))

    await fillRequiredFields(getByLabelText)
    await fireEvent.press(getByText('שמירת תנועה'))

    expect(mockCreateMutate).toHaveBeenCalledWith(
      expect.objectContaining({ categoryId: 'cat-2', amountAgorot: 5000 }),
      expect.anything()
    )
  })

  it('shows a validation error and does not submit when the amount is missing', async () => {
    const { getByLabelText, getByText } = await render(<NewTransaction />)

    await fireEvent.changeText(getByLabelText('תיאור'), 'קניות בסופר')
    await fireEvent.press(getByText('שמירת תנועה'))

    await waitFor(() => expect(getByText('יש להזין סכום תקין')).toBeTruthy())
    expect(mockCreateMutate).not.toHaveBeenCalled()
  })
})
