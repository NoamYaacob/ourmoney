# Functional completeness audit

Produced by reading the actual component/hook/mutation source for every
major feature and every named interactive control — not by inference from
what a screen looks like. Classification legend:

- **Fully functional** — every control does what it visually implies, backed
  by a real Supabase read/write or a real, documented product decision.
- **Partially functional** — most of the feature is real; a specific,
  named gap remains.
- **Presentation only** — the UI exists and is honest about being a preview
  (labeled as such), with no working backend path.
- **Intentionally disabled** — deliberately inert, gated on an explicit,
  documented product/business decision (not a bug, not unfinished).

## By feature

| Feature | Status | Notes |
|---|---|---|
| Home | Fully functional | Hero, commitments, budget pace, alerts all live-computed. Search now real (was a disguised nav button — fixed). Retry now wired on the hero, budget-pace, and recent-transactions error states. |
| Transactions | Partially functional | Search, filters, CSV import, add/edit/delete, category/account assignment, desktop bulk-classify are all real. **Mobile has no bulk-classify** — a header comment used to claim otherwise; corrected. |
| Budget | Fully functional | Allocation edit/save is a real atomic RPC (`save_budget_allocations`), not a local-only edit. Copy-previous-month and remove-allocation are real. |
| Cash Flow | Fully functional | Forecast recomputes end-to-end on horizon change; confirmed populated against fixture data, not "almost empty." |
| Planning | Fully functional | Honestly presentation-only navigation glue (its own header comment says so) over three already-functional screens — not a stub. |
| Recurring | Fully functional | Add/edit/pause/resume/skip/delete are all real, version-gated mutations. |
| Obligations | Fully functional | Add/mark-paid (optionally atomic with a linked transaction)/delete are real. |
| Installments / Credit & Payments | Fully functional | Plan create/edit/delete real; charges materialize server-side on schedule. Billing-cycle cards are correctly read-only (computed live — nothing to refresh). The one gap found (no fallback when a real card has no cycle data yet) is fixed. |
| Goals | Fully functional | Add/contribute/delete real; completion is intentionally automatic (server-derived), not a missing manual control. |
| Accounts | Fully functional | Add/edit/archive/admin-delete real; balances and credit-cycle spend computed live from transactions, never a stale column. |
| Alerts | Fully functional (by design, stateless) | Computed live from six+ real data sources every render. No dismiss/mark-read — an explicit, documented product decision, not a bug. |
| Connections | Intentionally disabled | Gated on written confirmation from Israeli fintech counsel on the Open Banking licensing route (`docs/OPEN_BANKING.md`) — every row stays disabled, no tap simulates connecting. The preview screen is explicitly, permanently labeled as a mockup with fictional data ("בנק לדוגמה"), never real institution names. |
| Household | Fully functional | Invite (real token + share), remove member, leave-household (real RPC with admin succession) all persist. |
| Settings | Fully functional | Every visible control persists — Supabase-backed where the data is shared (profile, household name, categories/rules), secure-storage-backed where it's device-local (biometric, appearance). |
| CSV import | Fully functional | Upload → parse → column mapping → dedupe (including a fresh server re-check at commit time) → write is fully wired, using the same real transaction-insert path as manual entry. |
| Authentication | Fully functional | Sign-in/sign-up/reset-password all call real `supabase.auth.*` mutations via `useSignIn`/etc. hooks. |

## Cross-cutting gaps found and fixed this pass

1. **Home search was fake** — a styled `Pressable` that always navigated to
   `/transactions` untouched, regardless of any text (there was no text
   field to type into). Now a real `TextInput` with real query state,
   submitting through the same `q` param Transactions' own search uses.
2. **No retry affordance anywhere.** `ErrorMessage` took no action prop at
   all — a failed query's only recovery path was navigating away and back.
   Added an optional `onRetry`, wired into Home (hero/budget-pace/recent
   transactions), Cash Flow, Budget, Transactions, and Credit & Payments.
   **Not every `ErrorMessage` call site got it** — see the interaction-fix
   commit for the exact list; the rest is a scoped follow-up.
3. **No in-app back control on any nested/detail screen.** Every one of
   them ran under a Tabs navigator with `headerShown:false`; `Screen`
   itself drew no header. `Mobile.dc.html` draws a chevron-back on every
   detail frame it has — this was a real Design-conflicting gap, not a
   deliberate choice. `Screen` now takes an optional `onBack`, wired into
   every nested/detail route.

## Gaps found and left open (by choice, not oversight)

- **Mobile bulk category assignment does not exist**, despite a comment
  claiming parity with desktop. Implementing it properly (selection-mode
  UI, per-row select affordance, wiring `useBulkUpdateTransactionCategory`)
  is a real feature addition, not a quick fix — flagged rather than rushed.
- **No overflow/kebab menu exists anywhere in the app.** The one
  ellipsis-style icon (desktop sidebar, next to the household member row)
  matches `OurMoney - Desktop.dc.html`'s own mockup exactly, and the row it
  sits in is a real, working control (navigates to Settings) — judged
  defensible as-is rather than a fake control, but noted here rather than
  silently accepted.
- **Retry is not on every `ErrorMessage` call site** (~25 of the ~34 in the
  app still render a plain message with no action) — the primitive is
  reusable and additive; extending coverage to every screen is
  straightforward follow-up work, not architecturally blocked.
