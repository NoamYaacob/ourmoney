import { describe, expect, it, jest } from '@jest/globals'
import { emit, on } from '@/lib/events/dispatcher'
import { supabase } from '@/lib/supabase/client'
import { createQueryBuilderMock } from '@/lib/supabase/__mocks__/client'
import type { BudgetExceededPayload, BudgetThresholdReachedPayload, DomainEvent } from '@/lib/events/types'

jest.mock('@/lib/supabase/client')

// Importing for side effects registers the on('transaction.created', ...)
// subscriber exactly once at module load, mirroring how it's loaded once at
// app startup — no useCreateTransaction involvement anywhere in this file,
// which is the concrete proof that the domain-decoupling actually holds.
import './budgetThresholdSubscriber'

function flushMicrotasks() {
  return new Promise((resolve) => setTimeout(resolve, 0))
}

function mockSupabaseSequence(
  budget: { id: string } | null,
  allocation: { amount_agorot: number } | null,
  transactions: { amount_agorot: number }[]
) {
  jest
    .mocked(supabase.from)
    .mockReturnValueOnce(createQueryBuilderMock({ data: budget, error: null }) as unknown as ReturnType<typeof supabase.from>)
    .mockReturnValueOnce(createQueryBuilderMock({ data: allocation, error: null }) as unknown as ReturnType<typeof supabase.from>)
    .mockReturnValueOnce(createQueryBuilderMock({ data: transactions, error: null }) as unknown as ReturnType<typeof supabase.from>)
}

const baseEvent = {
  type: 'transaction.created' as const,
  householdId: 'household-1',
  actorId: 'user-1',
  occurredAt: '2026-08-15T10:00:00.000Z',
}

