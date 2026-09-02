import { describe, expect, it, jest } from '@jest/globals'
import { renderHook, waitFor } from '@testing-library/react-native'
import { QueryClientProvider } from '@tanstack/react-query'
import { createTestQueryClient } from '@/lib/testing/createTestQueryClient'
import type { ReactNode } from 'react'
import { supabase } from '@/lib/supabase/client'
import { createQueryBuilderMock } from '@/lib/supabase/__mocks__/client'
import { useInstallmentMaterializedCounts } from './useInstallmentMaterializedCounts'

jest.mock('@/lib/supabase/client')

function wrapper({ children }: { children: ReactNode }) {
  const queryClient = createTestQueryClient()
  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
}

describe('useInstallmentMaterializedCounts', () => {
  it('is empty/not loading when there is no household id', async () => {
    const { result } = await renderHook(() => useInstallmentMaterializedCounts(undefined), { wrapper })
    expect(result.current.materializedCounts).toEqual({})
    expect(result.current.maxMaterializedIndices).toEqual({})
    expect(result.current.isLoading).toBe(false)
  })

  it('reduces fetched transactions into a per-plan materialized count', async () => {
    jest.mocked(supabase.from).mockReturnValue(
      createQueryBuilderMock({
        data: [
          { installment_plan_id: 'plan-1', installment_index: 1 },
          { installment_plan_id: 'plan-1', installment_index: 2 },
          { installment_plan_id: 'plan-2', installment_index: 1 },
        ],
        error: null,
      }) as unknown as ReturnType<typeof supabase.from>
    )

    const { result } = await renderHook(() => useInstallmentMaterializedCounts('household-1'), { wrapper })
    await waitFor(() => expect(result.current.materializedCounts).toEqual({ 'plan-1': 2, 'plan-2': 1 }))
  })

  // RRR §14 P0-1 regression: materializedCounts (a row COUNT) and
  // maxMaterializedIndices (MAX(installment_index)) must diverge exactly
  // when a materialized instalment has been deleted, leaving a gap — this is
  // the scenario that made forecasting silently double-count a real charge.
  // See computeInstallmentMaterializedCounts.test.ts for the pure-function
  // version of this same regression.
  it('materializedCounts and maxMaterializedIndices diverge correctly when a materialized instalment has been deleted, leaving a gap', async () => {
    jest.mocked(supabase.from).mockReturnValue(
      createQueryBuilderMock({
        // index 2 missing — deleted. Only 1, 3, 4 remain.
        data: [
          { installment_plan_id: 'plan-1', installment_index: 1 },
          { installment_plan_id: 'plan-1', installment_index: 3 },
          { installment_plan_id: 'plan-1', installment_index: 4 },
        ],
        error: null,
      }) as unknown as ReturnType<typeof supabase.from>
    )

    const { result } = await renderHook(() => useInstallmentMaterializedCounts('household-1'), { wrapper })
    await waitFor(() => expect(result.current.materializedCounts).toEqual({ 'plan-1': 3 }))
    expect(result.current.maxMaterializedIndices).toEqual({ 'plan-1': 4 })
  })

  it('selects installment_plan_id and installment_index, scopes to the given household, and excludes null plan links', async () => {
    const builder = createQueryBuilderMock({ data: [], error: null })
    jest.mocked(supabase.from).mockReturnValue(builder as unknown as ReturnType<typeof supabase.from>)

    await renderHook(() => useInstallmentMaterializedCounts('household-1'), { wrapper })
    await waitFor(() => expect(builder.select).toHaveBeenCalledWith('installment_plan_id, installment_index'))
    expect(builder.eq).toHaveBeenCalledWith('household_id', 'household-1')
    expect(builder.not).toHaveBeenCalledWith('installment_plan_id', 'is', null)
  })
})
