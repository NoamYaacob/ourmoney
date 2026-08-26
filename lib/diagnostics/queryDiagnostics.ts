// Temporary, opt-in, preview-only diagnostic capture for the real-runtime
// investigation into Cash Flow / Home ("מה מגיע") / Credit & Payments
// failing on the deployed Vercel preview in ways that never reproduce
// against DESIGN_QA fixture data or the local test suite. Exists to answer
// one question this environment has no other way to answer: which exact
// Supabase request is failing, with what PostgREST error, for which
// household, and does an authenticated user id exist at the time.
//
// SAFETY MODEL — read before extending this file:
//   - Recording is OFF by default and stays off until a user on the actual
//     device explicitly opts in (see isDiagnosticsEnabled below). No entry
//     is ever captured, logged, or held in memory otherwise — this file's
//     code shipping in the bundle is not the same as it doing anything.
//   - Never records an access/refresh token, anon key, or any monetary
//     value. Only: which hook, which table/rpc, the query's own
//     non-secret parameters (household id, date ranges, account ids —
//     already visible in this app's own UI, not secrets), whether a
//     session existed, and the PostgREST error shape (code/message/
//     details/hint) plus HTTP status.
//   - Nothing here is reachable from any visible nav item — see
//     app/(app)/diagnostics.tsx's own header for how it's reached.
//   - This is a diagnostic tool for this investigation, not a permanent
//     product feature — remove this file, its call sites, and the
//     diagnostics route once the real root cause is confirmed and fixed.

export interface QueryDiagnosticEntry {
  id: number
  timestamp: number
  hook: string
  table: string
  operation: 'select' | 'rpc'
  params: Record<string, unknown>
  hadUserId: boolean
  hadHouseholdId: boolean
  ok: boolean
  status: number | undefined
  statusText: string | undefined
  code: string | undefined
  message: string | undefined
  details: string | undefined
  hint: string | undefined
  durationMs: number
}

const MAX_ENTRIES = 300
let buffer: QueryDiagnosticEntry[] = []
let nextId = 1
const listeners = new Set<() => void>()

function notify() {
  for (const l of listeners) l()
}

export function subscribeToQueryDiagnostics(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export function getQueryDiagnostics(): QueryDiagnosticEntry[] {
  return buffer
}

export function clearQueryDiagnostics(): void {
  buffer = []
  notify()
}

const STORAGE_KEY = 'ourmoney_diag'

// Web only — this investigation is scoped to the deployed web preview, and
// `localStorage`/`window` reads must stay guarded the same way
// lib/supabase/client.ts's own web/native split already does, or this
// throws on native.
//
// Release-readiness pass finding: this had no build-mode guard at all — any
// visitor to a production deployment could turn on request capture (and
// have every instrumented household id, account id, and PostgREST error
// recorded) just by adding ?diag=1 to the URL. Never a secret/token/money
// leak per this file's own safety model above, but production tooling that
// activates for a normal user by URL parameter is exactly the kind of
// leftover this pass exists to close. __DEV__ is false in every production/
// exported build (Expo/Metro's standard dev-mode global — the same signal
// lib/monitoring/crashReporting.ts already keys its own dev/prod split on),
// so gating here keeps this useful for local investigation while making it
// fully inert — no URL param, no stored flag, ever turns it on — once built
// for production.
export function isDiagnosticsEnabled(): boolean {
  if (!__DEV__) return false
  if (typeof window === 'undefined') return false
  try {
    if (new URLSearchParams(window.location.search).get('diag') === '1') {
      window.localStorage.setItem(STORAGE_KEY, '1')
      return true
    }
    return window.localStorage.getItem(STORAGE_KEY) === '1'
  } catch {
    // Private-browsing/storage-blocked contexts throw on access, not just
    // on read failure — never let a diagnostic tool break the real app.
    return false
  }
}

export function setDiagnosticsEnabled(enabled: boolean): void {
  if (typeof window === 'undefined') return
  try {
    if (enabled) window.localStorage.setItem(STORAGE_KEY, '1')
    else window.localStorage.removeItem(STORAGE_KEY)
  } catch {
    // Ignore — see isDiagnosticsEnabled.
  }
}

interface PostgrestLikeResponse<T> {
  data: T | null
  error: { code?: string; message: string; details?: string | null; hint?: string | null } | null
  status?: number
  statusText?: string
}

// Wraps exactly one Supabase request. Deliberately does NOT change the
// resolved value's shape or throw/swallow behavior — every call site keeps
// its existing `if (error) throw error` immediately after. When diagnostics
// are off (the default), this is a zero-overhead passthrough: no session
// lookup, no recording, no behavior change whatsoever.
export async function diagnoseQuery<T>(
  hook: string,
  table: string,
  operation: 'select' | 'rpc',
  params: Record<string, unknown>,
  run: () => PromiseLike<PostgrestLikeResponse<T>>
): Promise<PostgrestLikeResponse<T>> {
  if (!isDiagnosticsEnabled()) return run()

  const startedAt = Date.now()
  // Read directly off the module-level client rather than importing
  // useAuth (a hook) — this file runs inside queryFns, not components.
  // getSession() resolves from GoTrue's in-memory cache after the first
  // call, so this adds negligible latency and never triggers a network
  // request of its own.
  let hadUserId = false
  try {
    const { supabase } = await import('@/lib/supabase/client')
    const { data } = await supabase.auth.getSession()
    hadUserId = !!data.session?.user?.id
  } catch {
    // If even the session check fails, record that as "no user id" rather
    // than losing the query's own diagnostic entry over it.
  }

  const result = await run()
  const entry: QueryDiagnosticEntry = {
    id: nextId++,
    timestamp: Date.now(),
    hook,
    table,
    operation,
    params,
    hadUserId,
    hadHouseholdId: !!params.householdId,
    ok: !result.error,
    status: result.status,
    statusText: result.statusText,
    code: result.error?.code,
    message: result.error?.message,
    details: result.error?.details ?? undefined,
    hint: result.error?.hint ?? undefined,
    durationMs: Date.now() - startedAt,
  }
  buffer.push(entry)
  if (buffer.length > MAX_ENTRIES) buffer = buffer.slice(buffer.length - MAX_ENTRIES)
  notify()

  if (!entry.ok) {
    // eslint-disable-next-line no-console -- deliberate: this is the
    // diagnostic tool itself, gated behind isDiagnosticsEnabled() above.
    console.warn(`[ourmoney-diag] ${hook} -> ${table} FAILED`, {
      code: entry.code,
      message: entry.message,
      details: entry.details,
      hint: entry.hint,
      status: entry.status,
      params: entry.params,
      hadUserId: entry.hadUserId,
    })
  }

  return result
}
