// Deterministic label-collision resolution for the Money Journey chart —
// CP8B's own hard production requirement: the S4 prototype showed real
// label overlap under stress data, and the fix has to be a systematic
// algorithm that works for ANY household's real data, not a manual fix for
// one fixture's known label positions.
//
// The strategy is priority lanes + measured collision resolution: every
// candidate keeps its visual node (dot/bar) on the chart regardless of the
// outcome here — this function decides only whether that node ALSO gets a
// text label drawn beside it. Higher-priority candidates (see
// moneyJourneySteps.ts's own tiers) claim label space first; a
// lower-priority candidate whose label would overlap an already-claimed
// slot loses its label but keeps its node, which stays independently
// accessible (see MoneyJourney.tsx's own accessibility handling) — "hide
// lower-priority labels behind accessible event nodes," per the brief's own
// suggested approach.
//
// Deterministic by construction: candidates are sorted by (priority, x)
// before anything is claimed, so feeding the same set of candidates in any
// input order always produces the same shown/hidden result — this is
// verified directly by this file's own tests, not just implied by reading
// the code.

export type LabelCollisionPriority = 'critical' | 'high' | 'routine'

export interface LabelCollisionCandidate {
  id: string
  // Pixel x, in the same coordinate space as every other candidate passed
  // in the same call — the caller's own dailyPointScale output.
  x: number
  priority: LabelCollisionPriority
}

const PRIORITY_RANK: Record<LabelCollisionPriority, number> = { critical: 0, high: 1, routine: 2 }

// Two claimed label slots may not sit closer than this many pixels apart,
// center to center — informed by the label footprints the tablet/desktop
// Money Journey chart actually draws (a resulting-balance figure, a
// cause line, and a date, each ~70-100px wide per
// FinancialTimeline.tsx's own existing chart geometry). Callers may pass a
// wider value for a calmer breakpoint (tablet vs. desktop — see
// MoneyJourney.tsx's own per-variant constants) but never a narrower one
// than a label can actually render inside.
export const DEFAULT_LABEL_SLOT_PX = 76

export function resolveLabelCollisions(
  candidates: readonly LabelCollisionCandidate[],
  slotWidthPx: number = DEFAULT_LABEL_SLOT_PX
): Set<string> {
  const ordered = [...candidates].sort((a, b) => {
    const rankDiff = PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority]
    if (rankDiff !== 0) return rankDiff
    // Deterministic tie-break among same-tier candidates: the one closer to
    // the chart's own start (smaller x) claims its slot first — an
    // arbitrary but STABLE rule, not input-order-dependent.
    return a.x - b.x
  })

  const claimed: number[] = [] // midpoints of already-claimed slots
  const shown = new Set<string>()

  for (const candidate of ordered) {
    const overlaps = claimed.some((claimedX) => Math.abs(claimedX - candidate.x) < slotWidthPx)
    if (!overlaps) {
      claimed.push(candidate.x)
      shown.add(candidate.id)
    }
  }

  return shown
}
