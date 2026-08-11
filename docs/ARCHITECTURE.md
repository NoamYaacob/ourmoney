# OurMoney — Architecture

## Overview

OurMoney is a single Expo application backed by Supabase. There is no separate backend server for the MVP. All data access goes through the Supabase JavaScript client, protected by Row-Level Security policies enforced at the database layer.

A server-side API layer will be introduced in the OPEN BANKING phase, when handling bank credentials and tokens server-side becomes mandatory. Until then, the Supabase anon key is the only credential used in client code.

## How to read this document

This document describes two things at once, and it is important not to confuse them:

- **Sections marked "MVP"** describe what is being built now.
- **Sections marked "Future"** describe boundaries that must exist in the code today so that later
  capabilities can be added without rewriting domain logic.

A future section does not authorize implementation. It constrains how the MVP is written.

The long-term product these boundaries serve is described in [PRODUCT_VISION.md](PRODUCT_VISION.md).
Decisions and their rationale are recorded in [DECISIONS.md](DECISIONS.md).

## Architectural invariants

Five rules hold across every phase. Everything else in this document follows from them.

| # | Invariant | Enforced by |
|---|---|---|
| 1 | Money is integer agorot. Never a float. | [ADR-007](DECISIONS.md#adr-007) |
| 2 | Household isolation is enforced by RLS at the database, never by client code. | [ADR-008](DECISIONS.md#adr-008) |
| 3 | Deterministic engines compute financial figures. AI only explains them. | [ADR-012](DECISIONS.md#adr-012) |
| 4 | Domain logic emits events. It never calls a delivery channel. | [ADR-013](DECISIONS.md#adr-013), [ADR-014](DECISIONS.md#adr-014) |
| 5 | Every externally-sourced financial fact carries versioned provenance. | [ADR-017](DECISIONS.md#adr-017) |
| 6 | One transaction row = one movement of money. Never "a purchase". | [ADR-029](DECISIONS.md#adr-029) |

---

## Stack

| Layer | Choice | Reason |
|---|---|---|
| Mobile | Expo (React Native) + Expo Router | True native, RTL built-in, managed workflow |
| Styling | NativeWind (Tailwind for RN) | RTL-aware, consistent with web Tailwind conventions |
| i18n | react-i18next + i18next | Mature, lazy loading, pluralization |
| Data fetching | TanStack Query v5 | Server state, caching, optimistic updates |
| Local UI state | Zustand | Lightweight, no boilerplate |
| Database | PostgreSQL via Supabase | ACID, RLS, Realtime, managed |
| Auth | Supabase Auth | Email + password only in MVP |
| Realtime | Supabase Realtime | Partner sees updates instantly |
| Secure storage | expo-secure-store | Tokens and session data |
| Biometrics | expo-local-authentication | Face ID / fingerprint re-auth |
| Notifications | expo-notifications | Push for budget threshold alerts (MVP: one rule) |
| TypeScript | Strict mode | No `any`, full inference |

---

## Application Structure

```
app/                          Expo Router pages
  (auth)/                     Unauthenticated routes
    _layout.tsx
    sign-in.tsx
    sign-up.tsx
    forgot-password.tsx
  (app)/                      Authenticated routes
    _layout.tsx               Tab navigator: Dashboard, Transactions, Budgets, Settings
    dashboard/
      index.tsx
    transactions/
      index.tsx
      [id].tsx
      new.tsx                 Reached via FAB, not a tab
      import.tsx               Milestone 7 — CSV import wizard, reached from transactions/index.tsx
    budgets/
      index.tsx
    settings/
      index.tsx
      categories.tsx           Reached from Settings, not a tab
    accounts/                 Reached from Settings, not a tab
      index.tsx
      [id].tsx
    goals/                    Reached from Settings, not a tab — Milestone 7
      index.tsx
      [id].tsx
    recurring/                Reached from Settings, not a tab — Milestone 7
      index.tsx
      [id].tsx
  onboarding/
    _layout.tsx
    create-household.tsx
    invite-partner.tsx
  invite/
    [token].tsx               Deep-link invitation handler
  _layout.tsx                 Root layout, auth guard, RTL bootstrap
```

### Library structure

```
lib/
  supabase/
    client.ts                 Anon-key client with SecureStore adapter
    queries/                  Typed query helpers per domain
  money/
    format.ts                 The ONLY place agorot become display strings
    arithmetic.ts             Integer-safe operations
  events/
    types.ts                  Full domain event vocabulary (incl. future events)
    dispatcher.ts             MVP: synchronous in-process for-loop
  notifications/
    router.ts                 Event → who + which channels
    channels/
      push.ts                 MVP: the only implemented channel
  utils/
  queryClient.ts              TanStack Query configuration

store/                        Zustand — local UI state only
  authStore.ts
  householdStore.ts
```

`store/` holds ephemeral UI state (active household ID, onboarding step). All server state belongs
to TanStack Query. File names are camelCase per the convention in
[CLAUDE.md](../CLAUDE.md#file-and-export-conventions).

`lib/engines/` does not exist in MVP. It is created in the INTELLIGENCE phase and may never import
an AI client.

---

## Data Flow (MVP)

```
Screen (app/)
  │  calls hooks via
  ▼
Feature Hook (features/*/hooks/useXxx.ts)
  │  uses TanStack Query, calls
  ▼
Supabase Query Helper (lib/supabase/queries/*.ts)
  │  calls
  ▼
Supabase JS Client (lib/supabase/client.ts)
  │  anon key, RLS enforced server-side
  ▼
Supabase PostgreSQL + RLS Policies
```

Realtime subscriptions follow the same path but push updates up via TanStack Query `queryClient.invalidateQueries()` or direct cache updates.

Mutations additionally emit a domain event after the write succeeds — see
[Domain events](#domain-events-mvp-seam-future-infrastructure).

---

## Auth Flow

```
Cold start
  │
  ├─ No session → (auth)/sign-in
  │
  └─ Session exists
       │
       ├─ App was backgrounded > 30s → biometric prompt
       │
       └─ Resume → check household membership
              │
              ├─ Has household → (app)/dashboard
              │
              └─ No household → onboarding/create-household
```

Session is stored in `expo-secure-store`. On app launch, `lib/supabase/client.ts` restores the session from secure storage using `AsyncStorage`-compatible adapter.

---

## Household Membership Model

A user belongs to a household via the `household_members` join table. RLS policies on every financial
table delegate to `is_household_member(household_id)` / `is_household_admin(household_id)`.

**The authoritative definitions live in
[DATABASE_SCHEMA.md](DATABASE_SCHEMA.md#rls-helpers)** — they are not duplicated here, because two
copies of the most security-critical function in the system will eventually diverge.

Three properties matter architecturally:

- Both are `SECURITY DEFINER` with a fixed `search_path` — mandatory, and enforced by structural
  test 6.5.
- Authorization is a **function call**, not inline policy SQL. Future visibility narrowing (teen
  members who cannot see household income) changes one function instead of forty policies.
- The index on `household_members(user_id, household_id)` is load-bearing: it is consulted on every
  single row access in the system.

Membership itself is never written through RLS. `household_members` has no INSERT and no UPDATE
policy; the only two write paths are the `create_household` and `accept_invitation`
`SECURITY DEFINER` functions. See
[DATABASE_SCHEMA.md](DATABASE_SCHEMA.md#household_members) for why a permissive INSERT policy would
allow any authenticated user to join any household as admin.

---

## RTL Implementation

At app startup (root `_layout.tsx`):

```ts
import { I18nManager } from 'react-native'
import * as Updates from 'expo-updates'

if (!I18nManager.isRTL) {
  I18nManager.forceRTL(true)
  Updates.reloadAsync()
}
```

NativeWind RTL variants (`rtl:flex-row-reverse`, `rtl:pr-4`) handle directional styles. The `useRTL()` hook provides `isRTL: boolean` and `flip(left, right)` for cases where logical properties are insufficient.

---

## Money Handling

All monetary values in the database and in TypeScript are **integer agorot** (1 ILS = 100 agorot).

- Database: `BIGINT` columns named `*_agorot`
- TypeScript: `number` (always integer, never float)
- Display only: converted via `lib/money/format.ts` using `Intl.NumberFormat('he-IL', { style: 'currency', currency: 'ILS' })`

```ts
// lib/money/format.ts
export function formatILS(agorot: number): string {
  return new Intl.NumberFormat('he-IL', {
    style: 'currency',
    currency: 'ILS',
    minimumFractionDigits: 2,
  }).format(agorot / 100)
}

export function agorotFromILS(ils: number): number {
  return Math.round(ils * 100)
}
```

---

## Realtime Strategy

Partner activity uses Supabase Realtime `postgres_changes` subscriptions:

- Subscribe to `transactions` inserts/updates for the current `household_id`
- On change, call `queryClient.invalidateQueries(['transactions', householdId])`
- TanStack Query refetches with the cached key, updating the UI

Budget progress recalculates on the client when the transaction list updates.

---

## Security Model Summary

1. Every table has RLS enabled. Structural tests 6.3 and 6.4 fail the build otherwise.
2. All policies scope through `is_household_member(household_id)` or `is_household_admin(household_id)`.
3. DELETE on shared resources (accounts, categories, budgets, transactions) is admin-only.
4. `household_members` has **no INSERT and no UPDATE policy**. Membership is written only by the
   `create_household` and `accept_invitation` `SECURITY DEFINER` functions, so a client can neither
   join an arbitrary household nor promote itself to admin.
5. Every `SECURITY DEFINER` function sets a fixed `search_path` and grants `EXECUTE` to
   `authenticated` only. Structural tests 6.5 and 6.6 enforce both.
6. The anon key is used in client code. It cannot bypass RLS.
7. Session tokens are stored in `expo-secure-store`, not AsyncStorage.
8. `supabase/rls_tests.sql` must pass before any schema change is merged.
9. `accept_invitation` is an audited exception to rule 2. Its ten conditions are specified in
   [ADR-010](DECISIONS.md#adr-010) and each is individually tested.

---

## Domain events (MVP seam, future infrastructure)

### The problem this prevents

The expensive mistake is not "we did not build a message queue." It is transaction-creation code
that directly calls a notification function. Once that call exists, every new channel — push,
WhatsApp, email — and every new reaction — insight regeneration, anomaly detection, budget
recalculation — either gets bolted into the transaction path or requires unpicking it.

### The MVP approach

Define the event vocabulary now. Route everything through one `emit()` call. Implement the
dispatcher as a synchronous in-process function.

**No broker. No queue. No Kafka, SQS, or PgMQ.** See [ADR-013](DECISIONS.md#adr-013).

```
features/transactions/hooks/useCreateTransaction.ts
   │  write succeeds
   ▼
emit({ type: 'transaction.created', householdId, payload })
   │
   ▼
lib/events/dispatcher.ts        ← MVP: a for-loop over registered handlers
   │
   ├──→ lib/notifications/       ← MVP: the only subscriber
   │
   ├──→ (future) insight regeneration
   ├──→ (future) anomaly detection
   └──→ (future) WhatsApp delivery
```

### Event vocabulary

Defined in `lib/events/types.ts` from day one. Events with no subscribers are still declared —
naming them early is the entire point.

| Event | Emitted when | MVP |
|---|---|---|
| `transaction.created` | A transaction is created by any means | ✅ |
| `transaction.updated` | An existing transaction is modified | ✅ |
| `transaction.categorized` | A category is assigned or changed | ✅ |
| `budget.threshold_reached` | Category spending crosses a configured percentage | ✅ |
| `budget.exceeded` | Category spending passes its allocation | ✅ |
| `goal.progress_updated` | Savings goal progress changes | ✅ |
| `goal.completed` | Savings goal target reached | ✅ |
| `household.member_joined` | An invitation is accepted | ✅ |
| `income.received` | An income transaction is detected | future |
| `recurring_payment.detected` | A recurring pattern is inferred from history | future |
| `subscription.detected` | A subscription-shaped charge is identified | future |
| `bank.connected` | An Open Banking connection is authorized | future |
| `bank.connection_expiring` | Consent nears its 90-day expiry | future |
| `loan.rate_opportunity_detected` | A loan's rate is materially above benchmark | future |
| `mortgage.refinance_opportunity_detected` | Refinancing would materially improve the position | future |

### Event shape

```ts
interface DomainEvent<T extends EventType, P> {
  type: T
  householdId: string
  actorId: string | null      // null when system-generated
  occurredAt: string          // ISO 8601
  payload: P
}
```

### Rules

- Domain code emits events. It never calls notification, WhatsApp, or analytics code directly.
- Events are emitted **after** the database write succeeds, never before.
- Handlers must not throw into the emitter. A failed notification must never roll back a transaction.
- Handlers are idempotent — required for the future move to at-least-once queue delivery.
- Adding an event type is additive. Adding a subscriber never touches the emitting module.

### Migration path

When the server layer arrives, `dispatcher.ts` is reimplemented against a durable queue. Every
`emit()` call site stays exactly as written. That is the whole return on this seam.

---

## Notification architecture (MVP: one channel, future: many)

### Separation of concerns

Three questions, three distinct layers, deliberately not merged:

| Question | Layer | Knows about |
|---|---|---|
| *What happened?* | Domain | Nothing but its own domain |
| *Who should hear about it, and how?* | Notification routing | Members, preferences, channels |
| *How is it physically delivered?* | Channel adapters | One transport each |

```
Domain event
     │
     ▼
lib/notifications/router.ts
     │  resolves: which household members care about this event?
     │            which channels has each of them enabled for it?
     │
     ├──→ channels/push.ts        ← MVP: the only implemented channel
     ├──→ channels/inApp.ts       ← future
     ├──→ channels/whatsapp.ts    ← future
     └──→ channels/email.ts       ← future
```

### Channel adapter interface

Every channel implements the same interface. Adding WhatsApp later means adding one file that
implements it — no change to domain code, no change to the router's callers.

```ts
interface NotificationChannel {
  readonly id: 'push' | 'in_app' | 'whatsapp' | 'email'
  isAvailableFor(memberId: string): Promise<boolean>
  send(params: {
    memberId: string
    event: DomainEvent<EventType, unknown>
    rendered: RenderedNotification
  }): Promise<DeliveryResult>
}
```

### Per-member preferences (future)

Each household member eventually configures, independently, which events reach them and through
which channels:

- every transaction
- transactions above a threshold amount
- only shared transactions
- budget nearing its limit
- unusual charge detected
- recurring bill increased
- salary received

MVP ships a single hardcoded rule — budget threshold alerts via push — but it goes through the
router, not around it.

### The WhatsApp constraint

WhatsApp is a headline future differentiator. The architectural requirement is stated as a testable
invariant:

> `grep -ri "whatsapp" features/ app/ lib/ --exclude-dir=notifications` must return zero results,
> permanently.

`lib/notifications/` is excluded because the channel adapter necessarily lives there. Everywhere
else — domain features, screens, engines, queries — must be unaware WhatsApp exists.
See [ADR-014](DECISIONS.md#adr-014).

A future WhatsApp message such as:

```
💳 חיוב חדש
Wolt — ₪126.70
מסעדות ובתי קפה

נשארו ₪214 בתקציב מסעדות ובתי קפה.
```

is produced entirely by the notification layer, from a `transaction.created` event plus a budget
query. The transaction code that emitted the event is unaware any of it happened.

WhatsApp additionally requires the server layer, a verified WhatsApp Business Account, approved
message templates, and per-member explicit opt-in. None of that touches the MVP.

---

## Deterministic financial intelligence vs. AI

**This is the most important architectural rule in the product.**

### The pipeline

```
Verified financial data
        │
        ▼
Deterministic Financial Engine
        │   pure functions · no network · no LLM · no randomness
        │   same inputs always produce identical outputs
        ▼
Rules / models / simulations
        │   versioned · sourced · unit-tested against known-correct fixtures
        ▼
Insight objects
        │   structured results carrying provenance, assumptions, confidence
        ▼
AI explanation / conversation layer
            reads insight objects · explains · translates · converses
            CANNOT compute
```

### What AI may do

- Explain an insight object in natural Hebrew
- Answer "why did my score drop?" by narrating the decomposition the engine produced
- Parse a natural-language question into a structured engine call
- Summarize a month using figures the engine computed
- Suggest a transaction category (a suggestion the user confirms — not a financial figure)
- Extract line items from a receipt photo

### What AI must never do

- Compute or state a monetary total
- Calculate interest, amortization, or any mortgage figure
- Determine eligibility for a tax credit, refund, or benefit
- State a market rate, tax rule, or statutory threshold
- Produce a recommendation that was not generated by the Action Engine
- Estimate, approximate, or "reason about" any number

### Why this is absolute

An LLM asked about Israeli tax credit points will produce a fluent, confident, plausible answer.
It will sometimes be wrong. A family that under-claims a benefit or over-commits to a mortgage on
the strength of a hallucinated figure suffers real harm — and the product has no defense, because
it cannot show its work.

Additionally: Israeli tax and benefit rules change annually. Training data is stale by construction.
Sourced, versioned rules are not.

### Enforcement

- Engines live in `lib/engines/`. That directory may not import any AI client, ever.
- Every engine function is pure and has unit tests with known-correct fixtures.
- The AI layer receives **insight objects only** — never raw financial data with instructions to
  compute over it.
- Any figure in AI output that is not present verbatim in its input insight object is a bug, not a
  quality issue.

See [ADR-012](DECISIONS.md#adr-012).

---

## Household Benchmark Engine (future)

Determines whether a household's spending is reasonable — and refuses to be glib about it.

### Inputs

- Household net income
- Number of adults
- Number of children and their ages
- Geographic region, where the data supports it
- Housing situation (rent / own / other)
- Vehicle ownership
- The household's own spending history
- Verified Israeli statistical datasets (CBS household expenditure survey)

### Output contract

The engine returns a range, never a scalar:

```ts
interface BenchmarkResult {
  categoryId: string
  range: { low: number; typical: number; high: number }   // agorot
  householdValue: number                                   // agorot
  position: 'below' | 'within' | 'above'
  inputsUsed: BenchmarkInput[]     // what actually drove this range
  caveats: string[]                // what this range cannot account for
  provenance: Provenance           // dataset, version, effective date
  confidence: 'low' | 'medium' | 'high'
}
```

### Hard rules

- **Never** "a family of four should spend ₪X." Ranges with context, always.
- Personal circumstances override generic benchmarks. A household can mark a category as
  intentional, and the benchmark is suppressed thereafter.
- Low confidence must be visible in the UI, not hidden behind a clean number.
- The household's own history is often the better benchmark, and requires no external data — it
  ships first, in POST-MVP.

See [ADR-015](DECISIONS.md#adr-015). Blocked on [Q3](DECISIONS.md#open-questions) — CBS data licensing.

---

## Financial Health Engine (future)

An explainable, decomposed score. Not a black box, and not a game.

### Dimensions

Each is computed independently, weighted, and stored with its own history so changes are attributable:

- Savings rate
- Emergency fund coverage
- Debt service ratio
- Overdraft dependency
- Expensive-debt exposure
- Spending-to-income ratio
- Income stability
- Future committed expenses
- Pension readiness
- Child savings adequacy
- Insurance coverage
- Net worth trajectory

### Explainability contract

Every change decomposes into named, signed contributions:

```
74 → 78
  +2  Emergency fund improved
  +1  Expensive loan refinanced
  +1  Savings rate increased
```

### Anti-gamification constraint

The score must never push a household toward a harmful decision. Specifically:

- No streaks that penalize necessary medical, emergency, or care spending
- No incentive to under-insure in order to reduce outflows
- No reward for deferring maintenance or health costs
- A dimension that cannot be improved by a household's real circumstances must not silently
  suppress its score with no explanation

See [ADR-016](DECISIONS.md#adr-016).

---

## Action Engine (future)

The product's answer to "what should we do next?" — and the core of its differentiation.

Every other engine produces observations. The Action Engine ranks them into a queue of things worth
actually doing.

### Recommendation contract

A recommendation without these fields must not be surfaced:

```ts
interface Recommendation {
  id: string
  title: string
  expectedImpactAgorot: number      // in shekels — the point of the whole exercise
  impactHorizon: 'monthly' | 'annual' | 'lifetime'
  confidence: 'low' | 'medium' | 'high'
  assumptions: string[]             // what must be true for this to hold
  risksAndTradeoffs: string[]       // never optimize a number blindly
  dataSource: Provenance
  regulatoryLevel: 1 | 2 | 3 | 4    // see Regulatory separation below
  expiresAt: string | null          // market-rate advice goes stale
  sourceEngine: string
}
```

### Examples of actions

- Cancel an unused subscription
- Lower a category budget that is consistently under-spent
- Move a specific amount toward the emergency fund
- Investigate a probable tax benefit
- Compare an expensive loan against market rates
- Review mortgage refinancing
- Increase a child's savings contribution
- Prepare for a known annual expense

### Rules

- Ranked by expected impact, not by ease of implementation.
- Risks are shown with equal prominence to benefits. Debt consolidation that lowers the monthly
  payment while increasing lifetime cost must say so.
- Recommendations expire. A refinancing recommendation based on last quarter's rates is not shown
  as current.
- Outcomes are tracked: did the household act, and did it help? This closes the feedback loop.

---

## Data provenance (future)

Every externally-sourced financial fact carries its origin and version.

```ts
interface Provenance {
  source: string          // 'Bank of Israel' | 'Israel Tax Authority' |
                          // 'National Insurance Institute' | 'CBS' | ...
  sourceUrl: string | null
  effectiveDate: string   // when the rule/rate took effect
  retrievedAt: string     // when we fetched it
  ruleVersion: string     // our internal version of this rule set
}
```

### Why

- A tax calculation using last year's thresholds is confidently wrong, and without provenance there
  is no way to detect it.
- "Why does it say that?" must always have a citable answer.
- When a rule changes, every insight derived from the previous version must be findable and
  invalidatable. That requires the link to exist from the start.
- Regulatory defensibility depends on being able to show what was known, from where, and when.

### Rules

- No external financial constant is ever hardcoded in application code.
- Insight objects carry provenance forward from the facts they were derived from.
- Stale-data detection is a first-class scheduled concern.

See [ADR-017](DECISIONS.md#adr-017).

---

## Regulatory separation (future)

Israeli law licenses investment, insurance, pension, credit, and mortgage advice. The architecture
keeps four levels distinct so the shippable boundary can move as legal advice dictates.

| Level | Nature | Example | Exposure |
|---|---|---|---|
| 1 | Information | "Your rate is 5.2%. Market average for this track is 4.6%." | Low |
| 2 | Simulation | "At 4.6% your payment would be ₪X. Break-even after fees: 19 months." | Low–moderate |
| 3 | Personalized recommendation | "You should refinance." | **Likely regulated** |
| 4 | Regulated execution | Initiating or brokering the product | **Definitely regulated** |

### Implementation requirement

- Every insight and recommendation carries a `regulatoryLevel` field.
- The UI renders levels 1 and 2 as facts and arithmetic; level 3 is visually and legally distinct.
- Level 3 ships behind a flag that is off until written legal review says otherwise.
- Level 4 requires licensing or a licensed partner and is not on any current plan.

**MVP implements none of these levels.** See [ADR-018](DECISIONS.md#adr-018) and
[Q7](DECISIONS.md#open-questions).

---

## Household composition and permissions (future)

**MVP:** `role IN ('admin', 'member')`, and **every member sees every row.** The UX offers two states
— **shared** and **personal** — and those map to `is_shared`, which is **budget attribution, not
visibility**.

That is a deliberate simplification, **not a belief about what households want.** Whether Israeli
couples want per-member privacy is [Q11](DECISIONS.md#open-questions) — a hypothesis to validate
through user interviews *during* MVP, not a blocker for shipping it.

### The two future axes

They are independent and must not be conflated:

| Axis | Future model | Storage |
|---|---|---|
| **Who is a member** | `member_type` — `adult_partner`, `adult_member`, `teen`, `child`, `dependent`, `advisor` | New column on `household_members`, defaulted |
| **Who can see a row** | `visibility` — `household` / `private` / `selected` | New column on the financial table, defaulted to `household`, plus a grant table for `selected` |

A teenager should see their own allowance without seeing their parents' income. That requires both
axes: a `member_type` that says what they are, and a per-row `visibility` that says what they may
see. Full schema in
[DATABASE_SCHEMA.md](DATABASE_SCHEMA.md#future-model--visibility-not-in-mvp).

### What makes this additive rather than a rewrite

- `household_members` already supports N members with a `role` column — adding `member_type` with a
  default is a one-line migration.
- All financial data is scoped by `household_id`, never by a pair of user columns.
- **Authorization is a function call**, so visibility narrowing extends inside
  `is_household_member()` rather than across forty policies. Today it answers *"is this user in this
  household?"*; later it answers *"…and permitted to see this row?"*
- Visibility is a **defaulted column**, so existing rows keep today's behaviour with no backfill.

### What MVP must not do

- Assume exactly two members anywhere — schema, queries, UI logic, or code comments.
- **Overload `is_shared` to mean visibility.** It is budget attribution only. Overloading it is the
  single most likely way to foreclose this ([ADR-029](DECISIONS.md#adr-029)).
- Add a `visibility` column, grant table, or per-member filtering. Not yet.
- Inline authorization logic into individual policies where it cannot later be narrowed.
- Store user-scoped financial data outside a `household_id` scope.

See [ADR-019](DECISIONS.md#adr-019), [ADR-029](DECISIONS.md#adr-029) and
[PRODUCT_VISION.md §6](PRODUCT_VISION.md#6-household-composition-and-permissions-future).

---

## Future: Server Layer

When Open Banking is introduced, a lightweight HTTP server (Hono on Cloudflare Workers or Railway)
will sit between the client and Supabase. Reasons:

- Bank OAuth tokens must never reach the client
- Token refresh must happen server-to-server
- Webhook ingestion from bank providers requires a public endpoint
- Deterministic engines are better placed server-side once they consume verified data
- The event dispatcher gains durable delivery

At that point:
- Service role key moves to the server environment
- The client continues using the anon key
- A thin API layer is added ([ADR-003](DECISIONS.md#adr-003))
- Repository restructuring becomes worthwhile ([ADR-005](DECISIONS.md#adr-005))
- `lib/events/dispatcher.ts` is reimplemented against a queue — call sites unchanged
- `lib/engines/` moves server-side unchanged, because engines are pure functions

Until then, adding any of these prematurely increases complexity with no benefit.

---

## What the MVP actually builds from this document

To be unambiguous, because this document describes far more than is being built:

| Concern | MVP implementation |
|---|---|
| Events | `lib/events/types.ts` (full vocabulary) + a for-loop dispatcher |
| Notifications | `lib/notifications/router.ts` + one push channel |
| Engines | None. `lib/engines/` does not exist yet. |
| AI | None. |
| Benchmarks | None. |
| Health score | None. |
| Action engine | None. |
| Provenance | None — no external data sources in MVP. |
| Regulatory levels | None. |
| Member types | `role IN ('admin','member')` only. |
| Server layer | None. |
| Open Banking | None. |
| WhatsApp | None. |

Everything else in this document is a boundary, not a build instruction.
