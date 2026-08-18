// Pure selection-state helpers for the Transactions screen's multi-select
// mode. Selection itself is plain component state (a Set<string> of
// transaction ids) — not route params like the filter state, since
// selection is ephemeral UI state with no reason to be
// shareable/bookmarkable or to survive a fresh navigation the way filter
// criteria do.

export function toggleSelection(selected: ReadonlySet<string>, id: string): Set<string> {
  const next = new Set(selected)
  if (next.has(id)) next.delete(id)
  else next.add(id)
  return next
}

export function selectAllVisible(visibleIds: readonly string[]): Set<string> {
  return new Set(visibleIds)
}

// The hard invariant behind "selection must operate on the current
// filtered result set, never on hidden/stale ids": whatever the selection
// Set currently contains, only the ids that are ALSO in the current
// visible/filtered list are ever actually used for a bulk write. Called at
// the exact moment of submitting the bulk action (belt-and-suspenders on
// top of the screen's own reconciliation-on-filter-change effect) so a
// stale id can never reach the database even if some other bug let it
// survive in the Set.
export function intersectWithVisible(selected: ReadonlySet<string>, visibleIds: readonly string[]): string[] {
  const visible = new Set(visibleIds)
  return [...selected].filter((id) => visible.has(id))
}
