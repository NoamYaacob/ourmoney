// Regression coverage for the transaction rule provenance milestone
// (ADR-027 / ROADMAP MVP-2): when auto-categorization matches a rule,
// matched_rule_id must be persisted alongside category_id — not just
// category_id, with the matched rule's identity discarded. This hook is the
// single write path shared by manual creation and CSV import (import.tsx
// calls this same hook with source: 'csv_import'), so covering both
// `source` values here proves both required paths without a second hook.

import { beforeEach, describe, expect, it, jest } from '@jest/globals'
import { renderHook, waitFor } from '@testing-library/react-native'
import { QueryClientProvider } from '@tanstack/react-query'
import { createTestQueryClient } from '@/lib/testing/createTestQueryClient'
import type { ReactNode } from 'react'
import { supabase } from '@/lib/supabase/client'
import { createQueryBuilderMock } from '@/lib/supabase/__mocks__/client'
import { useCreateTransaction } from './useCreateTransaction'

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
  field: 'merchant_name',
  operator: 'contains',
  value: 'ארומה',
  is_case_sensitive: false,
  sort_order: 0,
  is_active: true,
}

function mockFromByTable(rulesResult: { data: unknown; error: unknown }, insertResult: { data: unknown; error: unknown }) {
  const rulesBuilder = createQueryBuilderMock(rulesResult)
  const transactionsBuilder = createQueryBuilderMock(insertResult)
  jest.mocked(supabase.from).mockImplementation((table: string) => {
    if (table === 'category_rules') return rulesBuilder as unknown as ReturnType<typeof supabase.from>
    if (table === 'transactions') return transactionsBuilder as unknown as ReturnType<typeof supabase.from>
    throw new Error(`unexpected table: ${table}`)
  })
  return { rulesBuilder, transactionsBuilder }
}

const BASE_INPUT = {
  householdId: 'household-1',
  accountId: 'acct-1',
  amountAgorot: -5000,
  description: 'קפה',
  merchantName: 'ארומה',
  txnDate: '2026-08-15',
  isShared: true,
}

describe('useCreateTransaction — rule provenance', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('stores matched_rule_id alongside category_id when a rule auto-matches a manually created transaction', async () => {
    const { transactionsBuilder } = mockFromByTable(
      { data: [MATCHING_RULE], error: null },
      { data: { id: 'txn-1' }, error: null }
    )

    const { result } = await renderHook(() => useCreateTransaction('household-1'), { wrapper })
    result.current.mutate({ ...BASE_INPUT, source: 'manual' })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(transactionsBuilder.insert).toHaveBeenCalledWith(
      expect.objectContaining({ category_id: 'cat-coffee', matched_rule_id: 'rule-1', source: 'manual' })
    )
  })

  it('stores matched_rule_id for a CSV-imported transaction — the same hook, source: csv_import', async () => {
    const { transactionsBuilder } = mockFromByTable(
      { data: [MATCHING_RULE], error: null },
      { data: { id: 'txn-2' }, error: null }
    )

    const { result } = await renderHook(() => useCreateTransaction('household-1'), { wrapper })
    result.current.mutate({ ...BASE_INPUT, source: 'csv_import' })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(transactionsBuilder.insert).toHaveBeenCalledWith(
      expect.objectContaining({ category_id: 'cat-coffee', matched_rule_id: 'rule-1', source: 'csv_import' })
    )
  })

  it('stores matched_rule_id: null when no rule matches', async () => {
    const { transactionsBuilder } = mockFromByTable({ data: [], error: null }, { data: { id: 'txn-3' }, error: null })

    const { result } = await renderHook(() => useCreateTransaction('household-1'), { wrapper })
    result.current.mutate({ ...BASE_INPUT, description: 'תשלום ללא כלל תואם', merchantName: null })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(transactionsBuilder.insert).toHaveBeenCalledWith(
      expect.objectContaining({ category_id: null, matched_rule_id: null })
    )
  })

  it('stores matched_rule_id: null when the caller supplies categoryId directly — no rule lookup happens', async () => {
    const rulesBuilder = createQueryBuilderMock({ data: [MATCHING_RULE], error: null })
    const transactionsBuilder = createQueryBuilderMock({ data: { id: 'txn-4' }, error: null })
    jest.mocked(supabase.from).mockImplementation((table: string) => {
      if (table === 'category_rules') return rulesBuilder as unknown as ReturnType<typeof supabase.from>
      if (table === 'transactions') return transactionsBuilder as unknown as ReturnType<typeof supabase.from>
      throw new Error(`unexpected table: ${table}`)
    })

    const { result } = await renderHook(() => useCreateTransaction('household-1'), { wrapper })
    result.current.mutate({ ...BASE_INPUT, categoryId: 'cat-manual' })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(rulesBuilder.select).not.toHaveBeenCalled()
    expect(transactionsBuilder.insert).toHaveBeenCalledWith(
      expect.objectContaining({ category_id: 'cat-manual', matched_rule_id: null })
    )
  })
})
