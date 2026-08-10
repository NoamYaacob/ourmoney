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
| [011](#adr-011) | NativeWind v4 stable for styling | ✅ Accepted — [verified](MILESTONE_0_REPORT.md) |
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
| [024](#adr-024) | WhatsApp is a channel we need, not a differentiator we own | Accepted |
| [025](#adr-025) | OurMoney takes no provider commissions | Accepted |
| [026](#adr-026) | Manual entry is a position, not only a constraint | Accepted |
| [027](#adr-027) | Rule transparency, not rule accuracy, is the categorisation differentiator | Accepted |
| [028](#adr-028) | Open Banking sits behind a legal/compliance gate; licensing path is counsel's call | Accepted |
| [029](#adr-029) | Forward-compat by invariant, not by speculative column | Accepted |
| [030](#adr-030) | Native device validation deferred; non-simulator checks not weakened | Accepted |
| [031](#adr-031) | Jest + jest-expo + React Native Testing Library for client-side tests | Accepted |

ADRs 024–028 were added after the **August 2026 market research**
([MARKET_RESEARCH.md](MARKET_RESEARCH.md)). ADR-028 corrects a factual error in earlier planning
documents.

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

**Status:** ✅ **Accepted — verified against a real build, 9 August 2026 (Milestone 0)**

**Context.** The styling options were NativeWind (Tailwind syntax for React Native), React Native
`StyleSheet` with a hand-rolled theme, or a component library like Tamagui.

**The gate.** This ADR was provisional pending a scratch-project build proving NativeWind v4 works
cleanly on Expo SDK 57 — iOS build, Android build, Hebrew RTL, dark mode, RTL variants, no forced
Reanimated workarounds, no preview/nightly dependencies. Full method and evidence in
[docs/MILESTONE_0_REPORT.md](MILESTONE_0_REPORT.md). Summary below.

**Verified findings, from an actual install and build — not documentation:**

- **Expo SDK 57.0.11**, React Native 0.86.2, React 19.2.3 — `create-expo-app` default template.
- **NativeWind 4.2.6 is `latest` on the stable v3-Tailwind track.** The v5 preview
  (`5.0.0-preview.4`) exists on a separate dist-tag and was not touched.
- **The documented Reanimated peer conflict does not reproduce on this version pair.** NativeWind
  4.1.23 through 4.2.6 all declare exactly one peer dependency: `tailwindcss`. Reanimated 4.5.3
  arrives as a **transitive dependency of NativeWind's own `react-native-css-interop` engine**, not
  as a peer the consumer must satisfy. `npm install --strict-peer-deps` and `expo install --check`
  both pass clean. **This corrects the ADR's original premise** — there is no peer conflict to work
  around on the Expo SDK 57 / NativeWind 4.2.6 pair.
- **iOS Metro bundle: pass.** 971 modules, 2.5MB Hermes bytecode, no transform errors.
- **Android Metro bundle: pass.** 969 modules, 2.5MB Hermes bytecode.
- **`tsc --noEmit` with `strict: true`: pass, zero errors**, after one one-line fix (below).
  `className` is genuinely typed — verified with a negative test (`className={42}` correctly
  rejected with a type error).
- **Hebrew RTL: pass**, verified visually. Hebrew text, `he-IL` currency formatting, `flex-row`
  reversal, `rtl:` variants, and **logical properties (`ms-`/`me-`/`ps-`/`pe-`) all render and flip
  correctly** under `dir="rtl"`.
- **Dark mode: pass**, verified visually via `nativewind`'s `colorScheme.set()`. Every `dark:`
  surface, text, border and button state inverted correctly, including the **stacked
  `dark:rtl:` variant**.
- **No preview or nightly dependency was installed anywhere in the tree.**

**Two real issues found, both fixed, neither disqualifying:**

1. **`babel-preset-expo` is not a top-level dependency of the SDK 57 template**, though NativeWind's
   babel config assumes it is. Fix: `npx expo install babel-preset-expo`. One command, now folded
   into the standard Milestone 1 install sequence.
2. **TypeScript 6's `TS2882` rejects the untyped `import './global.css'` side-effect import**
   NativeWind's setup docs specify, because NativeWind ships no ambient `*.css` module declaration.
   Fix: one line, `declare module '*.css' {}`, added to `nativewind-env.d.ts` alongside the
   `nativewind/types` reference.

**Residual, not blocking:** `npm audit` reports 21 vulnerabilities, all inherited from the Expo
CLI/Metro toolchain itself (`@expo/config-plugins`, `metro`, `xcode`, `uuid`) — **18 of these are
already present in the bare SDK 57 scaffold before NativeWind is installed.** NativeWind's own
dependency (`react-native-reanimated`) adds 3 more, tracing to the same `react-native`/`metro`
chain. Standard state of a fresh Expo project; not specific to this styling choice.

**Not exercised in Milestone 0** (deferred to real device/simulator testing in later milestones,
per the user's instruction not to create hosted resources or touch native toolchains this session):
on-device iOS Simulator and Android Emulator rendering; `I18nManager.forceRTL()` (this test used
`dir="rtl"` injection to simulate the OS-level effect on a web build, which exercises the same CSS
variant logic but not the native module); physical-device performance.

**Decision.** Use **NativeWind 4.2.6**, pinned `^4.2.0`, with `tailwindcss ^3.4.0`, on Expo SDK 57.
Fold the two fixes above into the Milestone 1 setup steps in
[docs/PHASE_1_PLAN.md](PHASE_1_PLAN.md). Do not use the v5 preview track.

**Sources:** [docs/MILESTONE_0_REPORT.md](MILESTONE_0_REPORT.md) — full command log and screenshots
from the verification run, 9 August 2026.

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

## ADR-024
### WhatsApp is a channel we will need, not a differentiator we own

**Status:** Accepted — supersedes the framing in the original PLATFORM plan

**Context.** Planning documents treated a "WhatsApp Financial Assistant" as a major future
differentiator, on the assumption that WhatsApp-native household finance did not exist in Israel.

Market research (9 Aug 2026) established that this is false. **RiseUp's signature mechanic is
WhatsApp** — it pushes insights roughly three times a week, and press coverage has centred on it
since 2020. [VERIFIED]

Research also established the limit of RiseUp's implementation: it is **outbound only, not
conversational**. [VERIFIED] No Israeli product offers a two-way assistant that answers a question
or accepts an instruction.

**Decision.** WhatsApp outbound alerting is **parity work**, not differentiation. It is required to
match the incumbent and must not be described, planned, or resourced as an advantage.

The differentiating capability is **interactivity** — query and instruction — over a *household's*
complete financial picture. PL-1 exit criteria now require two-way capability explicitly.

**Rationale.** A roadmap that describes parity work as differentiation produces two failures at
once: it over-invests in the easy half, and it declares victory at the point where the incumbent
already stands.

**Consequences.**
- [ADR-014](#adr-014) is unaffected and now more clearly correct: channel independence is what makes
  adding WhatsApp cheap when the time comes.
- The strategic value of the notification layer is unchanged. The strategic value of *WhatsApp
  specifically* is lower than previously assumed.
- Nothing about MVP scope changes.

---

## ADR-025
### OurMoney takes no provider commissions

**Status:** Provisional — binding until explicitly revisited with a superseding ADR

**Context.** Both Israeli market leaders monetize partly through commissions from financial product
providers. [VERIFIED]

- **RiseUp** earns commission from product providers. Its terms disclose this; **the savings page
  calls the provider a "technology partner" and says nothing about payment, and the vouchers and
  mortgage pages carry no disclosure at all.**
- **FamilyBiz** earns commissions and runs a benefits marketplace, and in November 2025 launched
  **its own insurance agency**, where AI scans user data for excess fees and alerts a human agent
  before the customer notices.

**MyFinanda** is the counter-example: no advertising, no referral marketplace, revenue from
subscriptions plus B2B white-label — and the highest Play rating of any Israeli budgeting app.
[VERIFIED]

**Decision.** OurMoney does not earn commission, referral fees, or lead-generation revenue from
financial product providers.

If this is ever revisited, the superseding ADR must specify: (a) that the recommendation surface and
the revenue surface are architecturally separate, and (b) that any recommendation carrying
commercial interest renders that interest **inline**, in the same view, not in terms of service.
The `Recommendation` object gains a `commercial_interest` field that cannot be omitted at render
time.

**Rationale.** The Action Engine ([ARCHITECTURE.md](ARCHITECTURE.md)) and the deterministic-engine
rule ([ADR-012](#adr-012)) exist to make financial figures trustworthy and reproducible. Commission
revenue does not corrupt them by making the engine lie — it corrupts them by determining **what the
engine is pointed at**. A product paid for loan referrals develops excellent loan-refinancing
detection and never builds "you do not need this loan."

The strongest recommendation is often "do nothing," and no commission model pays for it.

**Consequences.**
- Removes a revenue line both competitors use, and this is a real commercial sacrifice.
- Creates a claim neither competitor can match without changing their business model — see
  [TRUST_AND_PRIVACY.md](TRUST_AND_PRIVACY.md) and [OUR_ADVANTAGES.md](OUR_ADVANTAGES.md) L4.
- Makes subscription or B2B2C the realistic paths ([Q10](#open-questions)).
- Does not prohibit *informational* comparison, or referral to a licensed human advisor where no
  payment flows to OurMoney.

---

## ADR-026
### Manual entry is a position, not only a constraint

**Status:** Accepted

**Context.** MVP has no bank connectivity, for three independent reasons: scope discipline, the
absence of a server layer, and — established by research — that aggregating Israeli bank data
**requires an ISA licence** under חוק שירות מידע פיננסי, תשפ"ב-2021. [VERIFIED]

This was understood as a limitation to be apologised for until Open Banking arrives.

Research changed that reading:
- **RiseUp supports no cash at all**, and it is a repeated complaint. [VERIFIED]
- **MyFinanda supports a cash wallet only**, also a complaint. [VERIFIED]
- **Lyra** (manual-only, free, explicitly anti-open-banking) and **החיים בפלוס** (manual by design,
  privacy-positioned, ₪16.70–22.90/mo) both exist, both articulate a couple model, and both choose
  manual entry as a *position*. [VERIFIED]
- **ProjectionLab** internationally markets the absence of bank linking as a privacy feature.
  [VERIFIED]

**Decision.** Treat manual and cash entry as a first-class capability that the category leader
lacks — not as a placeholder. Cash spending must be as easy to log as card spending, and the
quality bar for manual entry is "better than any connected product's manual path," not "adequate
until sync arrives."

**Rationale.** The MVP's largest apparent weakness addresses a verified, unserved complaint about
the market leader. That does not make manual entry *better* than aggregation — it makes it a
defensible position for a segment that demonstrably exists.

**Consequences.**
- MVP-2 exit criteria require cash parity.
- Pricing expectations must be set against the unconnected tier (₪16.60–22.90/mo), not RiseUp's
  ₪55–64. See [BUSINESS_MODEL.md](BUSINESS_MODEL.md).
- **The size of the manual-first segment is [UNKNOWN]** and is a gating question for the MVP
  ([Q12](#open-questions)).

---

## ADR-027
### Rule transparency, not rule accuracy, is the categorisation differentiator

**Status:** Accepted

**Context.** MVP-2 already includes a categorisation rules engine. Research established what the
quality bar should be.

- **Categorisation is FamilyBiz's #1 complaint** — *"עבודה של שעות כל חודש"* (hours of work every
  month); a paying user: *"אני מרגיש שאני עובד אצל האפליקציה"*. Its documented structural weakness is
  **one merchant → one category, with no amount- or timing-based splitting and no bulk edit.**
  [VERIFIED]
- **MyFinanda's #1 request** is custom categories and **bulk/multi-transaction editing.** [VERIFIED]
- Across the Israeli matrix, *editable rules engine* is **Weak or Absent for every product.**
- Internationally, **Copilot has the best categoriser in the market** — a per-user ML model at
  ~93–94% first-pass — **and users cannot view or edit their own rules in-app; they must email
  support.** [VERIFIED]

**Decision.** The differentiating property is that rules are **visible, editable, reorderable,
testable against existing transactions before saving, and bulk-appliable** — and that a
mis-categorised transaction leads the user to *the rule that caused it*, not merely to a dropdown.

Matching Copilot's ML accuracy is explicitly **not** an MVP goal, and would not be the advantage
even if achieved.

**Rationale.** Accuracy is a race OurMoney cannot win at MVP scale, against a competitor with a
per-user ML model and a merchant-enrichment substrate that does not exist for Hebrew. Transparency
is cheap to build, addresses the loudest complaint in the market, and is unoccupied at every price
point in both markets.

**Consequences.**
- MVP-2 exit criteria updated; no new MVP features.
- Amount- and timing-based rule conditions are **not** MVP. The gap is documented so that the rule
  schema does not preclude them — a rule is a set of conditions, not a single merchant string.

---

## ADR-028
### Open Banking sits behind a legal/compliance gate; the licensing path is counsel's call

**Status:** Accepted — supersedes an over-confident earlier statement

**Context.** Earlier planning documents stated flatly that the **Bank of Israel** regulates open
banking and maintains the provider register. A research pass then corrected this to an equally flat
statement that **the ISA** is the regulator. **Both are over-confident.** The first was wrong; the
second is a simplification that could still send us to the wrong authority.

**What is actually established [VERIFIED]:**
- The governing law is **חוק שירות מידע פיננסי, תשפ"א-2021**, in force June 2022.
- Supervision is **split across at least three bodies**: the **Israel Securities Authority**
  licenses financial information service providers; the **Bank of Israel** supervises data sources
  (banks, card issuers) and retains its banking-supervision and payment-system roles; the **Capital
  Market Authority** covers the non-bank financial sector and runs a parallel "open finance" track.
- As of the ISA's 2025 API report: **25 licences, 313,882 consenting customers, ~4% of the market**,
  with three providers serving 92% of individuals.

**What is NOT established [UNKNOWN]:**
- Which licence class, if any, applies to a product of OurMoney's shape.
- Whether the applicable path differs by entity type (company vs. partnership vs. foreign entity),
  by activity (read-only aggregation vs. advice vs. payment initiation), or by data category
  (bank vs. pension vs. insurance — the latter two sit under the CMA, not the ISA).
- Whether **merging two individually-consented views into one household ledger** is permitted under
  any licence class ([Q16](#open-questions)). This is the question our entire thesis rests on.
- Whether a **non-agent fintech** may query the מסלקה הפנסיונית ([Q14](#open-questions)).

**Decision.**

1. **No document may state that a single named regulator is universally responsible for financial
   information services.** The correct formulation is: *the applicable regulator and licensing path
   depend on entity type and activity, and must be confirmed by Israeli fintech counsel.*
2. **Open Banking stays behind an explicit legal/compliance gate.** No bank connectivity work — not
   a spike, not a prototype, not an aggregator trial — begins until counsel has confirmed the
   licensing route in writing.
3. The gate is a named entry condition on the OPEN BANKING phase in [ROADMAP.md](../ROADMAP.md), not
   a footnote.

**Rationale.** The failure mode is asymmetric. Being vague costs nothing at this stage. Being
confidently wrong about a regulator sends work to the wrong authority, produces an unusable
compliance posture, and is discovered late and expensively. We have already been confidently wrong
about this once in the same repository — that is the evidence for the rule.

**Consequences.**
- MVP is unaffected: manual entry requires no licence under any reading ([ADR-026](#adr-026)).
- [Q4](#open-questions) (aggregator choice) is downstream of [Q13](#open-questions) (licensing
  route), which is downstream of counsel.
- Research documents keep their **[VERIFIED]** findings about the ISA's *reports and register* —
  those are facts about published documents. What is removed is the inference that this settles
  *our* licensing path.

---

## ADR-029
### Forward-compat by invariant, not by speculative column

**Status:** Accepted — resolves [Q18](#open-questions)

**Context.** Two capabilities are known to be coming and both land on `transactions`, the most
referenced and most security-sensitive table in the schema:

- **Installments (תשלומים)** — a correctness requirement in Israel that no product anywhere models
  ([MARKET_RESEARCH.md §2.2](MARKET_RESEARCH.md)).
- **Per-member visibility** — household-visible / private / selected-member.

The tempting move is to add the columns now, unused, so the table never has to be remodelled. That
was proposed as Q18 and it is the wrong call.

**Decision.** **Add no speculative columns.** Instead:

1. State the **transaction identity invariants** (I1–I4 in
   [DATABASE_SCHEMA.md](DATABASE_SCHEMA.md#transaction-identity--the-invariants-that-keep-future-models-additive))
   and hold them from migration 002 onward.
2. Write the **future schema out in full** — `installment_plans`, `card_statements`,
   `visibility` + `transaction_visibility_grants` — so the shape is agreed before it is needed.
3. Prove each future change is **purely additive**: new tables, or nullable columns with defaults.
4. Keep authorization in **one helper function** so visibility narrowing is a one-function change.

**Rationale.**

- **The invariants are what actually protect us, not the columns.** A speculative
  `installment_plan_id` on a table with no plans is inert. What would genuinely force a rewrite is
  a row meaning "a purchase" instead of "a movement of money" (I1), or `txn_date` meaning two things
  (I3), or a UNIQUE constraint that rejects twelve near-identical instalments (I4). None of those
  are fixed by adding a column, and all are fixed for free by writing them down.
- **Additive changes are cheap in PostgreSQL.** A nullable FK or a defaulted enum is one statement
  with no table rewrite. The migration we are trying to avoid is not expensive.
- **Unused columns are not free.** They appear in generated types, invite misuse, need RLS reasoning,
  and require reviewers to ask "is this live?" on the one table where review attention is scarcest.
- **It keeps MVP scope honestly frozen.** Q18 was the single place research pressed against the
  scope freeze. Resolving it as "no" keeps the freeze credible.

**Consequences.**
- Migration 001 and 002 carry no installment, charge-date or visibility columns.
- `is_shared` means **budget attribution only** and `is_excluded` means **user exclusion only**.
  Overloading either is now a documented violation, catchable in review.
- MVP UX keeps exactly two states, *shared* and *personal*, and every household member sees every
  row. That is a deliberate simplification, not an assumption about what users want — see
  [Q11](#open-questions).
- When installments arrive, entering a 12-instalment purchase as one large transaction becomes a
  data-quality problem. MVP UI copy should already encourage entering what hits the account.

**Applies beyond these two cases.** The general rule: *when a future capability is known, write down
the invariants it depends on and the migration it will need. Do not pre-build its storage.*

---

## ADR-030
### Native device validation is deferred; non-simulator checks are not weakened

**Status:** Accepted

**Context.** This development machine has neither Xcode nor Android Studio installed, and the user
has decided not to install either right now because of disk-space cost (Xcode alone is ~40GB).
Milestone 0 already worked around this by using `expo export` instead of `expo run:ios`/`run:android`
— proven in [MILESTONE_0_REPORT.md](MILESTONE_0_REPORT.md) to exercise the identical Metro/Babel
transform pipeline a real build depends on, without launching a device.

**Decision.** For Milestone 1 (and until stated otherwise), local iOS Simulator and Android Emulator
are **not required** and do **not block** any exit criterion. In their place:

- `tsc --noEmit --strict` — zero errors, non-negotiable
- ESLint — zero errors, non-negotiable
- `expo export --platform ios` and `--platform android` — both must bundle cleanly
- Any other static check available without a device (dependency audit, structural checks)

**What this explicitly does NOT relax.** None of the above is a lowered bar — it is a different bar
that happens to be enforceable without a simulator. Strict TypeScript, lint cleanliness, and a
successful bundle for both platforms remain mandatory. What is deferred is specifically **visual,
on-device confirmation** — does RTL actually mirror the layout, does a real tap register, does the
app not crash on a real Hermes runtime on a real OS.

**When native validation becomes necessary, it must be raised explicitly, not silently assumed
covered by `expo export`.** Concretely:
- **Milestone 1 (scaffold):** not required. Nothing here is interactive yet.
- **Milestone 3 (auth) onward:** real interaction — text input, biometric prompts, deep links — needs
  a physical device or a real emulator/simulator to genuinely verify, not just to bundle. At that
  point the options are, in order of setup cost: **Expo Go on a physical iPhone** (fastest, but
  cannot test `expo-local-authentication`'s native biometric prompt or custom native code), a
  **development build via EAS** installed on a physical device (works for everything MVP-1 needs,
  no local Xcode required — EAS builds in the cloud), or **local Xcode/Android Studio** (only if the
  above two are insufficient).
- The MVP-1 exit criteria in [PHASE_1_PLAN.md](PHASE_1_PLAN.md) mark which items need real-device
  confirmation versus which are satisfied by static checks alone.

**Rationale.** The alternative — quietly treating `expo export` success as "the app works" through
Milestone 5 — would let a real RTL mirroring bug, a biometric integration bug, or a deep-link bug
ship undetected, because none of those are transform-pipeline failures. Naming the gate explicitly,
and naming what closes it, prevents that failure mode without forcing a 40GB install before it is
needed.

**Consequences.**
- [PHASE_1_PLAN.md](PHASE_1_PLAN.md)'s exit criteria are annotated per-item: static-check-verifiable
  now, or deferred-to-device-with-a-named-trigger.
- No exit criterion is deleted or weakened. Items requiring a device are marked pending with the
  reason, not silently dropped.
- The scratch-project pattern from Milestone 0 (throwaway, outside the repo) is reusable if a future
  gate needs the same treatment.

---

## ADR-031
### Jest + jest-expo + React Native Testing Library for client-side tests

**Status:** Accepted

**Context.** Before Milestone 3, the repository had no client-side test infrastructure of any kind —
`CLAUDE.md` only referred to "the project's eventual client-side test convention for app code" in the
future tense. Milestone 3 introduces the first logic that genuinely needs unit coverage without a real
device: the auth-state/household-membership redirect guard, whose most important property — it never
enters a redirect loop — is exactly the kind of thing that should be a repeatable assertion, not a
manually re-verified behavior.

**Decision.** Use `jest` with the `jest-expo` preset and `@testing-library/react-native` for all
client-side (non-database) tests, matching Expo's own documented setup for this stack. Mock the
Supabase client via a manual mock at `lib/supabase/__mocks__/client.ts` so tests never touch a real
Supabase project or network. Tests are colocated as `*.test.ts(x)` next to the file they cover (e.g.
`features/auth/hooks/useAuth.test.ts`), not gathered into a separate `__tests__/` tree.

**Rationale.**
- `jest-expo` is Expo's own recommended preset; it configures the RN/Hermes transform pipeline
  automatically, avoiding hand-rolled Babel/Jest wiring for React Native's non-standard module system.
- Mocking the Supabase client (rather than pointing tests at a real local Supabase instance) keeps these
  tests fast, hermetic, and independent of `supabase start` being up — consistent with `supabase/
  rls_tests.sql` already being the correct, separate tool for anything that needs the real database and
  RLS enforcement. Client-side auth/routing logic and RLS enforcement are tested by different tools on
  purpose; this ADR does not change how RLS is tested.
- Colocated `*.test.ts` files keep a hook and its test adjacent, consistent with this project's existing
  preference for locality over indirection (no barrel files, kebab/camelCase naming next to usage).
- Extracting decision logic into small pure functions (e.g. `features/auth/lib/authRedirect.ts`) so it
  can be tested without mocking `expo-router` internals is the pattern this ADR expects future milestones
  to reuse for their own guard/state-machine logic, rather than each milestone re-deriving a mocking
  strategy for the router.

**Consequences.**
- `jest`, `jest-expo`, `@testing-library/react-native`, `react-test-renderer` are `devDependencies`;
  `react-test-renderer` is pinned to the exact `react` version (`19.2.3`) rather than a caret range,
  because newer `react-test-renderer` releases require a newer `react` peer than this project pins
  (Milestone 0's verified version pairing) — an unpinned caret would let a routine `npm install` select
  an incompatible version.
- `npm test` runs the suite; no CI wiring is added by this ADR.
- This is scoped to app-layer logic only. It does not replace, duplicate, or change
  `supabase/rls_tests.sql`, which remains the sole test suite for RLS/database behavior and must
  continue to pass before any schema migration is merged.

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
| Q10 | Revenue model: subscription, freemium, or B2B2C | Roadmap prioritization | Constrained by [ADR-025](#adr-025) — commissions are excluded |

### Added by the August 2026 market research

The first two cannot be answered by desk research. They require talking to Israeli households, and
they gate the largest strategic bets in the roadmap.

| # | Question | Blocks | Notes |
|---|---|---|---|
| **Q11** | **Do Israeli couples want per-member privacy, or is full transparency the cultural norm?** | **Nothing in MVP.** Gates the *visibility* feature (POST-MVP) and the long-term thesis | **Reclassified: a hypothesis to validate, not a blocker.** Validate through user interviews during MVP, not before it. The schema is already forward-compatible either way ([ADR-029](#adr-029)), so the answer changes what we build next — not what we build now. Every Israeli product is fully transparent; that is either an unserved gap or a correct read of the culture, and only users can say |
| **Q12** | How large is the manual-first segment in Israel? | Whether the MVP can stand alone commercially ([ADR-026](#adr-026)) | Lyra and החיים בפלוס prove it exists; size [UNKNOWN] |
| Q13 | What is the ISA licensing route, cost, and timeline for a financial information service licence? | The entire OPEN BANKING phase ([ADR-028](#adr-028)) | Gating regulatory dependency; 25 licences exist, so the path is walkable |
| Q14 | Is מסלקה פנסיונית access obtainable independently of open banking, and under what approval? | Pension features | Pension data is **not** on the open-banking rail; separate regulator (CMA). Supersedes the framing in [Q8](#open-questions) |
| Q15 | Does RiseUp give each partner a separate login? | Competitive positioning for S2 | Unverifiable from outside; one trial account resolves it |
| Q16 | Can a household ledger be lawfully assembled from two individually-consented open-banking views? | The household model under Open Banking | Consent is per-individual; the merge happens at our layer. **Legal question, not technical** |
| Q17 | What does an unconnected product command in Israel? | Pricing | Band is ₪16.60–₪64/mo; unconnected products sit at the bottom |
| ~~Q18~~ | ~~Should migration 001 carry installment and charge-date columns?~~ | — | ✅ **RESOLVED: No.** See [ADR-029](#adr-029). Forward-compatibility is secured by **transaction identity invariants I1–I4** and a written-out future migration, not by unused columns. Both the installment model and the visibility model are proven purely additive |
