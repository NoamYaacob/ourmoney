// CP8E — Financial Pulse composition hook. Wires the read-only pure engine
// (lib/engines/pulse/computeFinancialPulse.ts) to real data, and owns the
// one piece of imperative lifecycle this checkpoint's brief calls
// "critical": recording a new snapshot only AFTER the current render has
// already shown the comparison, exactly once per resolved mount — never on
// mount before the user could see anything, never repeatedly on re-render.
//
// Composes only PRE-EXISTING, unmodified hooks — no new Supabase query
// beyond useFinancialPulseSnapshot's own single-row read:
//   - useTransactions(householdId) — the exact same hook/query-key prefix
//     usePriceIncreaseDetections and the Transactions screen already use;
//     TanStack Query dedupes this to one network request regardless of how
//     many callers ask for it in the same render tree.
//   - usePriceIncreaseDetections(householdId) — reuses its own detection
//     output as-is; this hook never re-implements price-increase logic.
//   - useFinancialPulseSnapshot/useRecordFinancialPulseSnapshot — this
//     feature's own thin data layer (see that file's header).
//
// Callers must pass in an ALREADY-loaded Safe-to-Spend result (from
// useSafeToSpend, which Home already calls) rather than this hook fetching
// its own — same "compose what the caller already has" discipline
// features/alerts/hooks/useFinancialAlerts.ts follows for its own inputs,
// and the only way to guarantee Financial Pulse's current figure is
// IDENTICAL to the one Home's own hero renders, never a second, divergent
// read of the same truth.

import { useEffect, useRef } from 'react'
import { useTransactions } from '@/features/transactions/hooks/useTransactions'
import { usePriceIncreaseDetections } from '@/features/recurring/hooks/usePriceIncreaseDetections'
import { captureException } from '@/lib/monitoring/crashReporting'
import { computeFinancialPulse, type FinancialPulseResult } from '@/lib/engines/pulse/computeFinancialPulse'
import {
  useFinancialPulseSnapshot,
  useRecordFinancialPulseSnapshot,
} from './useFinancialPulseSnapshot'

export interface UseFinancialPulseSafeToSpendInput {
  hasData: boolean
  safeToSpendAgorot: number
}

export function useFinancialPulse(
  householdId: string | null | undefined,
  userId: string | null | undefined,
  safeToSpend: UseFinancialPulseSafeToSpendInput
): { pulse: FinancialPulseResult | null } {
  const { previousSnapshot, hasData: hasSnapshotData } = useFinancialPulseSnapshot(householdId, userId)
  const { transactions } = useTransactions(householdId)
  const { detections: priceIncreases } = usePriceIncreaseDetections(householdId)
  const recordSnapshot = useRecordFinancialPulseSnapshot()

  // Never render a comparison built from a snapshot read that hasn't
  // genuinely resolved yet — "no row" (a real, meaningful previousSnapshot
  // === null, i.e. first visit) must never be rendered as if it were
  // "haven't checked." Rendering (this value) is intentionally gated more
  // strictly than recording (the effect below): a failed/incomplete read
  // means "we can't prove a comparison," not "we can't record the truth we
  // do have."
  const pulse =
    safeToSpend.hasData && hasSnapshotData
      ? computeFinancialPulse({
          previousSnapshot,
          currentSafeToSpendAgorot: safeToSpend.safeToSpendAgorot,
          transactionsSincePreviousCandidate: transactions.map((t) => ({
            id: t.id,
            description: t.description,
            amountAgorot: t.amount_agorot,
            txnDate: t.txn_date,
            isTransfer: t.transfer_id !== null,
            isExcluded: t.is_excluded,
          })),
          priceIncreases: priceIncreases.map((p) => ({
            description: p.description,
            increaseAgorot: p.increaseAgorot,
            detectedAt: p.detectedAt,
          })),
        })
      : null

  // Recording only needs the CURRENT truth, never the previous read's
  // success — a household that has never been able to read its own
  // previous snapshot (a transient error, or a genuinely first-ever write)
  // still deserves its true current figure recorded, so the NEXT visit has
  // something real to compare against. Gated on safeToSpend.hasData alone:
  // never records a fake zero when Safe-to-Spend itself hasn't resolved.
  const alreadyRecordedRef = useRef(false)
  useEffect(() => {
    if (!householdId || !userId || !safeToSpend.hasData) return
    if (alreadyRecordedRef.current) return
    alreadyRecordedRef.current = true

    recordSnapshot.mutate(
      { householdId, userId, safeToSpendAgorot: safeToSpend.safeToSpendAgorot },
      {
        // A failed write must never surface to the user or block Home —
        // it only means the NEXT visit loses one comparison opportunity,
        // not a broken screen. Logged through the same centralized,
        // scrubbed crash-reporting layer app/_layout.tsx's own
        // AppErrorBoundary uses (see that file's header comment) — no
        // monetary value in the logged context, only which household.
        onError: (error) => {
          captureException(error, { context: 'financial_pulse_snapshot_write', householdId })
        },
      }
    )
    // Deliberately re-runs only when the identity of what's being recorded
    // changes (a different household/user, matching a real re-mount for a
    // different session) or when hasData FLIPS from false to true (the
    // first resolved reading this mount) — NOT on every
    // safeToSpendAgorot fluctuation within one mount, which would violate
    // "avoid repeated writes on re-render." alreadyRecordedRef is the
    // actual single-fire guard; this dependency array only needs to be
    // stable enough not to fire spuriously before that guard is ever set.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [householdId, userId, safeToSpend.hasData])

  return { pulse }
}
