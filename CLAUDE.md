# OurMoney — Claude Code Instructions

## Project Overview

OurMoney is a mobile-first Hebrew RTL budgeting app for households, optimized for couples.
Stack: Expo + React Native + Expo Router, Supabase (Auth + PostgreSQL + Realtime + RLS), TypeScript strict.

The long-term product is a **Financial Operating System for Israeli households**
(see [docs/PRODUCT_VISION.md](docs/PRODUCT_VISION.md)). That vision does **not** expand MVP scope.
It constrains naming and module boundaries only. See [ADR-021](docs/DECISIONS.md#adr-021).

## Scope discipline — read this before starting any task

The vision documents in `docs/` describe a much larger product than what is being built.

**Test every task against this:** if it cannot be traced to the MVP feature list in
[ROADMAP.md](ROADMAP.md#phase-mvp), it is out of scope — no matter how well it serves the vision.

If a task seems to require an engine, an AI call, a bank connection, WhatsApp, a message broker,
or a permission system: **stop and ask.** The answer is almost certainly that it should not.

---

## Strategic findings that constrain implementation

Established by the August 2026 market research. These are not aspirations — each one changes how
code is written today. Full evidence in [docs/MARKET_RESEARCH.md](docs/MARKET_RESEARCH.md).

| Finding | What it means when writing code |
|---|---|
| **Household is the primary product unit** | Not the user, not the couple. Every financial row is scoped by `household_id`. Never assume exactly two members ([ADR-006](docs/DECISIONS.md#adr-006)) |
| **Editable, explainable categorisation rules are our biggest early differentiator** | Categorisation drudgery is the #1 complaint in the Israeli market, and even best-in-class Copilot **cannot show or let you edit your own rules in-app**. Rules must always be visible, editable, and able to explain *why* a transaction matched ([ADR-027](docs/DECISIONS.md#adr-027)) |
| **Deterministic financial intelligence is a safety principle, not a preference** | Engines compute; AI only explains. A hallucinated mortgage or benefit figure harms a real family ([ADR-012](docs/DECISIONS.md#adr-012)) |
| **WhatsApp differentiation is the *interactive assistant*, not outbound alerts** | RiseUp already pushes WhatsApp insights ~3×/week. Outbound notification is table stakes. The unbuilt thing is two-way — answering *"כמה נשאר לנו החודש?"* and accepting *"תעביר את העסקה לקטגוריית בית"* ([ADR-024](docs/DECISIONS.md#adr-024)) |
| **The Financial Twin is a long-term moat** | Every incremental modelling decision either makes it possible or forecloses it. Nobody anywhere grounds life-event simulation in real transaction data |
| **The Israeli rights/benefits engine is a long-term moat** | Free government infrastructure, no consumer layer, intermediaries charging 15–25% of refunds. Must run on versioned, sourced rules — never model inference ([ADR-017](docs/DECISIONS.md#adr-017)) |

## Critical Rules

### Money — Non-Negotiable

- ALL monetary values are stored and computed as **integer agorot** (100 agorot = 1 ILS).
- NEVER use `number` floats for money. Use `bigint` in the database; in TypeScript use `number` only when
  you can guarantee the value is always an integer (no decimals).
- The ONLY place money is converted to a display string is `lib/money/format.ts`.
- No `toFixed`, no `parseFloat`, no division that creates decimals, anywhere on a monetary value.
- When in doubt: `amountAgorot: number` is the canonical field name pattern.

```ts
// CORRECT
const totalAgorot = transactionA.amountAgorot + transactionB.amountAgorot

// WRONG — never do this
const total = 129.99 + 45.5
```

### TypeScript

- Strict mode is always on. No `any`. No `// @ts-ignore` without an explanation comment above it.
- Use the generated Supabase types from `types/database.ts`. Run `supabase gen types typescript` after every schema change and commit the updated file.
- Prefer `unknown` over `any` for external / untyped data.
- Domain types live in `types/app.ts`. Do not re-derive them inline in components.

### RTL and Hebrew

- The app is RTL-first. Default locale is Hebrew (`he`).
- Use the `useRTL()` hook for direction-sensitive values (flex direction, absolute positions, etc.).
- Never hardcode `left` / `right` in styles — use `start` / `end` logical properties, or the hook.
- All user-facing strings go in `i18n/locales/he.json`. No hardcoded Hebrew text in components.
- i18n keys are English, camelCase: `t('dashboard.totalSpent')`.
- When adding a new screen or component, add its strings to `he.json` immediately.

### Supabase

- The `supabase` client in `lib/supabase/client.ts` uses the **anon key only**. Never put the service role key in client-side code.
- All financial data access is protected by RLS. Never bypass it.
- RLS policies travel with their table: every migration that creates a financial table must include the RLS policies in the same file.
- After every schema change: run `supabase gen types typescript --local > types/database.ts` and commit.
- Supabase calls happen only in hooks (`hooks/` or `features/*/hooks/`), never directly in components or screen files.
- Use TanStack Query for all server state. No `useEffect` + `useState` for data fetching.

### Security

- Tokens and sensitive session data are stored in `expo-secure-store`, never in AsyncStorage.
- Biometric authentication gates re-entry to the app after backgrounding, not the initial sign-in.
- Never log auth tokens, user IDs, or monetary values. Use anonymized event labels in any analytics.
- The RLS security tests in `supabase/rls_tests.sql` must pass before any schema migration is merged.

### Component Architecture

- Screen files in `app/` are thin: they compose feature components, handle navigation, and pass route params.
- Business logic lives in `features/<name>/hooks/`.
- Shared, generic UI (Button, Input, Card, etc.) lives in `components/ui/`.
- Feature-specific UI lives in `features/<name>/components/`.
- No direct Supabase client calls in any component or screen file.

### File and Export Conventions

- File names: `kebab-case.tsx` for components, `camelCase.ts` for utilities and hooks.
- Components: named PascalCase export (no default exports for components).
- Hooks: `useCamelCase.ts`, named export.
- No `index.ts` barrel files — import from the specific file path.

### Transaction Identity — Do Not Violate

`transactions` is the most-referenced table in the schema. Four invariants keep future capabilities
(installments, per-member visibility) addable without redefining what a row means
([ADR-029](docs/DECISIONS.md#adr-029)):

- **One row = one movement of money at one point in time.** A row is **not** "a purchase" and
  **not** "a bill". A 12-instalment purchase will one day be 12 rows linked to one plan.
- **`id` is an opaque surrogate UUID.** Never derived from business fields, never reused.
- **`txn_date` means exactly one thing:** the date money moves for *this row*. Not the purchase
  date, not the statement date.
- **No UNIQUE constraint on business fields.** Deduplication is scored application logic. Twelve
  identical monthly instalments are legitimately near-identical rows.

**Never overload a boolean.** `is_shared` is **budget attribution only**. `is_excluded` is
**user-driven exclusion only**. Neither may be used to mean visibility, installment status, or
anything else.

### Visibility

MVP has exactly two UX states — **shared** and **personal** — and they map to `is_shared`, which is
budget attribution. **Every household member can see every row in MVP.**

That is a deliberate simplification, not a belief about what users want. Whether Israeli couples
want per-member privacy is [Q11](docs/DECISIONS.md#open-questions), a hypothesis to validate through
user interviews during MVP — **not a blocker for it**.

- Do **not** add a `visibility` column, grant table, or any per-member filtering in MVP.
- Do **not** write authorization logic that would be hard to narrow later. Visibility checks belong
  **inside the RLS helper function**, never inlined across policies.

### Domain Language

- The financial household entity is called `household` in code, database, and types.
- Never use `couple`, `family`, or `group` as an entity name in code.
- Database tables: `households`, `household_members`.
- TypeScript types: `Household`, `HouseholdMember`.
- **Never assume a household has exactly two members.** Not in schema, queries, business logic,
  variable names, or comments. The UX is optimized for two; the model is not. ([ADR-006](docs/DECISIONS.md#adr-006))
- Do not write logic that assumes every member sees everything, in a way that could not later be
  narrowed. Visibility is currently always true — it will not always be. ([ADR-019](docs/DECISIONS.md#adr-019))

### Deterministic Financial Logic vs. AI — Absolute Rule

**Financial figures are computed by deterministic code. AI never originates a number.**

This applies now, even though there is no AI in the MVP, because it determines how financial
logic is written.

- Financial calculations live in pure functions: no network, no randomness, no model calls.
- Same inputs must always produce identical outputs.
- Never generate, estimate, or "reason about" a monetary value, interest calculation, tax rule,
  benefit eligibility, market rate, or statutory threshold.
- When the AI layer eventually exists, it reads structured insight objects and explains them.
  Any figure in AI output not present in its input is a bug.
- `lib/engines/` (future) may never import an AI client.

Why: a hallucinated mortgage figure or fabricated benefit entitlement causes real financial harm
to a real family, and the product cannot show its work. See [ADR-012](docs/DECISIONS.md#adr-012).

### Domain Events — Emit, Never Call

- Domain mutations emit a domain event via `emit()` from `lib/events/dispatcher.ts`.
- Domain code **never** calls notification, push, WhatsApp, email, or analytics code directly.
- Events are emitted **after** the write succeeds, never before.
- Handlers must not throw into the emitter — a failed notification must never roll back a write.
- Handlers must be idempotent.
- Add new event types freely; adding a subscriber must never require touching the emitting module.
- The MVP dispatcher is a synchronous for-loop. **Do not add a message broker, queue, or
  pub/sub infrastructure.** ([ADR-013](docs/DECISIONS.md#adr-013))

### Notifications — Channel Independence

- The notification layer is the only code that knows delivery channels exist.
- `grep -ri "whatsapp" features/ app/ lib/ --exclude-dir=notifications` must return zero results.
  Permanently. The channel adapter lives in `lib/notifications/channels/`; nothing else may know.
- MVP has exactly one channel (push), and it still goes through `lib/notifications/router.ts`,
  not around it. ([ADR-014](docs/DECISIONS.md#adr-014))

### External Financial Data

- Never hardcode a tax rate, benefit threshold, market rate, or statutory figure in application code.
- MVP has no external financial data sources, so this rule should simply never come up. If a task
  seems to need one, that task is out of MVP scope.
- When such data is eventually introduced, it carries `source`, `effective_date`, `retrieved_at`,
  and `rule_version`. ([ADR-017](docs/DECISIONS.md#adr-017))

---

## Project Structure

```
ourmoney/
├── app/                    # Expo Router pages (thin screens only)
│   ├── (auth)/
│   ├── (app)/
│   ├── onboarding/
│   └── invite/
├── components/             # Generic, reusable UI components
│   └── ui/
├── features/               # Domain feature slices
│   ├── auth/
│   ├── household/
│   ├── accounts/
│   ├── transactions/
│   ├── categories/
│   ├── budgets/
│   ├── recurring/
│   └── savings/
├── hooks/                  # App-wide hooks (useAuth, useHousehold, useRTL)
├── store/                  # Zustand — local UI state only (authStore, householdStore)
├── lib/
│   ├── supabase/           # Client init, shared query helpers
│   ├── money/              # ILS formatting, agorot arithmetic
│   ├── events/             # Domain event types + in-process dispatcher
│   ├── notifications/      # Event → member → channel routing
│   │   └── channels/       # push.ts (MVP). Others are future.
│   ├── queryClient.ts      # TanStack Query configuration
│   └── utils/
├── i18n/
│   └── locales/
│       └── he.json
├── types/
│   ├── database.ts         # Supabase generated — do not edit manually
│   └── app.ts              # Domain types
├── constants/
├── supabase/
│   ├── migrations/
│   ├── seed.sql
│   └── rls_tests.sql       # Run before merging any migration
└── docs/
```

---

## Common Commands

```bash
# Start Expo dev server
npx expo start

# Start Supabase locally
npx supabase start

# Apply migrations to local DB
npx supabase db push

# Regenerate TypeScript types (run after every schema change)
npx supabase gen types typescript --local > types/database.ts

# Reset local database and re-seed
npx supabase db reset

# Run RLS security tests
npx supabase db test supabase/rls_tests.sql
```

---

## Hard Constraints for MVP

These must not be introduced until explicitly approved:

**Infrastructure**
- No tRPC, Hono, or separate API server.
- No Turborepo or monorepo tooling.
- No Drizzle ORM — use Supabase JS client and raw SQL migrations.
- No message broker, queue, or pub/sub (no Kafka, SQS, PgMQ, Redis).
- No microservices.
- No service role key in client code.

**Integrations**
- No Open Banking, bank credentials, access tokens, or screen scraping.
- No Salt Edge, Plaid, or any financial aggregator.
- No WhatsApp / WhatsApp Business Platform.
- No transactional email provider (invitations use the native share sheet).
- No LLM or AI integration of any kind.

**Financial intelligence** — none of these exist in MVP
- No Safe-to-Spend, cash-flow forecasting, or committed-expense model.
- No benchmark engine, financial health score, or action engine.
- No debt, mortgage, pension, or insurance models.
- No eligibility or tax-rights engine.
- No what-if simulator or Financial Twin.

**Product**
- No member types beyond `admin` / `member`.
- No per-member visibility rules.
- No multi-household support.
- No floating point money math.
- No hardcoded Hebrew strings in components.

## Documentation Map

| File | Purpose |
|---|---|
| [ROADMAP.md](ROADMAP.md) | What is being built, in what order. **MVP scope is defined here.** |
| [docs/PHASE_1_PLAN.md](docs/PHASE_1_PLAN.md) | The current phase, task by task |
| [docs/PROJECT_SPEC.md](docs/PROJECT_SPEC.md) | MVP feature requirements and screens |
| [docs/DATABASE_SCHEMA.md](docs/DATABASE_SCHEMA.md) | Schema, RLS policies, security tests |
| [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) | System design and future boundaries |
| [docs/DECISIONS.md](docs/DECISIONS.md) | ADRs — why things are the way they are |
| [docs/PRODUCT_VISION.md](docs/PRODUCT_VISION.md) | Long-term vision. **Not scope.** |
| [docs/FEATURES.md](docs/FEATURES.md) | Feature registry. **Not a plan.** |
| [docs/OPEN_BANKING.md](docs/OPEN_BANKING.md) | Future provider abstraction. Not MVP. |
