import { beforeEach, describe, expect, it, jest } from '@jest/globals'
import { fireEvent, render, waitFor } from '@testing-library/react-native'
import '@/i18n'
import { ConcurrencyError } from '@/lib/mutations/concurrencyError'
import InstallmentPlanDetail from './[id]'

const mockBack = jest.fn()
let mockId = 'plan-1'
jest.mock('expo-router', () => ({
  useRouter: () => ({ back: () => mockBack() }),
  useLocalSearchParams: () => ({ id: mockId }),
}))
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
  useAccounts: () => ({ accounts: [{ id: 'acc-cc', name: 'ויזה כאל', type: 'credit_card' }], isLoading: false }),
}))
jest.mock('@/features/categories/hooks/useCategories', () => ({
  useCategories: () => ({
    categories: [{ id: 'cat-1', name_he: 'ריהוט', icon: '🛋️', is_active: true }],
    isLoading: false,
  }),
}))

const mockUpdateMutate = jest.fn(
  (_variables: unknown, callbacks?: { onSuccess?: () => void; onError?: (error: unknown) => void }) => {
    callbacks?.onSuccess?.()
  }
)
jest.mock('@/features/installments/hooks/useUpdateInstallmentPlan', () => ({
  useUpdateInstallmentPlan: () => ({ mutate: mockUpdateMutate, isPending: false, isError: false }),
}))

const mockDeleteMutate = jest.fn(
  (_variables: unknown, callbacks?: { onSuccess?: () => void; onError?: (error: unknown) => void }) => {
    callbacks?.onSuccess?.()
  }
)
jest.mock('@/features/installments/hooks/useDeleteInstallmentPlan', () => ({
  useDeleteInstallmentPlan: () => ({ mutate: mockDeleteMutate, isPending: false }),
}))

const mockRefetch = jest.fn(async () => ({ data: mockPlans }))
let mockPlans: Record<string, unknown>[] = []
jest.mock('@/features/installments/hooks/useInstallmentPlans', () => ({
  useInstallmentPlans: () => ({ plans: mockPlans, isLoading: false, refetch: mockRefetch }),
}))

jest.mock('@/features/installments/hooks/useInstallmentMaterializedCounts', () => ({
  useInstallmentMaterializedCounts: () => ({ materializedCounts: { 'plan-1': 1 } }),
}))

const PLAN = {
  id: 'plan-1',
  household_id: 'household-1',
  account_id: 'acc-cc',
  category_id: null,
  merchant_name: null,
  description: 'ספה חדשה',
  total_agorot: 300000,
  installment_count: 3,
  monthly_agorot: 100000,
  first_charge_date: '2026-08-10',
  is_shared: true,
  created_by: 'user-1',
  version: 1,
}

describe('Installment plan detail', () => {
  beforeEach(() => {
    mockId = 'plan-1'
    mockPlans = [PLAN]
    mockUpdateMutate.mockClear()
    mockDeleteMutate.mockClear()
    mockRefetch.mockClear()
    mockBack.mockClear()
  })

  it('shows a not-found state for an unknown id', async () => {
    mockId = 'does-not-exist'
    const { getByText } = await render(<InstallmentPlanDetail />)
    expect(getByText('הרכישה לא נמצאה')).toBeTruthy()
  })

  it('shows remaining balance and installment progress', async () => {
    const { getByText } = await render(<InstallmentPlanDetail />)
    // remaining = 300000 - 100000*1 = 200000 agorot = ₪2,000.00
    expect(getByText(/2,000/)).toBeTruthy()
    expect(getByText(/שולמו 1 מתוך 3 תשלומים/)).toBeTruthy()
  })

  it('edits description/merchant/category/shared without touching the immutable financial fields — a single update call carrying the loaded version', async () => {
    const { getByText, getByLabelText } = await render(<InstallmentPlanDetail />)

    await fireEvent.press(getByText('עריכה'))
    await fireEvent.changeText(getByLabelText('תיאור הרכישה'), 'ספה חדשה מהמפעל')
    await fireEvent.press(getByText('שמירה'))

    expect(mockUpdateMutate).toHaveBeenCalledTimes(1)
    const [variables] = mockUpdateMutate.mock.calls[0] as [
      { id: string; description: string; expectedVersion: number },
    ]
    expect(variables.id).toBe('plan-1')
    expect(variables.description).toBe('ספה חדשה מהמפעל')
    expect(variables.expectedVersion).toBe(1)
  })

  it('validates a missing description before saving an edit', async () => {
    const { getByText, getByLabelText } = await render(<InstallmentPlanDetail />)

    await fireEvent.press(getByText('עריכה'))
    await fireEvent.changeText(getByLabelText('תיאור הרכישה'), '')
    await fireEvent.press(getByText('שמירה'))

    expect(getByText('יש להזין תיאור לרכישה')).toBeTruthy()
    expect(mockUpdateMutate).not.toHaveBeenCalled()
  })

  it('deletes the plan after confirming, sending the currently-rendered version, then navigates back', async () => {
    const { getByText, getAllByText } = await render(<InstallmentPlanDetail />)

    await fireEvent.press(getByText('מחיקה'))
    const deleteButtons = getAllByText('מחיקה')
    await fireEvent.press(deleteButtons[deleteButtons.length - 1]!)

    expect(mockDeleteMutate).toHaveBeenCalledWith({ id: 'plan-1', expectedVersion: 1 }, expect.anything())
    expect(mockBack).toHaveBeenCalled()
  })

  it('shows the conflict modal instead of a generic error when a save loses to a newer version, and does not silently overwrite the newer server data', async () => {
    mockUpdateMutate.mockImplementationOnce((_variables, callbacks) => {
      callbacks?.onError?.(new ConcurrencyError('conflict'))
    })
    const { getByText, queryByText } = await render(<InstallmentPlanDetail />)

    await fireEvent.press(getByText('עריכה'))
    await fireEvent.press(getByText('שמירה'))

    await waitFor(() => expect(getByText('כבר בוצע שינוי בפריט הזה ממכשיר או משתמש אחר.')).toBeTruthy())
    expect(queryByText('משהו השתבש. נסו שוב')).toBeNull()
  })
})
