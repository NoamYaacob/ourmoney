// Shared conflict-detection contract for every optimistic-concurrency RPC
// added by migration 009 (ADR-036). Every one of those RPCs returns
// {ok:true, version, ...} on success or {ok:false, error:'conflict'|'not_found'|...}
// on failure — this module is the single place that turns that JSON shape
// into a typed error a screen can branch on with `instanceof`, so no caller
// ever has to string-match a raw Postgres error or duplicate this parsing.

export type ConcurrencyErrorKind = 'conflict' | 'not_found'

export class ConcurrencyError extends Error {
  readonly kind: ConcurrencyErrorKind

  constructor(kind: ConcurrencyErrorKind) {
    super(kind)
    this.name = 'ConcurrencyError'
    this.kind = kind
  }
}

export function isConflictError(error: unknown): error is ConcurrencyError {
  return error instanceof ConcurrencyError && error.kind === 'conflict'
}

export function isNotFoundError(error: unknown): error is ConcurrencyError {
  return error instanceof ConcurrencyError && error.kind === 'not_found'
}

export interface VersionedMutationResult {
  ok: boolean
  error?: string
  version?: number
}

// Throws ConcurrencyError for the two version-related outcomes a screen must
// distinguish, or a plain Error (carrying the RPC's own validation error
// code, e.g. 'invalid_amount') for everything else.
export function throwOnMutationFailure(result: VersionedMutationResult): void {
  if (result.ok) return
  if (result.error === 'conflict' || result.error === 'not_found') {
    throw new ConcurrencyError(result.error)
  }
  throw new Error(result.error ?? 'unknown_error')
}
