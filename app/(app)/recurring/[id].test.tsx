// Regression tests for two confirmed gaps found during the functional
// completeness audit:
//   1. useUpdateRecurringTransaction already fully supports editing amount,
//      description, account, category, and frequency, but this screen only
//      ever called it with { isActive: !item.is_active } (pause/resume) —
//      there was no UI to edit those fields after creation.
//   2. The skip button was not disabled/hidden when the template was
//      paused (is_active: false); pressing it hit the RPC's not_found
//      branch and surfaced a generic error toast instead of the button
//      simply being unavailable.
// Also covers migration 009/ADR-036: pause/resume moved to its own narrow
// RPC hook, every mutation now carries expectedVersion, and a conflict
// surfaces the shared ConflictModal rather than a generic error.
import { beforeEach, describe, expect, it, jest } from '@jest/globals'
import { fireEvent, render, waitFor } from '@testing-library/react-native'
import '@/i18n'
import { ConcurrencyError } from '@/lib/mutations/concurrencyError'
import type { RecurringFrequency } from '@/types/app'
import RecurringDetail from './[id]'

jest.mock('expo-router', () => ({
  useRouter: () => ({ back: jest.fn() }),
  useLocalSearchParams: () => ({ id: 'rec-1' }),
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
jest.mock('@/features/accounts/hooks/useAccounts', () => ({
  useAccounts: () => ({ accounts: [{ id: 'acct-1', name: 'עו״ש' }], isLoading: false }),
}))
jest.mock('@/features/categories/hooks/useCategories', () => ({
  useCategories: () => ({
    categories: [{ id: 'cat-1', name_he: 'ארנונה וממשל', icon: '🏛️' }],
    isLoading: false,
  }),
}))

const BASE_ITEM = {
  id: 'rec-1',
  household_id: 'household-1',
  account_id: 'acct-1',
  category_id: 'cat-1',
  amount_agorot: -5000,
  description: 'ארנונה',
  is_shared: true,
  is_active: true,
  frequency: 'monthly' as RecurringFrequency,
  day_of_month: 1 as number | null,
  next_due_date: '2026-09-01',
  version: 1,
}
let mockItem = { ...BASE_ITEM }
const mockRefetch = jest.fn(async () => ({ data: [mockItem] }))
jest.mock('@/features/recurring/hooks/useRecurringTransactions', () => ({
  useRecurringTransactions: () => ({ recurringTransactions: [mockItem], isLoading: false, refetch: mockRefetch }),
}))

const mockUpdateMutate = jest.fn(
  (_variables: unknown, callbacks?: { onSuccess?: () => void; onError?: (error: unknown) => void }) => {
    callbacks?.onSuccess?.()
  }
)
jest.mock('@/features/recurring/hooks/useUpdateRecurringTransaction', () => ({
  useUpdateRecurringTransaction: () => ({ mutate: mockUpdateMutate, isPending: false, isError: false }),
}))

const mockSetActiveMutate = jest.fn(
  (_variables: unknown, callbacks?: { onSuccess?: () => void; onError?: (error: unknown) => void }) => {
    callbacks?.onSuccess?.()
  }
)
jest.mock('@/features/recurring/hooks/useSetRecurringTransactionActive', () => ({
  useSetRecurringTransactionActive: () => ({ mutate: mockSetActiveMutate, isPending: false }),
}))

const mockSkipMutate = jest.fn()
jest.mock('@/features/recurring/hooks/useSkipRecurringOccurrence', () => ({
  useSkipRecurringOccurrence: () => ({ mutate: mockSkipMutate, isPending: false }),
}))

jest.mock('@/features/recurring/hooks/useDeleteRecurringTransaction', () => ({
  useDeleteRecurringTransaction: () => ({ mutate: jest.fn(), isPending: false }),
}))

describe('RecurringDetail', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockItem = { ...BASE_ITEM }
  })

  // Fix 1 — edit is reachable, prefilled, and saves the right fields.
  it('reaches the edit form via the edit button, prefills it from the template, and saves amount/description/account/category/frequency edits along with the loaded version', async () => {
    const { getByText, getByDisplayValue } = await render(<RecurringDetail />)

    // Not reachable before pressing "edit" — proves this is real editing UI,
    // not always-on fields that happened to already exist.
    expect(() => getByDisplayValue('50')).toThrow()

    await fireEvent.press(getByText('עריכה'))

    // Prefilled from the template: amount as a positive ILS string (50.00
    // ILS from -5000 agorot), description, and the selected account/
    // category/frequency labels shown by the Select fields.
    expect(getByDisplayValue('50')).toBeTruthy()
    expect(getByDisplayValue('ארנונה')).toBeTruthy()
    expect(getByText('עו״ש')).toBeTruthy()
    expect(getByText('🏛️ ארנונה וממשל')).toBeTruthy()
    expect(getByText('חודשי')).toBeTruthy()

    // Actually edit two fields, then save.
    await fireEvent.changeText(getByDisplayValue('50'), '75')
    await fireEvent.changeText(getByDisplayValue('ארנונה'), 'ארנונה עירייה')

    await fireEvent.press(getByText('שמירה'))

    expect(mockUpdateMutate).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'rec-1',
        expectedVersion: 1,
        accountId: 'acct-1',
        categoryId: 'cat-1',
        amountAgorot: -7500,
        description: 'ארנונה עירייה',
        frequency: 'monthly',
      }),
      expect.anything()
    )
  })

  // UX-completeness audit P0 fix: advance_recurring_due_date() (migration
  // 003) computes LEAST(day_of_month, ...) for monthly/quarterly/yearly
  // frequencies — LEAST(NULL, x) is NULL in Postgres, so a NULL
  // day_of_month silently and permanently nulled next_due_date the moment
  // any edit round-tripped it unchanged. A row with day_of_month already
  // null (e.g. created before this fix, or via a path that never set it)
  // must have it backfilled from the currently-rendered next_due_date
  // instead of being sent through as null again.
  it('backfills a null day_of_month from next_due_date on save, for a monthly template, instead of sending null through again', async () => {
    mockItem = { ...BASE_ITEM, day_of_month: null, next_due_date: '2026-09-15' }
    const { getByText } = await render(<RecurringDetail />)

    await fireEvent.press(getByText('עריכה'))
    await fireEvent.press(getByText('שמירה'))

    expect(mockUpdateMutate).toHaveBeenCalledWith(
      expect.objectContaining({ frequency: 'monthly', dayOfMonth: 15 }),
      expect.anything()
    )
  })

  it('sends dayOfMonth: null for a weekly template, never backfilling it from next_due_date', async () => {
    mockItem = { ...BASE_ITEM, frequency: 'weekly', day_of_month: null, next_due_date: '2026-09-15' }
    const { getByText } = await render(<RecurringDetail />)

    await fireEvent.press(getByText('עריכה'))
    await fireEvent.press(getByText('שמירה'))

    expect(mockUpdateMutate).toHaveBeenCalledWith(
      expect.objectContaining({ frequency: 'weekly', dayOfMonth: null }),
      expect.anything()
    )
  })

  // UX-completeness audit P2 fix: the edit form previously sent
  // isShared: item.is_shared unconditionally — there was no field in the
  // form to actually change it, unlike the create form's identical
  // shared/personal chip pair.
  it('lets the shared/personal chip pair in the edit form override is_shared on save', async () => {
    mockItem = { ...BASE_ITEM, is_shared: true }
    const { getByText } = await render(<RecurringDetail />)

    await fireEvent.press(getByText('עריכה'))
    await fireEvent.press(getByText('אישית'))
    await fireEvent.press(getByText('שמירה'))

    expect(mockUpdateMutate).toHaveBeenCalledWith(expect.objectContaining({ isShared: false }), expect.anything())
  })

  it('leaves the edit form on cancel without saving anything', async () => {
    const { getByText, queryByDisplayValue } = await render(<RecurringDetail />)

    await fireEvent.press(getByText('עריכה'))
    expect(queryByDisplayValue('ארנונה')).toBeTruthy()

    await fireEvent.press(getByText('ביטול'))

    expect(queryByDisplayValue('ארנונה')).toBeNull()
    expect(mockUpdateMutate).not.toHaveBeenCalled()
  })

  // Fix 2 — skip is unavailable on a paused template.
  it('shows an enabled skip button for an active template', async () => {
    const { getByRole } = await render(<RecurringDetail />)

    const skipButton = getByRole('button', { name: 'דילוג על החיוב הקרוב' })
    expect(skipButton.props.accessibilityState.disabled).toBeFalsy()

    await fireEvent.press(skipButton)
    expect(mockSkipMutate).toHaveBeenCalledWith('rec-1', expect.anything())
  })

  it('hides the skip button entirely for a paused template', async () => {
    mockItem = { ...BASE_ITEM, is_active: false }
    const { queryByText, queryByRole } = await render(<RecurringDetail />)

    expect(queryByText('דילוג על החיוב הקרוב')).toBeNull()
    expect(queryByRole('button', { name: 'דילוג על החיוב הקרוב' })).toBeNull()
    expect(mockSkipMutate).not.toHaveBeenCalled()
  })

  it('pauses via the narrow set-active RPC, sending the currently-rendered version, not the identity-edit hook', async () => {
    const { getByText } = await render(<RecurringDetail />)

    await fireEvent.press(getByText('השהיה'))

    expect(mockSetActiveMutate).toHaveBeenCalledWith(
      { id: 'rec-1', expectedVersion: 1, isActive: false },
      expect.anything()
    )
    expect(mockUpdateMutate).not.toHaveBeenCalled()
  })

  it('shows the conflict modal when a save loses to a newer version, and does not silently overwrite the newer server data', async () => {
    mockUpdateMutate.mockImplementationOnce((_variables, callbacks) => {
      callbacks?.onError?.(new ConcurrencyError('conflict'))
    })
    const { getByText } = await render(<RecurringDetail />)

    await fireEvent.press(getByText('עריכה'))
    await fireEvent.press(getByText('שמירה'))

    await waitFor(() => expect(getByText('כבר בוצע שינוי בפריט הזה ממכשיר או משתמש אחר.')).toBeTruthy())
  })

  it('reloading from a conflict refetches and re-populates the edit form with the fresh server version', async () => {
    mockUpdateMutate.mockImplementationOnce((_variables, callbacks) => {
      callbacks?.onError?.(new ConcurrencyError('conflict'))
    })
    const freshItem = { ...BASE_ITEM, description: 'ארנונה מהמכשיר האחר', version: 2 }
    mockRefetch.mockResolvedValueOnce({ data: [freshItem] })

    const { getByText, getByDisplayValue } = await render(<RecurringDetail />)

    await fireEvent.press(getByText('עריכה'))
    await fireEvent.press(getByText('שמירה'))

    await waitFor(() => expect(getByText('טען את הגרסה החדשה')).toBeTruthy())
    await fireEvent.press(getByText('טען את הגרסה החדשה'))

    await waitFor(() => expect(mockRefetch).toHaveBeenCalled())
    await waitFor(() => expect(getByDisplayValue('ארנונה מהמכשיר האחר')).toBeTruthy())
  })
})
