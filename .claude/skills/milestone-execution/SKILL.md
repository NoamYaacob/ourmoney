---
name: milestone-execution
description: Standard workflow for implementing an OurMoney milestone from docs/PHASE_1_PLAN.md (or whichever phase plan is active) — scope statement, architecture/product-scope review, smallest-approved-scope implementation, tests, adversarial/security review, full validation, and a gated commit. Use whenever starting or resuming work on a numbered milestone. Never advances past the milestone boundary on its own.
---

# Milestone Execution

The standard workflow for taking one OurMoney milestone from "approved to start" to "committed and
pushed," with review gates at the points where past work has actually found real problems (scope
creep, RLS gaps, races, missing grants). Follow the steps in order. Do not skip a step because it
feels obvious this time — the gates exist because "obvious" has been wrong before on this project.

## The one rule that overrides everything else

**Never silently proceed into the next milestone.** When the active milestone's exit criteria are
met, stop, produce the final report (step N), and wait. A milestone being "logically next" or "small
enough to just also do" is never, by itself, approval to start it. This applies even if the user's
original request could be read as covering more than one milestone — restate what you're about to do
and get explicit confirmation before crossing a milestone boundary.

## A. Read active milestone + relevant docs

Read, in order: `ROADMAP.md` (which phase is active), the current phase plan (e.g.
`docs/PHASE_1_PLAN.md`) for the specific milestone and its exit criteria, `CLAUDE.md`, and
`docs/DECISIONS.md` for any ADR the milestone's task list references. Identify exactly which
milestone is active and what "done" means for it — quote the exit-criteria checklist, don't
paraphrase from memory.

## B. State scope and exclusions

Invoke `product-scope-guardian`. Before writing a single line of implementation, state explicitly:
what's in scope, what's out (and which future milestone it belongs to), dependencies/blockers, and
whether the milestone as planned requires an ADR or schema change beyond what's already documented.
Get this in front of the user before proceeding if anything is ambiguous — do not resolve ambiguity by
guessing the more thorough option.

## C. Create implementation plan

A concrete plan: files to create/change, in what order, and why that order (migrations before code
that depends on them, tables before the RLS helpers that query them, etc. — see how
`docs/PHASE_1_PLAN.md` itself orders migration 001 for the pattern). Use `EnterPlanMode`/the plan
workflow for anything non-trivial per your standard operating rules.

## D. Run architecture/product-scope review

Invoke `architecture-reviewer` on the plan. If the plan touches the database, also loop in
`database-security-reviewer` at the design stage, not only after implementation — a bad RLS design is
cheaper to catch before the SQL is written. If the plan touches integration territory (bank/card/
WhatsApp/provider concepts, even peripherally), invoke `integration-boundary-reviewer` too. Resolve
every BLOCKED verdict before proceeding; treat APPROVED WITH CHANGES as required changes, not optional
suggestions.

## E. Implement the smallest approved scope

Build exactly what steps B–D approved. No "while I'm here" additions — if you notice something else
worth doing, name it for a separate task rather than folding it in.

## F. Add/execute tests

Every security-sensitive or non-trivial behavioral change gets a test in the project's existing
convention (`supabase/rls_tests.sql`'s impersonation + `SAVEPOINT`/`ROLLBACK TO` pattern for database
work; the project's eventual client-side test convention for app code). Run them.

## G. Run adversarial/security review where applicable

- Database/RLS/schema changes → `database-security-reviewer`.
- Any implemented feature, especially anything with retries, concurrency, or auth boundaries →
  `qa-adversarial-reviewer`.
- Mobile/Expo UI or state changes → `mobile-expo-reviewer`.

Not every milestone touches every one of these — invoke only what the change actually implicates, but
don't skip one because it seems unlikely to find anything. It's found real, non-obvious bugs before
(a genuine race condition survived initial implementation and a first-pass review in Milestone 2;
only the adversarial pass caught it).

## H. Fix findings

Fix what the review agents found. Re-run the specific check that found each issue to confirm the fix
actually addresses it — don't assume. For anything an agent flagged as a scope or architecture
question rather than a defect, resolve that with the user rather than picking a side yourself.

## I. Run full validation

Invoke `migration-test-runner` for the complete sequence: Docker/Supabase up, `supabase db reset`
(clean-state migration proof), type generation, RLS/security tests, `tsc --noEmit`, `eslint`, Expo
build/export checks appropriate to the milestone's exit criteria. Every check must pass — do not
commit past a failing check "to fix later."

## J. Inspect git diff including untracked files

`git status` alone misses nothing, but a plain `git diff` does — it never shows untracked new files.
Explicitly review new file contents (`git diff --staged` after staging, or read the files directly)
for anything you're about to commit, not just the modified-file diff.

## K. Secret scan

Covered by `migration-test-runner`'s validation sequence — confirm it ran and was clean before
proceeding. Re-check manually if anything about the change touches credentials, tokens, or `.env`.

## L. Commit and push only after all gates pass

Stage exactly the files that belong to this milestone — never `git add -A` blindly; review what's
staged. Write a commit message that states what changed and, where relevant, *why* (a defect found
and fixed is worth a sentence — see the Milestone 2 commit for the pattern). Push only after every
prior step is clean.

## M. STOP at milestone boundary

Once L is done, stop. Do not look ahead into the next milestone's task list and start executing it.

## N. Produce final report

```
## Milestone <N> — Final Report

**Commit:** <SHA>, pushed to <branch>

**Files changed:** <list, grouped by new/modified>

**Schema/API changes:** <migrations added, RPCs added/changed, or "none">

**Tests:** <what was added, pass/fail counts, what they cover>

**Security/adversarial findings:** <what was found, what was fixed, what remains — or "none found">

**Validation status:** <the migration-test-runner summary — every check, pass/fail>

**Warnings:** <anything worth the user's attention that isn't a blocking failure — pre-existing
issues not in scope to fix, environment quirks hit, things deferred with a named reason>

**Next milestone scope:** <exactly what's next per the phase plan, stated so the user can approve or
redirect it — not started, not implied as approved>

**User action needed:** <anything the user must configure, create, or decide before the next
milestone can start — e.g. an external account, a credential, a product decision>
```

Then stop and wait.
