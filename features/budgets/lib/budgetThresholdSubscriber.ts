// Registers on('transaction.created'/'transaction.updated'/
// 'transaction.categorized', ...) at module load — the exact pattern
// lib/notifications/router.ts already uses for its own
// on('budget.threshold_reached', ...) registration. This module must be
// imported once at app startup (mirroring how lib/notifications/router.ts
// is imported once in app/_layout.tsx) — see app/_layout.tsx.
//
// Decoupled from the transactions domain by design (ARCHITECTURE.md:
// "adding a subscriber must never require touching the emitting module") —
// the transactions domain stays fully unaware budgets exist. This is the
// ONLY consumer of these three event types that computes anything
// budget-related.
//
// All three event types share one crossing-check (checkAndNotifyThreshold):
// given a transaction's CURRENT category_id/amount_agorot/is_shared/
// txn_date, "spent excluding this transaction's own current contribution"
// is always a valid before-state baseline to compare the real (post-write)
// total against — true whether the transaction is brand new (created),
// had its amount or category edited (updated), or was just assigned a
// category for the first time (categorized). This is why 'transaction.
// updated'/'transaction.categorized' don't need old/new value diffing in
// their payloads: re-fetching the transaction's current row and reusing the
// exact same math as the 'created' path is both simpler and correct
// (qa-adversarial-reviewer finding — the original version of this file only
// ever subscribed to 'transaction.created', so editing an amount or
// assigning a category via the Budgets uncategorized queue or
// useApplyRulesRetroactively.ts could silently cross 90%/100% with no
// notification ever firing).
//
// Only reacts to shared, non-null-category, expense (negative amount)
// transactions with an existing allocation for the transaction's month —
// personal/uncategorized/income transactions and categories with no
// allocation never produce a notification. Fires only on the SPECIFIC
// crossing (checkThresholdCrossing's before/after comparison), so a
// category already over budget does not re-fire on every subsequent
// transaction (the single-actor duplicate-fire guard; the *concurrent*-
// partner race is D5's accepted, documented residual — no client-side
// mitigation is attempted, since a per-session dedupe key cannot see across
// different sessions/devices anyway).

import { emit, on } from '@/lib/events/dispatcher'
import { supabase } from '@/lib/supabase/client'
import type {
  DomainEvent,
  TransactionCategorizedPayload,
  TransactionCreatedPayload,
  TransactionUpdatedPayload,
} from '@/lib/events/types'
import { checkThresholdCrossing } from './checkThresholdCrossing'
import { getPeriodEnd, getPeriodStartForDate } from './budgetPeriod'

interface TransactionSnapshot {
  categoryId: string | null
  amountAgorot: number
  isShared: boolean
  txnDate: string
}

async function checkAndNotifyThreshold(
  householdId: string,
  actorId: string | null,
  transaction: TransactionSnapshot
) {
  const { categoryId, amountAgorot, isShared, txnDate } = transaction

  // Only expenses (negative amounts) count toward budget spend.
  if (!categoryId || !isShared || amountAgorot >= 0) return

  const periodStart = getPeriodStartForDate(txnDate)
  const periodEnd = getPeriodEnd(periodStart)

  const { data: budget, error: budgetError } = await supabase
    .from('budgets')
    .select('id')
    .eq('household_id', householdId)
    .eq('period_start', periodStart)
    .maybeSingle()
  if (budgetError || !budget) return // missing budget => no-op, not an error

  const { data: allocation, error: allocationError } = await supabase
    .from('budget_allocations')
    .select('amount_agorot')
    .eq('budget_id', budget.id)
    .eq('category_id', categoryId)
    .maybeSingle()
  if (allocationError || !allocation) return // no allocation for this category => no-op

  const { data: transactions, error: transactionsError } = await supabase
    .from('transactions')
    .select('amount_agorot')
    .eq('household_id', householdId)
    .eq('category_id', categoryId)
    .eq('is_shared', true)
    .eq('is_excluded', false)
    .gte('txn_date', periodStart)
    .lte('txn_date', periodEnd)
    .lt('amount_agorot', 0)
  if (transactionsError) return

  const spentAfterAgorot = -(transactions ?? []).reduce((sum, t) => sum + t.amount_agorot, 0)
  // Removing this transaction's own current contribution from the current
  // (post-write) total yields "spent excluding this transaction" — a valid
  // before-state baseline regardless of whether this write created,
  // resized, or newly categorized the row (see file header).
  const spentBeforeAgorot = spentAfterAgorot + amountAgorot

  const { crossedThreshold, crossedExceeded } = checkThresholdCrossing(
    spentBeforeAgorot,
    spentAfterAgorot,
    allocation.amount_agorot
  )

  const occurredAt = new Date().toISOString()

  if (crossedThreshold) {
    emit({
      type: 'budget.threshold_reached',
      householdId,
      actorId,
      occurredAt,
      payload: {
        budgetId: budget.id,
        categoryId,
        thresholdPercent: 90,
        spentAgorot: spentAfterAgorot,
        allocatedAgorot: allocation.amount_agorot,
      },
    })
  }

  if (crossedExceeded) {
    emit({
      type: 'budget.exceeded',
      householdId,
      actorId,
      occurredAt,
      payload: {
        budgetId: budget.id,
        categoryId,
        spentAgorot: spentAfterAgorot,
        allocatedAgorot: allocation.amount_agorot,
      },
    })
  }
}

async function handleTransactionCreated(event: DomainEvent<'transaction.created', TransactionCreatedPayload>) {
  const { householdId, payload } = event
  await checkAndNotifyThreshold(householdId, event.actorId, {
    categoryId: payload.categoryId,
    amountAgorot: payload.amountAgorot,
    isShared: payload.isShared,
    txnDate: payload.txnDate,
  })
}

// 'transaction.updated'/'transaction.categorized' payloads don't carry the
// full current row (changedFields/previousCategoryId only) — re-fetching by
// id keeps this subscriber independent of exactly which fields the emitting
// hooks choose to put in their payloads, rather than growing those payload
// shapes just to satisfy this one subscriber.
async function handleTransactionMutated(
  event:
    | DomainEvent<'transaction.updated', TransactionUpdatedPayload>
    | DomainEvent<'transaction.categorized', TransactionCategorizedPayload>
) {
  const transactionId = event.payload.transactionId
  const { data: transaction, error } = await supabase
    .from('transactions')
    .select('category_id, amount_agorot, is_shared, txn_date')
    .eq('id', transactionId)
    .maybeSingle()
  if (error || !transaction) return

  await checkAndNotifyThreshold(event.householdId, event.actorId, {
    categoryId: transaction.category_id,
    amountAgorot: transaction.amount_agorot,
    isShared: transaction.is_shared,
    txnDate: transaction.txn_date,
  })
}

on('transaction.created', (event) => {
  void handleTransactionCreated(event)
})

on('transaction.updated', (event) => {
  void handleTransactionMutated(event)
})

on('transaction.categorized', (event) => {
  void handleTransactionMutated(event)
})
