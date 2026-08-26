// Shared query-engine plumbing behind every dev/designQa*Client.ts variant
// (the default authenticated+household fixture, plus the signed-out and
// onboarding variants added for the release-readiness pass's auth/
// onboarding verification — see docs/DESIGN_QA_MODE.md). Extracted once a
// second fixture needed byte-for-byte the same permissive
// PostgrestFilterBuilder stand-in designQaClient.ts already had — the same
// "second caller needs the identical logic" bar every other shared
// extraction in this codebase uses, not a speculative abstraction.
//
// Never imported by the app itself — only by the sibling designQa*Client.ts
// files, which are themselves only ever resolved in when a developer
// explicitly sets DESIGN_QA on their own machine (see metro.config.js).

export interface Result {
  data: unknown
  error: null
}

export type Row = Record<string, unknown>

// A permissive stand-in for PostgrestFilterBuilder. Filters are applied
// where they are cheap and matter for what renders (household scoping, date
// windows, id lookups); everything else is accepted and ignored, which is
// fine for a rendering harness. `withJoins` embeds the nested resources
// (`households(*)`, `categories(name_he, icon)`, etc.) a caller's own real
// query might request — PostgREST returns those as nested objects, so the
// fixture has to as well or screens render nameless rows.
export function createBuilder(tables: Record<string, Row[]>, withJoins: (table: string, select: string, row: Row) => Row) {
  return function builder(table: string) {
    let rows = [...(tables[table] ?? [])]
    let selectStr = '*'
    let single = false
    let maybe = false

    const api: Record<string, unknown> = {}
    const chain = () => api
    const eq = (col: string, val: unknown) => {
      rows = rows.filter((r) => r[col] === val || col === 'household_id' || col === 'user_id')
      return api
    }
    Object.assign(api, {
      select: (q?: string) => { if (typeof q === 'string') selectStr = q; return api },
      insert: chain,
      update: chain,
      upsert: chain,
      delete: chain,
      eq,
      neq: (col: string, v: unknown) => { rows = rows.filter((r) => r[col] !== v); return api },
      // Real comparisons, not pass-throughs. `lt` was a no-op, so
      // useBudgetProgress's `.lt('amount_agorot', 0)` never excluded income
      // and the month's spend came out negative — the kind of thing that
      // reads as an app bug in a screenshot when it is only the harness
      // lying.
      gte: (col: string, v: never) => { rows = rows.filter((r) => (r[col] as never) >= v); return api },
      lte: (col: string, v: never) => { rows = rows.filter((r) => (r[col] as never) <= v); return api },
      lt: (col: string, v: never) => { rows = rows.filter((r) => (r[col] as never) < v); return api },
      gt: (col: string, v: never) => { rows = rows.filter((r) => (r[col] as never) > v); return api },
      is: (col: string, v: unknown) => { rows = rows.filter((r) => (v === null ? r[col] == null : r[col] === v)); return api },
      in: (col: string, v: unknown[]) => { rows = rows.filter((r) => v.includes(r[col])); return api },
      or: chain, not: chain,
      order: chain, limit: chain, range: chain, filter: chain, match: chain,
      single: () => { single = true; return api },
      maybeSingle: () => { maybe = true; return api },
      then: (res: (v: Result) => unknown) => {
        const joined = rows.map((r) => withJoins(table, selectStr, r))
        return Promise.resolve(res({ data: single || maybe ? (joined[0] ?? null) : joined, error: null }))
      },
      catch: () => Promise.resolve({ data: rows, error: null }),
      finally: () => Promise.resolve({ data: rows, error: null }),
    })
    return api
  }
}

// The shape supabase-js's own auth session carries — reused identically by
// every variant that needs an authenticated SESSION (the default fixture,
// and the onboarding variant; the signed-out variant has none at all).
export function createSession(userId: string, email: string) {
  return {
    access_token: 'design-qa-session',
    refresh_token: 'design-qa-session',
    expires_in: 3600,
    token_type: 'bearer',
    user: { id: userId, email, app_metadata: {}, user_metadata: {}, aud: 'authenticated', created_at: '2026-01-01T00:00:00Z' },
  }
}
