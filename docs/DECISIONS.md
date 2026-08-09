# Architecture Decision Records

Lightweight ADRs. Each records a decision, why it was made, and what it costs.

Records are append-only. When a decision is reversed, add a new record superseding the old one
rather than editing history.

**Status values:** `Accepted` · `Accepted (conditional)` · `Provisional` · `Superseded by ADR-N` · `Open`

| # | Decision | Status |
|---|---|---|
| [001](#adr-001) | Expo + React Native as the client platform | Accepted |
| [002](#adr-002) | Supabase as the entire backend for MVP | Accepted |
| [003](#adr-003) | No server layer, no tRPC/Hono, until Open Banking | Accepted |
| [004](#adr-004) | Supabase JS client + raw SQL migrations, no ORM | Accepted |
| [005](#adr-005) | Single repository, no monorepo tooling | Accepted |
| [006](#adr-006) | `household`, not `couple`, as the core entity | Accepted |
| [007](#adr-007) | Money stored as integer agorot | Accepted |
| [008](#adr-008) | RLS as the primary authorization mechanism | Accepted |
| [009](#adr-009) | Invitation by token + native share sheet | Accepted |
| [010](#adr-010) | `accept_invitation` as SECURITY DEFINER RPC | Accepted (conditional) |
| [011](#adr-011) | NativeWind v4 stable for styling | Provisional |
| [012](#adr-012) | Deterministic engines compute, AI only explains | Accepted |
| [013](#adr-013) | Event-driven boundaries without an event bus | Accepted |
| [014](#adr-014) | Notification channels decoupled from domain logic | Accepted |
| [015](#adr-015) | Benchmarks are ranges, never verdicts | Accepted |
| [016](#adr-016) | Financial health score must be explainable | Accepted |
| [017](#adr-017) | Versioned provenance for all external financial rules | Accepted |
| [018](#adr-018) | Four-level regulatory separation | Accepted |
| [019](#adr-019) | Coarse roles in MVP, richer member types later | Accepted |
| [020](#adr-020) | One household per user in MVP | Accepted |
| [021](#adr-021) | Document the vision, ship the MVP | Accepted |
| [022](#adr-022) | No INSERT/UPDATE policy on `household_members` | Accepted |
| [023](#adr-023) | Structural RLS guards over enumerated assertions | Accepted |

---

## ADR-001
### Expo + React Native as the client platform

**Status:** Accepted

**Context.** OurMoney is a mobile-first product for Israeli households. The alternatives were a PWA,
native iOS + Android, or React Native.

**Decision.** Expo (managed workflow) with Expo Router.

**Rationale.**
- A budgeting app needs a home-screen icon, push notifications, and biometric auth. A PWA gets these
  poorly or not at all, especially on iOS.
- React Native handles RTL properly through `I18nManager` — the entire layout tree flips, rather than
  requiring per-component direction handling.
- Two native codebases is not justifiable at this team size.
- Expo removes most of the native toolchain burden and provides `expo-secure-store`,
  `expo-local-authentication`, and `expo-notifications` as first-party modules.

**Cost.** Some native capabilities require an EAS development build rather than Expo Go. Expo SDK
upgrades occasionally require dependency work.

---

## ADR-002
### Supabase as the entire backend for MVP

**Status:** Accepted

**Context.** The MVP needs auth, a relational database, and realtime sync between partners. Object
storage will be needed for receipt photos in POST-MVP.

**Decision.** Supabase provides all of these. No other backend service in MVP.

**Rationale.**
- PostgreSQL gives real ACID transactions — mandatory for financial data.
- Row-Level Security enforces household isolation at the database layer, not in application code
  that can be bypassed.
- Realtime `postgres_changes` gives partner-sees-partner sync with no polling and no extra service.
- Auth, storage, and the database are one product with one set of credentials, so the later
  addition of receipt storage needs no new vendor.

**Cost.** Vendor concentration. Mitigated by the fact that the underlying store is plain PostgreSQL —
the schema and data are portable even if Supabase is not.

---

## ADR-003
### No server layer, no tRPC or Hono, until Open Banking

**Status:** Accepted

**Context.** The initial architecture proposal included tRPC on Hono as an API layer between the app
and the database.

**Decision.** The mobile app talks to Supabase directly using the anon key. A server layer is
introduced only when Open Banking requires it.

**Rationale.**
- The MVP has no operation that requires a secret the client cannot hold. RLS already enforces every
  authorization rule.
- An API layer at this stage adds a deployment target, a second codebase, latency, and a source of
  type drift — in exchange for nothing.
- The trigger for adding it is concrete and known: bank OAuth tokens must never reach a client device.
  That is Phase OPEN BANKING, not now.

**Cost.** Some logic that would naturally live server-side (recurring transaction generation, rule
application on import) runs on the client in MVP. This is acceptable because none of it is
security-sensitive and all of it is idempotent. When the server layer arrives, this logic moves.

**Related:** ADR-012 (engines are pure functions, so they move server-side without a rewrite).

---

## ADR-004
### Supabase JS client and raw SQL migrations, no ORM

**Status:** Accepted

**Context.** Drizzle ORM was proposed for type-safe database access.

**Decision.** Use the Supabase JS client with types generated by `supabase gen types typescript`.
Schema changes are hand-written SQL migration files.

**Rationale.**
- Generated Supabase types already provide end-to-end type safety for queries.
- RLS policies, `SECURITY DEFINER` functions, triggers, and partial indexes are all expressed more
  clearly in SQL than through an ORM abstraction.
- Since RLS is the security boundary, the SQL must be reviewed carefully and directly. Hiding it
  behind an ORM makes security review harder.
- One less dependency, one less thing to keep in sync.

**Cost.** No compile-time checking of the SQL itself. Mitigated by regenerating types after every
migration and by the RLS test suite.

---

## ADR-005
### Single repository, no monorepo tooling

**Status:** Accepted

**Context.** Turborepo with `apps/` and `packages/` was proposed.

**Decision.** One flat Expo application repository with a feature-oriented internal structure.

**Rationale.**
- There is exactly one deployable artifact. Monorepo tooling solves coordination problems between
  multiple artifacts that do not exist yet.
- Turborepo adds build configuration, workspace resolution, and cache setup — real ongoing cost for
  a benefit that only materializes with a second app.

**Cost.** When the server layer and a web app arrive, the repository will need restructuring. This is
a known, bounded, one-time cost, and it is cheaper than carrying monorepo overhead through the entire
MVP.

**Revisit when:** the server layer is introduced (Phase OPEN BANKING).

---

## ADR-006
### `household`, not `couple`, as the core entity

**Status:** Accepted

**Context.** The product is initially aimed at couples. Naming the entity `couple` would match the
early UX exactly.

**Decision.** The entity is `household`, with an `household_members` join table supporting N members.

**Rationale.**
- A `couples` table with two user columns would have to be destroyed to support children, teenagers,
  dependents, or a supported parent. That is a data migration on the most-referenced table in the
  schema, touching every foreign key.
- The cost of the general model today is one join table. The cost of retrofitting it later is a
  rewrite.
- The UX can still be tuned entirely for two partners. Schema generality and UX specificity are
  independent choices.

**Cost.** Marginally more query complexity in MVP (a join instead of a column comparison).

**Related:** ADR-019 (permissions), PRODUCT_VISION.md §6.

---

## ADR-007
### Money stored as integer agorot

**Status:** Accepted

**Context.** Monetary values need a representation in the database and in TypeScript.

**Decision.** All money is `BIGINT` in PostgreSQL and integer `number` in TypeScript, denominated in
agorot (1 ILS = 100 agorot). Column and field names carry the `_agorot` / `Agorot` suffix. Conversion
to a display string happens in exactly one module, `lib/money/format.ts`.

**Rationale.**
- IEEE-754 floats cannot represent `0.1` exactly. Summing a year of transactions in floats produces
  visible, unexplainable rounding errors in a product whose entire value proposition is numeric trust.
- `NUMERIC`/`DECIMAL` would also be correct, but it serializes to JavaScript as a string or a lossy
  float through the Supabase client, requiring a decimal library and careful handling at every
  boundary. Integers survive JSON round-trips exactly.
- The naming convention makes violations visible in code review — a variable called `amountAgorot`
  holding `129.99` is obviously wrong.

**Cost.** Every display path must divide by 100, and every input path must multiply and round. Both
are centralized.

**Note.** `BIGINT` exceeds JavaScript's `Number.MAX_SAFE_INTEGER` in principle. At agorot precision
that limit is roughly ₪90 trillion, so it is not a practical concern for household finance. If the
product ever models institutional-scale sums, revisit.

---

## ADR-008
### RLS as the primary authorization mechanism

**Status:** Accepted

**Context.** The mobile client talks to the database directly. Something must prevent Household A
from reading Household B's data.

**Decision.** Every financial table has RLS enabled. Every policy checks household membership via the
`is_household_member(household_id)` / `is_household_admin(household_id)` helper functions.
Authorization is never implemented in client code alone.

**Rationale.**
- Client-side authorization is not authorization. A modified client, or a direct call with a stolen
  anon key and a valid JWT, bypasses it entirely.
- The anon key is public by design. RLS is what makes that safe.
- Enforcing at the database means every access path — app, future server, SQL console, admin
  tooling — is covered by the same rule.

**Consequences.**
- RLS policies are written in the same migration file as the table they protect. A table without
  policies must never be merged.
- `supabase/rls_tests.sql` proves cross-household isolation and must pass before any migration merges.
- The `household_members(user_id, household_id)` index is load-bearing: it is consulted on every
  single row access in the system.

---

## ADR-009
### Invitation by token and native share sheet

**Status:** Accepted

**Context.** A user must be able to invite their partner. Options were transactional email,
SMS, or a shareable link.

**Decision.** MVP generates an invitation token, builds a deep link (`ourmoney://invite/<token>`),
and opens the OS share sheet. No transactional email infrastructure.

**Rationale.**
- WhatsApp is the dominant messaging channel in Israel. A share sheet puts the invite directly into
  the conversation the couple is already having.
- Transactional email requires choosing a provider, domain verification, SPF/DKIM setup, deliverability
  monitoring, and template management — significant setup for a flow that the share sheet handles better.
- SMS costs money per message and is a worse experience than WhatsApp locally.

**Cost.** No invite is possible when the partner is not reachable through a messaging app on the same
device — an edge case for a two-person household. Email invitations are listed as `[NEXT]` in
FEATURES.md.

---

## ADR-010
### `accept_invitation` as a SECURITY DEFINER RPC

**Status:** Accepted (conditional)

**Context.** Accepting an invitation requires reading the `invitations` row and inserting into
`household_members`. But the RLS policy on `invitations` requires household membership to read a row —
which the invitee does not yet have. A circular dependency.

**Decision.** A `SECURITY DEFINER` PostgreSQL function performs validation and membership insertion
atomically, bypassing RLS in a tightly controlled way.

**Rationale.** The alternatives are worse:
- A permissive RLS policy allowing anyone to read `invitations` by token turns the table into an
  enumeration target and leaks household IDs.
- Doing it client-side in two steps is non-atomic — a failure between reading and inserting leaves
  the invitation consumed but the user not a member.

**Conditions.** This function is a deliberate hole in the RLS boundary and is only acceptable if all
of the following hold. Every one is verified by a test in `supabase/rls_tests.sql`:

1. `SET search_path = public, pg_temp` — fixed, to prevent search-path hijacking.
2. Rejects any call where `auth.uid() IS NULL` — no anonymous acceptance.
3. Validates the token exists.
4. Validates `status = 'pending'` — a consumed invitation cannot be replayed.
5. Validates `expires_at > NOW()`.
6. Returns early if the caller is already a member — no duplicate membership, no error leak.
7. Runs as a single atomic statement block — insert and status update succeed or fail together.
8. Locks the invitation row (`FOR UPDATE`) to prevent concurrent double-acceptance.
9. Returns a generic failure for invalid tokens — never reveals whether a token existed, expired,
   or was already used.
10. Grants `EXECUTE` to `authenticated` only, never to `anon`.

**Cost.** One reviewed exception to the "RLS enforces everything" rule. Accepted because it is small,
auditable, and explicitly tested.

---

## ADR-011
### NativeWind v4 stable for styling

**Status:** Provisional — verify at scaffold time

**Context.** The styling options were NativeWind (Tailwind syntax for React Native), React Native
`StyleSheet` with a hand-rolled theme, or a component library like Tamagui.

**Findings (verified August 2026).**
- Expo SDK 57 is the current stable release (June 2026), shipping React Native 0.86 and React 19.2.
- NativeWind maintains two tracks: **v4 stable** (Tailwind v3) and **v5 preview** (Tailwind v4).
- NativeWind lists Expo SDK 57 as supported, and **v4 is the track recommended for production**.
- NativeWind v4 had a genuine Reanimated v4 peer-dependency conflict starting with Expo SDK 54;
  this was resolved in NativeWind **v4.2.0+**. Any pinned version must be ≥ 4.2.0.

**Decision.** Use NativeWind v4 stable, pinned to ≥ 4.2.0, on Expo SDK 57. Do **not** use the v5
preview track.

**Why this is provisional.** The instruction was explicitly not to sacrifice stability for Tailwind
syntax. Web search is not a substitute for a working install. **Milestone 0 of MVP-1 is a gate that
blocks all other work** until a scratch scaffold proves:
- A clean `npx create-expo-app` on SDK 57 with NativeWind v4.2.0+ builds for both iOS and Android.
- RTL variants render correctly.
- Dark mode via the `dark:` variant works.
- Reanimated coexists without version warnings.

**Fallback.** If any of the above fails, drop NativeWind and use React Native `StyleSheet` with a
typed theme object in `constants/theme.ts`. The component API in `components/ui/` is designed to be
identical either way, so this choice does not leak into feature code. Record the outcome as a new ADR.

**Sources:** [Expo SDK 57 changelog](https://expo.dev/changelog/sdk-57) ·
[NativeWind installation docs](https://www.nativewind.dev/v5/getting-started/installation) ·
[NativeWind — recommended Expo versions](https://github.com/nativewind/nativewind/discussions/1604) ·
[NativeWind — Reanimated v4 support](https://github.com/nativewind/nativewind/discussions/1529)

---

## ADR-012
### Deterministic engines compute, AI only explains

**Status:** Accepted

**Context.** The long-term product answers questions about mortgages, debt, tax entitlements, benefit
eligibility, and affordability. LLMs are fluent at producing text that looks like such answers.

**Decision.** Financial figures, eligibility determinations, and recommendations are produced
exclusively by deterministic engines operating on verified data. AI may translate, explain, converse,
summarize, and route — it may never originate a number or a rule.

**The enforced pipeline:**

```
Verified financial data
        ↓
Deterministic Financial Engine   ← pure functions, unit-tested, no network, no LLM
        ↓
Rules / models / simulations     ← versioned, sourced
        ↓
Insight objects                  ← structured, with provenance and assumptions
        ↓
AI explanation / conversation    ← reads insight objects, cannot compute
```

**Rationale.**
- A hallucinated mortgage figure or a fabricated benefit entitlement causes real financial harm to a
  real family. This is not a hypothetical failure mode; it is the expected failure mode of LLMs on
  arithmetic and on jurisdiction-specific rules.
- Israeli tax and benefit rules change annually. A model's training data is stale by construction.
  Sourced, versioned rules are not.
- Deterministic results are reproducible, testable, and auditable. "Why did it say that?" must always
  have an answer.
- Regulatory exposure is far lower when the system can show its work.

**Consequences.**
- Engines are pure functions: same inputs, same outputs, no I/O, no randomness, no model calls.
- Every engine has unit tests with known-correct fixtures.
- AI receives structured insight objects, never raw data with instructions to compute.
- Any AI output containing a figure not present in its input insight object is a bug.

**Related:** ADR-017 (provenance), ADR-018 (regulatory).

---

## ADR-013
### Event-driven boundaries without an event bus

**Status:** Accepted

**Context.** The long-term product needs notifications, WhatsApp alerts, insight regeneration, and
anomaly detection to react to things like "a transaction was created." The obvious infrastructure
answer is a message broker.

**Decision.** Define domain events as a typed vocabulary now, and emit them through a trivial
in-process dispatcher. Do not add Kafka, SQS, PgMQ, or any broker.

**Rationale.**
- The MVP has exactly one meaningful subscriber (push notifications for budget thresholds). A broker
  for one subscriber is pure cost.
- The expensive mistake is not "no broker" — it is transaction-creation logic that directly calls
  notification code. That coupling is what forces a rewrite later.
- Naming the events and routing everything through a single `emit()` call site costs almost nothing
  today and means the dispatcher implementation can be swapped for a real queue without touching a
  single domain module.

**Consequences.**
- `lib/events/types.ts` defines the event vocabulary from day one, including events with no
  subscribers yet.
- Domain code calls `emit(event)` and never calls a notification function directly.
- The MVP dispatcher is a synchronous in-process function call. Replacing it with a durable queue is
  an implementation change behind a stable interface.

**Related:** ADR-014, ARCHITECTURE.md §Domain events.

---

## ADR-014
### Notification channels decoupled from domain logic

**Status:** Accepted

**Context.** WhatsApp notification of transactions is a headline future differentiator. The naive
implementation calls the WhatsApp API from the transaction creation path.

**Decision.** The transaction domain must have no knowledge of any delivery channel. It emits
`transaction.created`. A separate notification layer decides which members are notified, through
which channels, based on per-member preferences.

**Rationale.**
- Channels will multiply: in-app, push, WhatsApp, email, and likely more. Each one wired directly
  into domain logic is a permanent tax on that logic.
- Per-member preferences mean the routing decision is genuinely separate from the event — the same
  event produces different deliveries for different people.
- WhatsApp Business Platform requires a server, a verified business, and template approval. Keeping
  it behind the notification layer means none of that leaks into the MVP.

**Consequences.**
- `grep -ri "whatsapp" features/ app/ lib/ --exclude-dir=notifications` must return nothing,
  permanently. Only `lib/notifications/channels/` may reference a channel.
- The notification layer is the only place that knows channels exist.
- MVP implements exactly one channel (push) behind this interface.

---

## ADR-015
### Benchmarks are ranges, never verdicts

**Status:** Accepted

**Context.** A natural feature is telling a household whether its spending is reasonable. The naive
form is "a family of four should spend ₪X on groceries."

**Decision.** Benchmarks are always expressed as contextual ranges with explicit inputs and caveats.
Personal circumstances always override the generic figure. The product never issues a single-number
verdict.

**Rationale.**
- A household with a coeliac child, or in a peripheral town with one supermarket, or observing
  kashrut strictly, has a legitimately different food budget. Telling them they are overspending is
  wrong and destroys trust in everything else the product says.
- Ranges communicate genuine uncertainty honestly. Point estimates imply precision the data does not
  support.
- Statistical datasets describe populations, not families. The distinction has to survive into the UI.

**Consequences.**
- The benchmark engine returns `{ low, typical, high, inputs, caveats, source }` — never a scalar.
- UI copy is comparative and hedged, never prescriptive.
- Households can mark a category as "this is intentional for us," suppressing that benchmark.

---

## ADR-016
### Financial health score must be explainable

**Status:** Accepted

**Context.** A single health score is a compelling engagement surface. It is also the easiest place
to build an opaque, unaccountable black box.

**Decision.** Every score, and every score change, decomposes into named, signed contributions.

```
74 → 78
  +2  Emergency fund improved
  +1  Expensive loan refinanced
  +1  Savings rate increased
```

**Rationale.**
- An unexplainable score is not actionable, and a household that cannot see why the number moved
  cannot trust it.
- Explainability keeps the scoring model honest — every dimension has to justify its weight.
- It connects directly to the Action Engine: each negative contribution is a candidate action.

**Consequences.**
- The score is computed as a sum of weighted, individually-computed dimensions. No opaque model.
- Every dimension stores its own history so deltas are attributable.
- No gamification that could push a household toward a harmful decision — no streaks that penalize
  necessary medical or emergency spending. See PRODUCT_VISION.md §5.4.

---

## ADR-017
### Versioned provenance for all external financial rules

**Status:** Accepted

**Context.** Recommendations will depend on tax rules, National Insurance thresholds, Bank of Israel
rates, CBS statistics, and market benchmarks. All of these change, most of them annually.

**Decision.** Every externally-sourced fact carries `source`, `effective_date`, `retrieved_at`, and
`rule_version`. Any insight derived from such a fact carries that provenance forward and can expire.

**Rationale.**
- A tax credit calculation using last year's thresholds is confidently wrong. Without provenance
  there is no way to detect that.
- When a household asks "why?", the answer must be able to cite the actual source and its date.
- When a rule changes, the system must be able to find every insight derived from the old version
  and invalidate it. That requires the link to exist.
- Regulatory defensibility depends on being able to show what was known, from where, and when.

**Consequences.**
- No external financial constant is ever hardcoded in application code.
- Insight objects carry provenance and, where relevant, an expiry.
- Stale-data detection is a first-class concern, not an afterthought.

---

## ADR-018
### Four-level regulatory separation

**Status:** Accepted

**Context.** Investment, insurance, pension, credit, and mortgage advice are licensed activities under
Israeli law. Much of the long-term product roadmap brushes against them.

**Decision.** Keep four levels architecturally distinct, so the boundary can be moved as legal advice
dictates without re-architecting:

| Level | Example | Regulatory exposure |
|---|---|---|
| 1 — Information | "Your rate is 5.2%. Market average for this track is 4.6%." | Low |
| 2 — Simulation | "At 4.6%, your payment would be ₪X. Break-even after fees: 19 months." | Low–moderate |
| 3 — Personalized recommendation | "You should refinance." | **Likely regulated** |
| 4 — Regulated execution | Initiating or brokering the product | **Definitely regulated** |

**Rationale.**
- Levels 1 and 2 are defensible: the product presents facts and arithmetic the household could verify.
- Level 3 is where a software product plausibly becomes an advisor under Israeli law.
- Building levels 1 and 2 first delivers most of the user value while deferring the legal question.
- If legal review later permits level 3, it is an additive layer — not a redesign.

**Consequences.**
- Insight objects carry a `level` field.
- The UI renders levels 1 and 2 differently from level 3, and level 3 is behind a flag that is off.
- No level 3 or 4 capability ships without written legal review.
- MVP implements none of these levels.

---

## ADR-019
### Coarse roles in MVP, richer member types later

**Status:** Accepted

**Context.** The long-term product needs teenagers who cannot see their parents' income, children with
read-only views of their own savings, and possibly time-limited advisor access.

**Decision.** MVP ships `role IN ('admin', 'member')` where every member sees everything. The richer
model — `member_type` plus a visibility policy — is documented but not built.

**Rationale.**
- Real permission systems are expensive and easy to get subtly wrong. Building one before there is a
  second member type to test it against means designing against imagination.
- For a two-partner household, full mutual visibility is the correct and expected behavior.
- The forward path is additive: add a `member_type` column with a default, extend the RLS helper
  functions. No table restructuring, no data migration on financial tables.

**What MVP must not do,** because these would foreclose the extension:
- Assume exactly two members anywhere in schema, queries, or business logic.
- Assume every member sees every row — RLS policies must read as "is a member with visibility,"
  even though visibility is currently always true.
- Put user-scoped financial data anywhere other than behind a `household_id`.

**Related:** ADR-006, PRODUCT_VISION.md §6.

---

## ADR-020
### One household per user in MVP

**Status:** Accepted

**Context.** The schema permits a user to belong to multiple households. The UX does not.

**Decision.** MVP enforces one household per user in the application layer. The schema is not
constrained.

**Rationale.**
- Multi-household requires a household switcher, scoped queries everywhere, and a "current household"
  concept threaded through the entire app. Real complexity for a case the target user does not have.
- Leaving the schema unconstrained means enabling it later is a UX change, not a migration.

**Cost.** A user who is in one household and is invited to another gets a clear error. Acceptable and
rare for the target user.

---

## ADR-021
### Document the vision, ship the MVP

**Status:** Accepted

**Context.** The product vision expanded substantially — from a couples budgeting app to a Financial
Operating System for Israeli households. The risk is that vision documents leak into sprint scope.

**Decision.** The expanded vision changes **zero lines of MVP feature scope**. It changes only naming,
module boundaries, and which future doors are left open.

**The test applied to every MVP task:** if it cannot be traced to the approved MVP feature list, it is
out of scope — regardless of how well it serves the vision.

**What the vision was allowed to change:**
- Domain vocabulary (`household`, member types documented)
- Module boundaries (events, notification layer, engine separation)
- Documentation (PRODUCT_VISION.md, FEATURES.md, this file)

**What it was not allowed to change:**
- The MVP feature list
- The dependency list
- Infrastructure (no broker, no microservices, no AI, no WhatsApp, no Open Banking)

**Rationale.** The two failure modes are symmetric and both fatal: building a general platform before
having a product, or building a product so specifically that growth requires a rewrite. The narrow
path is a small implementation inside a well-named domain model.

---

## ADR-022
### No INSERT or UPDATE policy on `household_members`

**Status:** Accepted

**Context.** An early draft of the schema carried the obvious-looking policy:

```sql
CREATE POLICY "household_members_insert" ON household_members
  FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());
```

A documentation review found this is a critical vulnerability, not a minor gap.

**The flaw.** The `WITH CHECK` constrains only *who* is inserted. It constrains neither *which
household* nor *what role*. Two exploits follow immediately:

1. **Arbitrary household access.** Any authenticated user inserts themselves into any household by
   ID and reads every financial row in it. RLS then actively works against us: once the membership
   row exists, `is_household_member()` returns true everywhere.
2. **Privilege escalation.** The DELETE policy permits `user_id = auth.uid()`. A plain member
   deletes their own row and re-inserts it with `role = 'admin'`, defeating every admin-only policy
   in the schema.

RLS `WITH CHECK` cannot express "only as part of a validated invitation," because the validating
context is not available to the policy.

**Decision.** Grant no INSERT and no UPDATE on `household_members` at all. The only two legitimate
write paths go through `SECURITY DEFINER` functions that validate properly:

- `create_household()` — creates the household and its admin membership atomically
- `accept_invitation()` — validates the token, then inserts a `member` row

Both set the role themselves. Neither accepts a role from the caller.

**Consequences.**
- Promoting a member to admin is not possible in MVP. When added, it will be another audited
  `SECURITY DEFINER` function with its own tests — not a policy.
- Test group 3b covers all eight variants of the attack, including the delete-then-reinsert path and the direct `households` insert.
- The DELETE policy stays as-is; leaving a household is legitimate, and re-entry now requires a
  fresh invitation.

**Wider lesson.** A policy that reads plausibly is not a policy that is correct. Every `WITH CHECK`
must be interrogated for what it *fails* to constrain, not only what it constrains. This one looked
right in review and was wrong in three separate ways.

---

## ADR-023
### Structural RLS guards over enumerated assertions

**Status:** Accepted

**Context.** The RLS test suite began as a list of specific assertions: user A cannot read household
B's transactions, user A cannot read household B's accounts, and so on. Every new table means
remembering to add several more.

Review found two real defects that no enumerated test would have caught: `handle_new_user()` was
`SECURITY DEFINER` without a fixed `search_path`, and `budget_allocations` had no `household_id`.
Both were invisible precisely because nobody had written a test for that specific thing.

**Decision.** Add structural guards that assert properties across the *entire* schema rather than
about individual rows:

| Guard | Asserts |
|---|---|
| 6.3 | Every table in `public` has RLS enabled |
| 6.4 | Every table in `public` has at least one policy |
| 6.5 | Every `SECURITY DEFINER` function has a `search_path` in `proconfig` |
| 6.6 | No `SECURITY DEFINER` function grants `EXECUTE` to `anon` or `PUBLIC` |
| 6.7 | Every table with `household_id` has a policy referencing a membership helper |

**Rationale.** Enumerated tests verify what someone remembered to check. Structural guards fail the
build on a class of mistake, including mistakes made by someone who has never read this document.

The most likely future data leak in this schema is a migration that adds a table and forgets its
policies. Guard 6.3 makes that impossible to merge.

**Consequences.**
- Guards run against `pg_tables`, `pg_policies`, `pg_proc`, and
  `information_schema.role_routine_grants` — they need no fixtures and no impersonation.
- They must be kept genuinely universal. A guard with a growing exclusion list has stopped being a
  guard.
- Enumerated per-table tests remain valuable for logic errors within a policy; the guards catch
  absence, the assertions catch incorrectness.

---

## Open questions

Not yet decided. Each needs an ADR before the dependent work begins.

| # | Question | Blocks | Notes |
|---|---|---|---|
| Q1 | Transactional email provider (Resend / Postmark / Supabase) | Email invitations, password reset UX | Not needed for MVP — share sheet covers invites |
| Q2 | Where do recurring transactions generate? Client-on-open vs. pg_cron | Recurring reliability | MVP: client-on-open. Revisit when server layer exists. |
| Q3 | Is CBS household expenditure data licensable for commercial benchmarks? | Benchmark engine | Must resolve before promising benchmark features |
| Q4 | Salt Edge vs. direct BoI API vs. local aggregator | Open Banking phase | Needs pricing, coverage, and reliability comparison |
| Q5 | WhatsApp Business Platform: direct or via BSP (Twilio/360dialog)? | WhatsApp assistant | Affects cost model and template approval workflow |
| Q6 | Which LLM provider, and does household financial data leave Israel? | AI layer | Privacy and possibly regulatory implications |
| Q7 | Does level-3 personalized recommendation require a license in Israel? | Action Engine scope | Requires Israeli fintech legal counsel |
| Q8 | Is there a viable path to pension/insurance data (מסלקה פנסיונית)? | Pension features | [RESEARCH] |
| Q9 | Analytics/crash reporting vendor and what may be sent | MVP-4 (crash reporting task) | Must never include monetary values or user identifiers |
| Q10 | Revenue model: subscription, freemium, or B2B2C | Roadmap prioritization | Affects which differentiators matter most |
