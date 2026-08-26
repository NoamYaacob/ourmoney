// Regression tests for two confirmed gaps found during the functional
// completeness audit:
//   1. Category edit was completely missing — create+delete only, no way
//      to rename a custom category once created, even though
//      categories_update's RLS already supports it.
//   2. Rule edit was completely missing — same shape, category_rules_update
//      RLS already supports it but nothing in the UI called it.
// Follows this repo's established screen-test conventions
// (app/(app)/transactions/import.test.tsx, app/(app)/transactions/[id].test.tsx):
// mock expo-router, mock every Supabase-backed hook, mock @expo/vector-icons
// to dodge the expo-asset hoisting gap, use await render/fireEvent, and
// import '@/i18n' for real Hebrew strings.
import { beforeEach, describe, expect, it, jest } from '@jest/globals'
import { fireEvent, render } from '@testing-library/react-native'
import '@/i18n'
import Categories from './categories'

let mockEditRuleId: string | undefined
jest.mock('expo-router', () => ({
  useRouter: () => ({ back: jest.fn() }),
  useLocalSearchParams: () => ({ editRuleId: mockEditRuleId }),
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

const CATEGORIES = [
  { id: 'cat-system', household_id: null, name_he: 'מזון', icon: '🍔', is_system: true, is_active: true },
  { id: 'cat-1', household_id: 'household-1', name_he: 'תחביבים', icon: '🎨', is_system: false, is_active: true },
]
const mockUseCategories = jest.fn()
jest.mock('@/features/categories/hooks/useCategories', () => ({
  useCategories: () => mockUseCategories(),
}))

const mockCreateCategoryMutate = jest.fn()
jest.mock('@/features/categories/hooks/useCreateCategory', () => ({
  useCreateCategory: () => ({ mutate: mockCreateCategoryMutate, isPending: false, isError: false }),
}))

const mockUpdateCategoryMutate = jest.fn()
jest.mock('@/features/categories/hooks/useUpdateCategory', () => ({
  useUpdateCategory: () => ({ mutate: mockUpdateCategoryMutate, isPending: false, isError: false }),
}))

const mockDeleteCategoryMutate = jest.fn()
jest.mock('@/features/categories/hooks/useDeleteCategory', () => ({
  useDeleteCategory: () => ({ mutate: mockDeleteCategoryMutate, isPending: false, isError: false }),
}))

const RULES = [
  { id: 'rule-1', household_id: 'household-1', category_id: 'cat-1', field: 'description', operator: 'contains', value: 'קפה', is_case_sensitive: false, sort_order: 0, is_active: true },
]
const mockUseCategoryRules = jest.fn()
jest.mock('@/features/categories/hooks/useCategoryRules', () => ({
  useCategoryRules: () => mockUseCategoryRules(),
}))

const mockCreateRuleMutate = jest.fn()
jest.mock('@/features/categories/hooks/useCreateCategoryRule', () => ({
  useCreateCategoryRule: () => ({ mutate: mockCreateRuleMutate, isPending: false, isError: false }),
}))

const mockUpdateRuleMutate = jest.fn()
jest.mock('@/features/categories/hooks/useUpdateCategoryRule', () => ({
  useUpdateCategoryRule: () => ({ mutate: mockUpdateRuleMutate, isPending: false, isError: false }),
}))

const mockDeleteRuleMutate = jest.fn()
jest.mock('@/features/categories/hooks/useDeleteCategoryRule', () => ({
  useDeleteCategoryRule: () => ({ mutate: mockDeleteRuleMutate, isPending: false, isError: false }),
}))

jest.mock('@/features/categories/hooks/useApplyRulesRetroactively', () => ({
  useApplyRulesRetroactively: () => ({ mutate: jest.fn(), isPending: false }),
}))

describe('Categories settings screen', () => {
  beforeEach(() => {
    mockUseCategories.mockReturnValue({ categories: CATEGORIES, isLoading: false })
    mockUseCategoryRules.mockReturnValue({ rules: RULES, isLoading: false })
    mockEditRuleId = undefined
  })

  it('shows an edit affordance on a custom category row and saves the renamed value via useUpdateCategory', async () => {
    mockUpdateCategoryMutate.mockClear()
    const { getByText, getByLabelText, getByDisplayValue } = await render(<Categories />)

    await fireEvent.press(getByLabelText('עריכת קטגוריית תחביבים'))

    const input = getByDisplayValue('תחביבים')
    await fireEvent.changeText(input, 'תחביבים ואומנות')
    await fireEvent.press(getByText('שמירה'))

    expect(mockUpdateCategoryMutate).toHaveBeenCalledWith(
      { id: 'cat-1', nameHe: 'תחביבים ואומנות' },
      expect.anything()
    )
  })

  it('cancels category edit without calling useUpdateCategory', async () => {
    mockUpdateCategoryMutate.mockClear()
    const { getByText, getByLabelText, queryByDisplayValue } = await render(<Categories />)

    await fireEvent.press(getByLabelText('עריכת קטגוריית תחביבים'))
    await fireEvent.press(getByText('ביטול'))

    expect(mockUpdateCategoryMutate).not.toHaveBeenCalled()
    expect(queryByDisplayValue('תחביבים')).toBeNull()
  })

  it('shows an edit affordance on a rule row and saves the edited value via useUpdateCategoryRule, preserving the prefilled category/field/operator', async () => {
    mockUpdateRuleMutate.mockClear()
    const { getByText, getByLabelText, getByDisplayValue } = await render(<Categories />)

    await fireEvent.press(getByLabelText('עריכת כלל: תיאור מכיל קפה'))

    const valueInput = getByDisplayValue('קפה')
    await fireEvent.changeText(valueInput, 'קפה ומאפים')
    await fireEvent.press(getByText('שמירת כלל'))

    expect(mockUpdateRuleMutate).toHaveBeenCalledWith(
      {
        id: 'rule-1',
        categoryId: 'cat-1',
        field: 'description',
        operator: 'contains',
        value: 'קפה ומאפים',
      },
      expect.anything()
    )
  })

  // Design Phase 3: the emoji-badge empty states (🏷️ / ⚙️) moved to
  // Ionicons via EmptyState's iconName — this only verifies the message
  // text still renders when there's nothing to show, not the icon itself.
  it('shows the custom-categories empty state when there are no custom categories', async () => {
    mockUseCategories.mockReturnValue({
      categories: CATEGORIES.filter((c) => c.is_system),
      isLoading: false,
    })

    const { getByText } = await render(<Categories />)

    expect(getByText('עדיין אין קטגוריות מותאמות אישית.')).toBeTruthy()
  })

  it('shows the rules empty state when there are no classification rules', async () => {
    mockUseCategoryRules.mockReturnValue({ rules: [], isLoading: false })

    const { getByText } = await render(<Categories />)

    expect(getByText('עדיין אין כללי סיווג.')).toBeTruthy()
  })

  it('reads a rule row as an IF/THEN sentence naming the target category', async () => {
    const { getByText, getAllByText } = await render(<Categories />)

    expect(getByText('אם')).toBeTruthy()
    expect(getByText('אז')).toBeTruthy()
    // "תחביבים" appears twice: the custom-categories list row, and the
    // rule's own "THEN" target-category name — both are expected.
    expect(getAllByText('תחביבים').length).toBeGreaterThanOrEqual(2)
  })

  // ADR-027 deep-link: a transaction's "עריכת הכלל" action navigates here
  // with ?editRuleId=<id> so the user lands on the exact rule that caused
  // the categorization, not a generic list they'd have to search.
  it('auto-opens the targeted rule\'s inline edit form when navigated with an editRuleId param', async () => {
    mockEditRuleId = 'rule-1'

    const { getByDisplayValue } = await render(<Categories />)

    expect(getByDisplayValue('קפה')).toBeTruthy()
  })

  it('does not crash and opens no edit form when editRuleId names a rule that no longer exists', async () => {
    mockEditRuleId = 'rule-deleted'

    const { queryByDisplayValue } = await render(<Categories />)

    expect(queryByDisplayValue('קפה')).toBeNull()
  })

  // Release-readiness pass: both delete buttons used to call mutate()
  // directly on press, with no confirmation at all — every other
  // destructive action in the app confirms first.
  it('requires confirmation before deleting a category, and does not delete on cancel', async () => {
    mockDeleteCategoryMutate.mockClear()
    const { getByText, getByLabelText, queryByText } = await render(<Categories />)

    await fireEvent.press(getByLabelText('מחיקת קטגוריית תחביבים'))
    expect(mockDeleteCategoryMutate).not.toHaveBeenCalled()
    expect(getByText('מחיקת קטגוריה')).toBeTruthy()

    await fireEvent.press(getByText('ביטול'))
    expect(mockDeleteCategoryMutate).not.toHaveBeenCalled()
    expect(queryByText('מחיקת קטגוריה')).toBeNull()
  })

  it('deletes a category via useDeleteCategory only after the confirm dialog is accepted', async () => {
    mockDeleteCategoryMutate.mockClear()
    const { getAllByText, getByLabelText } = await render(<Categories />)

    await fireEvent.press(getByLabelText('מחיקת קטגוריית תחביבים'))
    // "מחיקה" (Delete) also labels both rows' own delete affordances (one
    // per category, one per rule), so the dialog's confirm button — added
    // last in the component's own render order — is the last match once
    // the dialog is open.
    const deleteTexts = getAllByText('מחיקה')
    await fireEvent.press(deleteTexts[deleteTexts.length - 1]!)

    expect(mockDeleteCategoryMutate).toHaveBeenCalledWith('cat-1', expect.anything())
  })

  it('requires confirmation before deleting a category rule, and does not delete on cancel', async () => {
    mockDeleteRuleMutate.mockClear()
    const { getByText, getByLabelText, queryByText } = await render(<Categories />)

    await fireEvent.press(getByLabelText('מחיקת כלל: תיאור מכיל קפה'))
    expect(mockDeleteRuleMutate).not.toHaveBeenCalled()
    expect(getByText('מחיקת כלל סיווג')).toBeTruthy()

    await fireEvent.press(getByText('ביטול'))
    expect(mockDeleteRuleMutate).not.toHaveBeenCalled()
    expect(queryByText('מחיקת כלל סיווג')).toBeNull()
  })

  it('deletes a category rule via useDeleteCategoryRule only after the confirm dialog is accepted', async () => {
    mockDeleteRuleMutate.mockClear()
    const { getAllByText, getByLabelText } = await render(<Categories />)

    await fireEvent.press(getByLabelText('מחיקת כלל: תיאור מכיל קפה'))
    const deleteTexts = getAllByText('מחיקה')
    await fireEvent.press(deleteTexts[deleteTexts.length - 1]!)

    expect(mockDeleteRuleMutate).toHaveBeenCalledWith('rule-1', expect.anything())
  })

  // Desktop/RTL polish pass (real-browser regression): this split was
  // missed by the earlier sweep that fixed Dashboard/Budgets/Settings —
  // it declared plain flex-row (not flex-row-reverse), which native
  // auto-mirrors via Yoga under the forced-RTL flag but NativeWind's
  // web-compiled CSS does not. Categories (source-order-first, the primary
  // column) must render on the right, matching every other desktop grid
  // in this app.
  // Visual QA + Desktop Polish pass: this previously matched via
  // `.toContain('web:desktop:flex-row')`, a substring satisfied by BOTH the
  // reversed and unreversed forms — so it silently kept passing through a
  // real regression where the split reverted to plain `flex-row`. Rewritten
  // to exact whitespace-token membership.
  it('lays the categories/rules desktop split out as a plain row so categories (primary) render on the right', async () => {
    const { getByText } = await render(<Categories />)

    const categoriesColumn = getByText('קטגוריות מותאמות אישית').parent
    const splitContainer = categoriesColumn?.parent
    const tokens = ((splitContainer?.props.className as string | undefined) ?? '').split(/\s+/)
    expect(tokens).toContain('web:desktop:flex-row')
    expect(tokens).not.toContain('web:desktop:flex-row-reverse')

    const rulesColumn = getByText('כללי סיווג').parent
    expect(rulesColumn?.parent).toBe(splitContainer)
  })
})
