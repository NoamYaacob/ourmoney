// Regression coverage for the transaction rule provenance milestone
// (ADR-027 / ROADMAP MVP-2): a manual category override must clear
// matched_rule_id, so a transaction the user re-categorized by hand never
// keeps claiming a rule set it. Mirrors useUpdateCategoryRule.test.tsx's
// mocking convention.

import { beforeEach, describe, expect, it, jest } from '@jest/globals'
import { renderHook, waitFor } from '@testing-library/react-native'
import { QueryClientProvider } from '@tanstack/react-query'
import { createTestQueryClient } from '@/lib/testing/createTestQueryClient'
import type { ReactNode } from 'react'
import { supabase } from '@/lib/supabase/client'
import { createQueryBuilderMock } from '@/lib/supabase/__mocks__/client'
import { useUpdateTransaction } from './useUpdateTransaction'

jest.mock('@/lib/supabase/client')
jest.mock('@/lib/events/dispatcher')
jest.mock('@/features/auth/hooks/useAuth', () => ({
  useAuth: () => ({ user: { id: 'user-1' } }),
}))

function wrapper({ children }: { children: ReactNode }) {
  const queryClient = createTestQueryClient()
  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
}

describe('useUpdateTransaction — rule provenance', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('clears matched_rule_id to null when categoryId is included in the update (manual override)', async () => {
    const builder = createQueryBuilderMock({ data: null, error: null })
    jest.mocked(supabase.from).mockReturnValue(builder as unknown as ReturnType<typeof supabase.from>)

    const { result } = await renderHook(() => useUpdateTransaction('household-1'), { wrapper })
    result.current.mutate({ id: 'txn-1', householdId: 'household-1', categoryId: 'cat-manual' })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(builder.update).toHaveBeenCalledWith(
      expect.objectContaining({ category_id: 'cat-manual', matched_rule_id: null })
    )
  })

  it('does not touch matched_rule_id when categoryId is omitted (a save that never touched the category)', async () => {
    const builder = createQueryBuilderMock({ data: null, error: null })
    jest.mocked(supabase.from).mockReturnValue(builder as unknown as ReturnType<typeof supabase.from>)

    const { result } = await renderHook(() => useUpdateTransaction('household-1'), { wrapper })
    result.current.mutate({ id: 'txn-1', householdId: 'household-1', description: 'תיאור חדש' })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    const [updatePayload] = jest.mocked(builder.update).mock.calls[0] as [Record<string, unknown>]
    expect(updatePayload).not.toHaveProperty('matched_rule_id')
    expect(updatePayload).not.toHaveProperty('category_id')
  })
})
