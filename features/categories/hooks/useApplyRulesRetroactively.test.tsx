// Regression coverage for the transaction rule provenance milestone
// (ADR-027 / ROADMAP MVP-2): retroactive rule application must persist
// matched_rule_id alongside category_id, exactly like transaction-creation
// time auto-categorization (useCreateTransaction.test.tsx's identical
// coverage) — one matcher, two write sites, both must record which rule
// matched.

import { beforeEach, describe, expect, it, jest } from '@jest/globals'
import { renderHook, waitFor } from '@testing-library/react-native'
import { QueryClientProvider } from '@tanstack/react-query'
import { createTestQueryClient } from '@/lib/testing/createTestQueryClient'
import type { ReactNode } from 'react'
import { supabase } from '@/lib/supabase/client'
import { createQueryBuilderMock } from '@/lib/supabase/__mocks__/client'
import { useApplyRulesRetroactively } from './useApplyRulesRetroactively'

jest.mock('@/lib/supabase/client')
jest.mock('@/lib/events/dispatcher')
jest.mock('@/features/auth/hooks/useAuth', () => ({
  useAuth: () => ({ user: { id: 'user-1' } }),
}))

function wrapper({ children }: { children: ReactNode }) {
  const queryClient = createTestQueryClient()
  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
}

const MATCHING_RULE = {
  id: 'rule-1',
  household_id: 'household-1',
  category_id: 'cat-coffee',
  field: 'description',
  operator: 'contains',
  value: 'קפה',
  is_case_sensitive: false,
  sort_order: 0,
  is_active: true,
}

const UNCATEGORIZED_TRANSACTION = {
  id: 'txn-1',
  description: 'קפה בבוקר',
  merchant_name: null,
  category_id: null,
}

describe('useApplyRulesRetroactively — rule provenance', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('stores matched_rule_id alongside category_id for each retroactively categorized transaction', async () => {
    const rulesBuilder = createQueryBuilderMock({ data: [MATCHING_RULE], error: null })
    const uncategorizedBuilder = createQueryBuilderMock({ data: [UNCATEGORIZED_TRANSACTION], error: null })
    const updateBuilder = createQueryBuilderMock({ data: null, error: null })

    // The hook issues 3 sequential supabase.from('transactions') calls: the
    // uncategorized-select (Promise.all leg), then one .update() per match.
    // Table-name-only routing (as in useCreateTransaction.test.tsx) can't
    // distinguish the select from the update on the same table, so this
    // mock instead routes by call order.
    let transactionsCallCount = 0
    jest.mocked(supabase.from).mockImplementation((table: string) => {
      if (table === 'category_rules') return rulesBuilder as unknown as ReturnType<typeof supabase.from>
      if (table === 'transactions') {
        transactionsCallCount += 1
        return (transactionsCallCount === 1 ? uncategorizedBuilder : updateBuilder) as unknown as ReturnType<
          typeof supabase.from
        >
      }
      throw new Error(`unexpected table: ${table}`)
    })

    const { result } = await renderHook(() => useApplyRulesRetroactively('household-1'), { wrapper })
    result.current.mutate()

    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(result.current.data).toBe(1)
    expect(updateBuilder.update).toHaveBeenCalledWith({ category_id: 'cat-coffee', matched_rule_id: 'rule-1' })
    expect(updateBuilder.eq).toHaveBeenCalledWith('id', 'txn-1')
  })

  it('updates nothing when no uncategorized transaction matches any rule', async () => {
    const rulesBuilder = createQueryBuilderMock({ data: [MATCHING_RULE], error: null })
    const uncategorizedBuilder = createQueryBuilderMock({
      data: [{ id: 'txn-2', description: 'לא תואם כלום', merchant_name: null, category_id: null }],
      error: null,
    })
    jest.mocked(supabase.from).mockImplementation((table: string) => {
      if (table === 'category_rules') return rulesBuilder as unknown as ReturnType<typeof supabase.from>
      if (table === 'transactions') return uncategorizedBuilder as unknown as ReturnType<typeof supabase.from>
      throw new Error(`unexpected table: ${table}`)
    })

    const { result } = await renderHook(() => useApplyRulesRetroactively('household-1'), { wrapper })
    result.current.mutate()

    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(result.current.data).toBe(0)
  })
})