describe('budgetThresholdSubscriber', () => {
  it('emits budget.threshold_reached exactly at the 80%-style crossing (90% threshold here)', async () => {
    const reached: DomainEvent<'budget.threshold_reached', BudgetThresholdReachedPayload>[] = []
    on('budget.threshold_reached', (event) => reached.push(event))

    // Allocation 10000, transactions sum to exactly -9000 (spent 9000 =
    // 90% after this transaction). Before this transaction (amountAgorot
    // -2000) the total was -7000 (70%) — a real crossing of 90%.
    mockSupabaseSequence({ id: 'budget-1' }, { amount_agorot: 10000 }, [{ amount_agorot: -9000 }])

    emit({
      ...baseEvent,
      payload: {
        transactionId: 'txn-1',
        accountId: 'acc-1',
        categoryId: 'cat-1',
        amountAgorot: -2000,
        isShared: true,
        txnDate: '2026-08-15',
      },
    })
    await flushMicrotasks()

    expect(reached).toHaveLength(1)
    expect(reached[0]?.payload).toEqual({
      budgetId: 'budget-1',
      categoryId: 'cat-1',
      thresholdPercent: 90,
      spentAgorot: 9000,
      allocatedAgorot: 10000,
    })
  })

  it('emits budget.exceeded when this transaction crosses 100%', async () => {
    const exceeded: DomainEvent<'budget.exceeded', BudgetExceededPayload>[] = []
    on('budget.exceeded', (event) => exceeded.push(event))

    mockSupabaseSequence({ id: 'budget-2' }, { amount_agorot: 10000 }, [{ amount_agorot: -10500 }])

    emit({
      ...baseEvent,
      payload: {
        transactionId: 'txn-2',
        accountId: 'acc-1',
        categoryId: 'cat-2',
        amountAgorot: -1500,
        isShared: true,
        txnDate: '2026-08-16',
      },
    })
    await flushMicrotasks()

    expect(exceeded.some((e) => e.payload.categoryId === 'cat-2' && e.payload.spentAgorot === 10500)).toBe(true)
  })

  it('does not fire again for a category already over budget before this transaction', async () => {
    const reached: DomainEvent<'budget.threshold_reached', BudgetThresholdReachedPayload>[] = []
    const exceeded: DomainEvent<'budget.exceeded', BudgetExceededPayload>[] = []
    on('budget.threshold_reached', (event) => reached.push(event))
    on('budget.exceeded', (event) => exceeded.push(event))

    // Already at -12000 (120%) before this transaction; this one pushes it
    // to -12500 — still over, but not a NEW crossing of either threshold.
    mockSupabaseSequence({ id: 'budget-3' }, { amount_agorot: 10000 }, [{ amount_agorot: -12500 }])

    emit({
      ...baseEvent,
      payload: {
        transactionId: 'txn-3',
        accountId: 'acc-1',
        categoryId: 'cat-3',
        amountAgorot: -500,
        isShared: true,
        txnDate: '2026-08-17',
      },
    })
    await flushMicrotasks()

    expect(reached.filter((e) => e.payload.categoryId === 'cat-3')).toHaveLength(0)
    expect(exceeded.filter((e) => e.payload.categoryId === 'cat-3')).toHaveLength(0)
  })

  it('does nothing for a personal (is_shared=false) transaction', async () => {
    const reached: DomainEvent<'budget.threshold_reached', BudgetThresholdReachedPayload>[] = []
    on('budget.threshold_reached', (event) => reached.push(event))
    jest.mocked(supabase.from).mockClear()

    emit({
      ...baseEvent,
      payload: {
        transactionId: 'txn-4',
        accountId: 'acc-1',
        categoryId: 'cat-4',
        amountAgorot: -9000,
        isShared: false,
        txnDate: '2026-08-15',
      },
    })
    await flushMicrotasks()

    expect(supabase.from).not.toHaveBeenCalled()
    expect(reached.filter((e) => e.payload.categoryId === 'cat-4')).toHaveLength(0)
  })

  it('does nothing for an income (positive-amount) transaction', async () => {
    jest.mocked(supabase.from).mockClear()

    emit({
      ...baseEvent,
      payload: {
        transactionId: 'txn-5',
        accountId: 'acc-1',
        categoryId: 'cat-5',
        amountAgorot: 9000,
        isShared: true,
        txnDate: '2026-08-15',
      },
    })
    await flushMicrotasks()

    expect(supabase.from).not.toHaveBeenCalled()
  })

  it('does nothing when there is no budget for the transaction\'s month (missing budget)', async () => {
    const reached: DomainEvent<'budget.threshold_reached', BudgetThresholdReachedPayload>[] = []
    on('budget.threshold_reached', (event) => reached.push(event))

    jest.mocked(supabase.from).mockReturnValueOnce(
      createQueryBuilderMock({ data: null, error: null }) as unknown as ReturnType<typeof supabase.from>
    )

    emit({
      ...baseEvent,
      payload: {
        transactionId: 'txn-6',
        accountId: 'acc-1',
        categoryId: 'cat-6',
        amountAgorot: -9000,
        isShared: true,
        txnDate: '2026-08-15',
      },
    })
    await flushMicrotasks()

    expect(reached.filter((e) => e.payload.categoryId === 'cat-6')).toHaveLength(0)
  })

  // Regression for the gap qa-adversarial-reviewer found: the original
  // version of this subscriber only ever reacted to 'transaction.created',
  // so editing an existing transaction's amount (e.g. via the transaction
  // detail screen) could cross a threshold with no notification firing.
  it('emits budget.threshold_reached when an EDIT to an existing transaction is what crosses 90% (transaction.updated)', async () => {
    const reached: DomainEvent<'budget.threshold_reached', BudgetThresholdReachedPayload>[] = []
    on('budget.threshold_reached', (event) => reached.push(event))

    // The updated row now sits at -9000 total for the category (90%); the
    // transactions-sum query already reflects the post-write state, exactly
    // as it does for the 'created' path.
    jest
      .mocked(supabase.from)
      .mockReturnValueOnce(
        createQueryBuilderMock({ data: { category_id: 'cat-8', amount_agorot: -6000, is_shared: true, txn_date: '2026-08-15' }, error: null }) as unknown as ReturnType<typeof supabase.from>
      )
      .mockReturnValueOnce(createQueryBuilderMock({ data: { id: 'budget-8' }, error: null }) as unknown as ReturnType<typeof supabase.from>)
      .mockReturnValueOnce(createQueryBuilderMock({ data: { amount_agorot: 10000 }, error: null }) as unknown as ReturnType<typeof supabase.from>)
      .mockReturnValueOnce(createQueryBuilderMock({ data: [{ amount_agorot: -9000 }], error: null }) as unknown as ReturnType<typeof supabase.from>)

    emit({
      type: 'transaction.updated',
      householdId: 'household-1',
      actorId: 'user-1',
      occurredAt: '2026-08-15T10:00:00.000Z',
      payload: { transactionId: 'txn-8', changedFields: ['amountAgorot'] },
    })
    await flushMicrotasks()

    expect(reached.filter((e) => e.payload.categoryId === 'cat-8')).toHaveLength(1)
  })

  // Regression for the same gap, but for the Budgets screen's uncategorized-
  // transactions queue (assigning a category via useUpdateTransaction) and
  // useApplyRulesRetroactively.ts, both of which emit transaction.categorized.
  it('emits budget.threshold_reached when a transaction is newly categorized (transaction.categorized)', async () => {
    const reached: DomainEvent<'budget.threshold_reached', BudgetThresholdReachedPayload>[] = []
    on('budget.threshold_reached', (event) => reached.push(event))

    jest
      .mocked(supabase.from)
      .mockReturnValueOnce(
        createQueryBuilderMock({ data: { category_id: 'cat-9', amount_agorot: -9000, is_shared: true, txn_date: '2026-08-15' }, error: null }) as unknown as ReturnType<typeof supabase.from>
      )
      .mockReturnValueOnce(createQueryBuilderMock({ data: { id: 'budget-9' }, error: null }) as unknown as ReturnType<typeof supabase.from>)
      .mockReturnValueOnce(createQueryBuilderMock({ data: { amount_agorot: 10000 }, error: null }) as unknown as ReturnType<typeof supabase.from>)
      .mockReturnValueOnce(createQueryBuilderMock({ data: [{ amount_agorot: -9000 }], error: null }) as unknown as ReturnType<typeof supabase.from>)

    emit({
      type: 'transaction.categorized',
      householdId: 'household-1',
      actorId: null,
      occurredAt: '2026-08-15T10:00:00.000Z',
      payload: { transactionId: 'txn-9', categoryId: 'cat-9', previousCategoryId: null },
    })
    await flushMicrotasks()

    expect(reached.filter((e) => e.payload.categoryId === 'cat-9')).toHaveLength(1)
  })

  it('does nothing when the category has no allocation (zero/missing budget for that category)', async () => {
    const reached: DomainEvent<'budget.threshold_reached', BudgetThresholdReachedPayload>[] = []
    on('budget.threshold_reached', (event) => reached.push(event))

    jest
      .mocked(supabase.from)
      .mockReturnValueOnce(createQueryBuilderMock({ data: { id: 'budget-7' }, error: null }) as unknown as ReturnType<typeof supabase.from>)
      .mockReturnValueOnce(createQueryBuilderMock({ data: null, error: null }) as unknown as ReturnType<typeof supabase.from>)

    emit({
      ...baseEvent,
      payload: {
        transactionId: 'txn-7',
        accountId: 'acc-1',
        categoryId: 'cat-7',
        amountAgorot: -9000,
        isShared: true,
        txnDate: '2026-08-15',
      },
    })
    await flushMicrotasks()

    expect(reached.filter((e) => e.payload.categoryId === 'cat-7')).toHaveLength(0)
  })
})
