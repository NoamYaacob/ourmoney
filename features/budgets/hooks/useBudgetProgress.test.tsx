// RRR P1 finding #2 regression coverage: the Budgets header (BudgetSummaryCard,
// driven by this hook's totalAllocatedAgorot/totalSpentAgorot) and the
// per-category rows beneath it (driven by this hook's `categories`) must
// describe the same money. Before this fix, totalSpentAgorot summed EVERY
// matching household transaction in the period — including spend in
// categories with no budget allocation at all — while totalAllocatedAgorot
// and every category row only ever covered budgeted categories (PROJECT_SPEC
// §Budgets: "Budget progress per category (only categories with an
// allocation)"). A household could see the header state "over budget" by a
// large red figure while every single visible category row read "on track,
// money left" — nothing on screen explains the gap, because it came from
// spending in a category that isn't shown at all. This test reproduces that
// exact shape: one budgeted category (Food, under its allocation) plus
// spending in a second, unbudgeted category (Rent) that should NOT be able to
// push the budget header into overspend on its own.
import { describe, expect, it, jest } from '@jest/globals'
import { renderHook, waitFor } from '@testing-library/react-native'
import { QueryClientProvider } from '@tanstack/react-query'
import { createTestQueryClient } from '@/lib/testing/createTestQueryClient'
import type { ReactNode } from 'react'
import { supabase } from '@/lib/supabase/client'
import { createQueryBuilderMock } from '@/lib/supabase/__mocks__/client'
import { useBudgetProgress } from './useBudgetProgress'

jest.mock('@/lib/supabase/client')

function wrapper({ children }: { children: ReactNode }) {
  const queryClient = createTestQueryClient()
  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
}

function mockFrom(table: string) {
  if (table === 'budgets') {
    return createQueryBuilderMock({ data: { id: 'budget-1' }, error: null })
  }
  if (table === 'budget_allocations') {
    return createQueryBuilderMock({
      data: [
        {
          id: 'alloc-1',
          category_id: 'cat-food',
          amount_agorot: 100_000, // ₪1,000 allocated to Food — the only budgeted category
          categories: { name_he: 'אוכל', icon: '🍔' },
        },
      ],
      error: null,
    })
  }
  if (table === 'transactions') {
    return createQueryBuilderMock({
      data: [
        { category_id: 'cat-food', amount_agorot: -50_000 }, // ₪500 spent in the budgeted Food category
        { category_id: 'cat-rent', amount_agorot: -200_000 }, // ₪2,000 spent in Rent — NOT budgeted, no allocation row, no visible row
      ],
      error: null,
    })
  }
  throw new Error(`unexpected table: ${table}`)
}

describe('useBudgetProgress — header/category-row consistency (P1-2)', () => {
  it('totalSpentAgorot only covers budgeted categories, so the header never claims more spend than the category rows can account for', async () => {
    jest.mocked(supabase.from).mockImplementation((table: string) => mockFrom(table) as unknown as ReturnType<typeof supabase.from>)

    const { result } = await renderHook(() => useBudgetProgress('household-1', '2026-08-01'), { wrapper })
    await waitFor(() => expect(result.current.isLoading).toBe(false))

    expect(result.current.categories).toHaveLength(1)
    expect(result.current.categories[0]?.spentAgorot).toBe(50_000)

    // The header's total must equal the sum of what the visible rows show —
    // never inflated by spend in an unbudgeted category the household can't
    // see anywhere on this screen.
    const sumOfRowSpend = result.current.categories.reduce((sum, c) => sum + c.spentAgorot, 0)
    expect(result.current.totalSpentAgorot).toBe(sumOfRowSpend)
    expect(result.current.totalSpentAgorot).toBe(50_000)

    // Consequently: allocated 1,000 - spent 500 = 500 left, matching Food's
    // own row exactly — not a mystery -1,500 overspend the rows can't explain.
    const remainingAgorot = result.current.totalAllocatedAgorot - result.current.totalSpentAgorot
    expect(remainingAgorot).toBe(50_000)
  })
})
