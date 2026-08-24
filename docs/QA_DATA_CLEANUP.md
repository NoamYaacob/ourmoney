# Cleaning up `[QA]`-prefixed records in the real database

The real deployed app (Vercel preview + its Supabase project) currently
shows `[QA]`-prefixed rows throughout the product — `[QA] ביטוח רכב`,
`[QA] מנוי סטרימינג`, `[QA] עו"ש ראשי`, `[QA] חיסכון`, `[QA] בילוי`,
uncategorized `[QA]` transactions, etc. — which feed real calculations
(Home, Budget, alerts, accounts) the same as any other row.

## Where these come from

Not from this codebase. A full-history search across every branch —
`git log --all -p -S"[QA]"` — finds zero occurrences of that string in any
committed source file, migration, or seed script, ever. This repo has no
seed script at all (`supabase/seed.sql` does not exist) and no other
mechanism that writes demo data into a real Supabase project.

The only fixture data this codebase ships is `dev/designQaClient.ts` (see
[DESIGN_QA_MODE.md](DESIGN_QA_MODE.md)), and it is **not** the source:

- Its dataset uses realistic Hebrew names taken directly from the Design
  files ("שופרסל דיל", "ארנונה דו־חודשית", ...) — nothing in it is or has
  ever been prefixed with a `[QA]`/debug marker.
- It is only ever wired in when a developer explicitly sets `DESIGN_QA=1`
  before running `expo start`/`expo export` — a flag no normal build
  (including whatever Vercel runs) ever sets.
- Its `insert`/`update`/`upsert`/`delete` methods are inert passthroughs
  (`chain` in that file) that never mutate its in-memory `TABLES` object and
  never touch a real Supabase connection — there is no code path, accidental
  or otherwise, by which anything typed while `DESIGN_QA=1` is set could
  reach the real database, and no code path by which real data could leak
  into that fixture either. This was re-verified line-by-line, not assumed.

Conclusion: these are real rows, entered by hand directly against the real
Supabase project at some point (almost certainly manual QA/exploratory
testing performed straight against the real backend, outside of any script
in this repo), not something any code path here generates.

## Cleanup

[`supabase/admin/cleanup_qa_records.sql`](../supabase/admin/cleanup_qa_records.sql)
is a reviewed, three-part SQL script for whoever has real access to that
Supabase project:

1. **Audit** — read-only queries that list every `[QA]`-prefixed row across
   every table it could appear in, plus which household(s) they belong to,
   plus which *real* (non-QA) transactions reference a QA-marked recurring
   template or instalment plan.
2. **Cleanup** — wrapped in an explicit `begin;` / inspect / `commit;`-or-
   `rollback;` transaction. Every delete is guarded (`NOT EXISTS`) against
   every table that could still reference the row, so a QA-marked account or
   category that a real household also ended up using is *skipped and
   reported*, never force-deleted.
3. **Audit after** — the same read-only queries, to confirm what's left.

This script has **not** been run — this environment has no Supabase
credentials for the real project, and per this task's own instructions,
destructive cleanup against an unknown database is never executed
automatically. It needs a human with real access to read part 1's output,
run part 2 deliberately, and read part 3's output before trusting it's done.
