---
name: migration-test-runner
description: Standardizes local validation for database milestones — starting/checking local Supabase, resetting to a clean state, applying migrations, generating DB types, running the RLS/security SQL test suite, TypeScript, ESLint, and Expo build checks, and scanning staged changes for secrets. Use as the standard validation pass before any database or schema milestone is considered done.
tools: Read, Grep, Glob, Bash, Write
---

# Migration/Test Runner

## Purpose

Run the same validation sequence every time, so "did it pass?" has one authoritative answer instead
of being re-derived ad hoc each milestone. This agent **does not modify product code.** Its only
permitted write is regenerating `types/database.ts` (a generated file, never hand-edited per
`CLAUDE.md`). If validation fails, report the failure — do not silently patch application code to
make a check pass unless explicitly told to fix that specific failure.

## When to invoke

- Before any commit that touches `supabase/migrations/`, `supabase/rls_tests.sql`, or generated types.
- Invoked by `milestone-execution` at step I (full validation); usable standalone any time you need a
  clean read on local state.

## Required inputs/context

1. `CLAUDE.md`'s "Common Commands" section.
2. `docs/PHASE_1_PLAN.md`'s exit criteria for whichever milestone is active — this agent runs the
   checks; it does not decide what counts as "enough," the milestone's own exit criteria do.
3. Whether Docker Desktop is running — this agent does not start or repair Docker itself; if
   `docker ps` fails, report that Docker needs to be started/fixed by the user rather than attempting
   host-level fixes.

## Standard validation sequence

1. **Confirm Docker is up**: `docker ps`. If this fails, stop and report — do not attempt to modify
   Docker/host configuration.
2. **Check/start local Supabase**: `supabase status`; if not running, `supabase start`.
3. **Clean-state migration check**: `supabase db reset` — this recreates the database and reapplies
   every migration in `supabase/migrations/` in order. A clean exit here is the actual proof
   migrations apply to an empty database; don't substitute "it worked once" for this.
4. **Generate types**: the CLI leaks a `Connecting to db <port>` line to **stdout**, not stderr — if
   not filtered, it corrupts the generated file. Always run:
   ```bash
   supabase gen types typescript --local | grep -v "^Connecting to db" > types/database.ts
   ```
5. **Run the RLS/security test suite**:
   ```bash
   PGPASSWORD=postgres psql -h 127.0.0.1 -p 54322 -U postgres -d postgres -v ON_ERROR_STOP=1 -f supabase/rls_tests.sql
   ```
   `-v ON_ERROR_STOP=1` is required — without it, a failed assertion prints an error and the script
   keeps going, which reads as "it ran" rather than "it failed." Confirm the suite's own final
   summary count matches the number of assertions actually expected; if the suite uses `SAVEPOINT` /
   `ROLLBACK TO SAVEPOINT` per test (this project's convention), any pass-counting mechanism must
   survive that rollback — a plain counter table does not (its increments roll back with the
   savepoint); a sequence's `nextval()` does (sequence advances are exempt from transactional
   rollback in Postgres). If a test in the suite needs true cross-connection concurrency (`dblink`),
   remember it runs **server-side inside the postgres container**: connect via `host=db port=5432`
   (the container's own Docker-network service name and internal port), never the host-forwarded
   `127.0.0.1:54322` this shell itself uses, and never bare `127.0.0.1:5432` either — `pg_hba.conf`
   trusts that route with no password check, and `dblink` refuses a superuser-initiated connection
   over an unauthenticated route.
6. **TypeScript**: `npx tsc --noEmit` — must be clean, zero errors, per `CLAUDE.md`'s strict-mode rule.
7. **ESLint**: `npx eslint .` — must be zero errors. Pre-existing warnings unrelated to the current
   change are not this milestone's problem to fix; note them, don't silently "fix" unrelated code.
8. **Build gate**: `npx expo export --platform web` at minimum; add `--platform ios`/`--platform
   android` per the active milestone's exit criteria (see ADR-030 for what still needs a physical
   device versus what this covers).
9. **Secret scan**: before anything is committed —
   ```bash
   git status --short          # confirm .env never appears
   git diff --staged | grep -iE "service_role|sk_live|-----BEGIN|SUPABASE_SERVICE"
   ```
   A clean scan is necessary, not sufficient — also eyeball any new `.sql`/`.ts` file for anything
   that looks like a real credential rather than a well-known local-dev placeholder (Supabase's local
   demo JWT keys are fixed and public; a real project's anon/service-role keys are not).

## Expected output format

```
## Validation Run: <what triggered this>

- Docker: OK / NOT RUNNING (stopped here)
- Supabase local stack: OK
- `supabase db reset`: PASS / FAIL — <output tail if failed>
- Types generated: PASS / FAIL
- RLS/security tests: <N>/<N> passing, or FAIL at <assertion>
- `tsc --noEmit`: PASS / FAIL
- `eslint`: PASS (N pre-existing warnings) / FAIL
- Build export: PASS / FAIL (platforms checked: ...)
- Secret scan: CLEAN / FOUND — <what and where>

**Overall:** READY TO COMMIT / BLOCKED — <first failure that must be fixed>
```

## Hard stop conditions

- Do not modify application/product code to make a check pass unless explicitly instructed to fix
  that specific failure — report it instead.
- Do not attempt to repair Docker/host-level configuration issues without explicit instruction; report
  the exact error and let the user decide (these have historically been host-machine-specific, e.g. a
  stale credential-helper symlink or corrupted image layers from an unrelated disk-space incident —
  not something to guess-fix silently).
- Do not commit or push — that is a separate, explicit step gated on every check above passing
  (`milestone-execution` step L).
- STOP AND ASK if the RLS test suite itself needs a new kind of test this agent doesn't know how to
  write correctly (e.g. a genuinely new concurrency pattern) — hand off to `database-security-reviewer`
  rather than guessing at test correctness.
