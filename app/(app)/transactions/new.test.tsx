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
const mockUseAccounts = jest.fn(() => ({
  accounts: [
    { id: 'acct-1', name: 'עו״ש', type: 'checking', is_active: true },
    { id: 'acct-2', name: 'מזומן', type: 'cash', is_active: true },
  ],
  isLoading: false,
}))
jest.mock('@/features/accounts/hooks/useAccounts', () => ({
  useAccounts: () => mockUseAccounts(),
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

const mockCreateTransferMutate = jest.fn()
let mockTransferIsPending = false
let mockTransferIsError = false
jest.mock('@/features/transactions/hooks/useCreateTransfer', () => ({
  useCreateTransfer: () => ({
    mutate: mockCreateTransferMutate,
    isPending: mockTransferIsPending,
    isError: mockTransferIsError,
  }),
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
    mockCreateTransferMutate.mockClear()
    mockTransferIsPending = false
    mockTransferIsError = false
    mockUseAccounts.mockReturnValue({
      accounts: [
        { id: 'acct-1', name: 'עו״ש', type: 'checking', is_active: true },
        { id: 'acct-2', name: 'מזומן', type: 'cash', is_active: true },
      ],
      isLoading: false,
    })
  })

  // UX-completeness audit P1 fix: archived (is_active: false) accounts were
  // still offered — and could even be silently auto-selected as the
  // default — in the account/transfer pickers on this screen, even though
  // an archived account is meant to be hidden from new activity (matching
  // accounts/[id].tsx's own archive-confirm copy: "יוסתר מרשימת החשבונות
  // לבחירה בתנועות חדשות"). accounts/index.tsx and accounts/[id].tsx
  // intentionally keep showing archived accounts for history/unarchive —
  // only this screen's pickers exclude them.
  it('excludes an archived account from the account picker and its default selection', async () => {
    mockUseAccounts.mockReturnValue({
      accounts: [
        { id: 'acct-1', name: 'עו״ש', type: 'checking', is_active: false },
        { id: 'acct-2', name: 'מזומן', type: 'cash', is_active: true },
      ],
      isLoading: false,
    })
    const { getByLabelText, getByText, queryByText } = await render(<NewTransaction />)

    await fillRequiredFields(getByLabelText)
    await fireEvent.press(getByText('שמירת תנועה'))

    expect(mockCreateMutate).toHaveBeenCalledWith(expect.objectContaining({ accountId: 'acct-2' }), expect.anything())

    // The archived account never appears as a choosable option at all.
    await fireEvent.press(getByLabelText('חשבון'))
    expect(queryByText('עו״ש')).toBeNull()
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

  // Migration 008 (ADR-035) — transfer mode.
  describe('transfer mode', () => {
    it('switches to transfer via the segmented control and calls useCreateTransfer, never useCreateTransaction', async () => {
      const { getByLabelText, getByText } = await render(<NewTransaction />)

      await fireEvent.press(getByText('העברה'))
      await fillRequiredFields(getByLabelText, '500')
      await fireEvent.press(getByText('שמירת תנועה'))

      expect(mockCreateTransferMutate).toHaveBeenCalledWith(
        expect.objectContaining({
          householdId: 'household-1',
          fromAccountId: 'acct-1',
          toAccountId: 'acct-2',
          amountAgorot: 50000,
          description: 'קניות בסופר',
        }),
        expect.anything()
      )
      expect(mockCreateMutate).not.toHaveBeenCalled()
    })

    it('hides category, shared/personal, and merchant fields in transfer mode', async () => {
      const { getByText, queryByLabelText, queryByText } = await render(<NewTransaction />)

      await fireEvent.press(getByText('העברה'))

      expect(queryByLabelText('קטגוריה (אופציונלי)')).toBeNull()
      expect(queryByText('משותפת')).toBeNull()
      expect(queryByText('אישית')).toBeNull()
      expect(queryByLabelText('בית עסק (אופציונלי)')).toBeNull()
      expect(queryByLabelText('מהחשבון')).toBeTruthy()
      expect(queryByLabelText('לחשבון')).toBeTruthy()
    })

    it('shows a validation error and does not submit when the amount is missing, in transfer mode too', async () => {
      const { getByLabelText, getByText } = await render(<NewTransaction />)

      await fireEvent.press(getByText('העברה'))
      await fireEvent.changeText(getByLabelText('תיאור'), 'העברה לחיסכון')
      await fireEvent.press(getByText('שמירת תנועה'))

      await waitFor(() => expect(getByText('יש להזין סכום תקין')).toBeTruthy())
      expect(mockCreateTransferMutate).not.toHaveBeenCalled()
    })

    it('switching back to expense restores the category/shared fields and submits via useCreateTransaction again', async () => {
      const { getByLabelText, getByText, queryByLabelText } = await render(<NewTransaction />)

      await fireEvent.press(getByText('העברה'))
      await fireEvent.press(getByText('הוצאה'))

      expect(queryByLabelText('קטגוריה (אופציונלי)')).toBeTruthy()

      await fillRequiredFields(getByLabelText)
      await fireEvent.press(getByText('שמירת תנועה'))

      expect(mockCreateMutate).toHaveBeenCalledWith(expect.objectContaining({ amountAgorot: -5000 }), expect.anything())
      expect(mockCreateTransferMutate).not.toHaveBeenCalled()
    })
  })

  // Responsive/desktop pass: unlike the dashboard/list screens, this form
  // must stay a narrow, centered column on desktop rather than stretching
  // across a wide browser window (see new.tsx's `width="narrow"` prop).
  it('keeps the form in the narrow content-width variant, not the wide dashboard/list one', async () => {
    const { getByText } = await render(<NewTransaction />)

    const scrollView = getByText('תנועה חדשה').parent?.parent
    const contentClassName = scrollView?.props.contentContainerClassName as string
    expect(contentClassName).toContain('max-w-[600px]')
    expect(contentClassName).not.toContain('max-w-[1150px]')
  })
})
