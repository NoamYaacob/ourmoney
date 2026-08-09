# OurMoney — Roadmap

Phases are **dependency-driven, not calendar-driven**. A phase begins when its entry conditions are
met and ends when its exit criteria pass. No dates are assigned until a phase is actually starting.

Long-term product context: [docs/PRODUCT_VISION.md](docs/PRODUCT_VISION.md)
Full feature catalogue: [docs/FEATURES.md](docs/FEATURES.md)
Decisions and rationale: [docs/DECISIONS.md](docs/DECISIONS.md)

```
MVP ──→ POST-MVP ──→ OPEN BANKING ──→ INTELLIGENCE ──→ FINANCIAL OPTIMIZATION ──→ PLATFORM
                          │                 │                     │
                          └── server layer  └── deterministic     └── regulatory
                              required          engines               review required
```

---

# Phase: MVP

**Goal.** A household of two can track their real money together, in Hebrew, and the app is good
enough that they keep using it.

**Entry conditions.** None. This is the starting point.

**Scope is frozen.** The feature list below is exactly what was approved. Nothing from
PRODUCT_VISION.md or FEATURES.md enters this phase. See [ADR-021](docs/DECISIONS.md#adr-021).

## MVP-1 — Foundation & Auth

Detailed plan: [docs/PHASE_1_PLAN.md](docs/PHASE_1_PLAN.md)

- Expo scaffold, TypeScript strict, Expo Router
- Styling decision verified and locked ([ADR-011](docs/DECISIONS.md#adr-011))
- Hebrew RTL configured globally
- Dark / light mode
- Supabase schema migration 001 with RLS policies
- RLS cross-household isolation tests passing
- Email sign-up / sign-in / password reset
- Secure session (`expo-secure-store`)
- Biometric app lock (`expo-local-authentication`)
- Household creation via the atomic `create_household` RPC
- Partner invitation via token + native share sheet
- Hardened `accept_invitation` RPC ([ADR-010](docs/DECISIONS.md#adr-010))
- No INSERT/UPDATE policy on `household_members` ([ADR-022](docs/DECISIONS.md#adr-022))
- Structural RLS guards ([ADR-023](docs/DECISIONS.md#adr-023))
- Navigation skeleton and auth guard
- Domain event type vocabulary + in-process dispatcher ([ADR-013](docs/DECISIONS.md#adr-013))

**Exit criteria**
- [ ] Two users sign up, form one household, and both reach a shared dashboard
- [ ] `supabase/rls_tests.sql` passes, including all ten `accept_invitation` conditions
- [ ] Migration 001 applies cleanly to an empty database
- [ ] `tsc --noEmit` clean, no `any`
- [ ] Hebrew RTL renders correctly on iOS and Android
- [ ] Dark and light mode both render without defects
- [ ] Biometric lock triggers on resume after 30s background

## MVP-2 — Core Financial Loop

- Manual accounts and cards
- Manual transaction entry
- Shared vs personal transactions
- System Hebrew category set (23 seeded)
- Custom household categories
- Uncategorized transaction queue
- Categorization rules (contains / equals / starts_with)
- Retroactive rule application
- Monthly category budgets
- Dashboard: spent / remaining per category and total
- Realtime partner sync
- Push notifications for budget thresholds (single channel behind the notification interface —
  [ADR-014](docs/DECISIONS.md#adr-014))

**Exit criteria**
- [ ] Two users log a full month of real spending without hitting a blocker
- [ ] Dashboard numbers reconcile exactly against manual arithmetic
- [ ] Partner sees a new transaction within 2 seconds
- [ ] Every money value passes through `lib/money/format.ts` — no float arithmetic anywhere
- [ ] Transaction creation emits `transaction.created` and calls no notification code directly

## MVP-3 — Import, Recurring, Goals & Analytics

- CSV import with preview and per-row selection
- Duplicate detection on import
- Recurring transaction templates and auto-generation
- Skip single occurrence
- Savings goals with progress
- Basic analytics: monthly trend, top categories, income vs expense

**Exit criteria**
- [ ] A real Israeli bank CSV export imports correctly
- [ ] Duplicate detection catches re-importing the same file
- [ ] Recurring transactions generate exactly once per due date
- [ ] Weekly manual entry effort under 5 minutes for a typical household

## MVP-4 — Ship Quality

- Onboarding flow
- Empty states and skeleton loaders
- Error boundaries
- Accessibility pass (contrast, font scaling, tap targets)
- Crash reporting ([Q9](docs/DECISIONS.md#open-questions) must be resolved before this task)
- Delete-account flow (store compliance requirement)
- App Store and Play Store submission

**MVP exit criteria — the gate to everything after**
- [ ] Published on both stores
- [ ] At least 10 real households using it for a full month
- [ ] Zero known data-isolation defects
- [ ] Retention signal strong enough to justify the next phase

---

# Phase: POST-MVP

**Goal.** Deepen the manual product and harvest the intelligence wins that need no new infrastructure.

**Entry conditions.** MVP shipped and retained.

Everything here works on data the MVP already has. No server, no bank connection, no AI.

- Budget templates / copy last month
- Sub-categories (`parent_id` already in schema)
- Rule priority ordering (`sort_order` already in schema)
- Split transactions
- Transaction search and bulk categorize
- Savings-rate calculation
- Spending-to-income ratio
- **Historical self-comparison** — the household benchmarked against its own past, requiring no
  external dataset
- Subscription detection (recurring small charges)
- Duplicate subscription detection
- Price increase detection on recurring bills
- Recurring payment detection (infer templates from history)
- Annual expense planning (arnona, insurance, car test, tuition)
- Emergency fund as a first-class goal
- Goal pace projection and auto-progress from a linked account
- Receipt photo attachment (Supabase Storage)
- Offline read-only degradation
- Net worth (manual assets and liabilities)
- Per-member notification preferences
- Per-event notification rules
- In-app notification centre
- CSV / PDF export
- Member types: `teen`, `child`, `dependent` — additive migration ([ADR-019](docs/DECISIONS.md#adr-019))
- Visibility levels per member type
- Email invitations (requires [Q1](docs/DECISIONS.md#open-questions))
- English UI
- Home screen widgets

**Exit criteria**
- [ ] Households derive value without manually entering every transaction
- [ ] Member types and visibility shipped without touching financial table structure
- [ ] Notification preferences respected across all events
- [ ] The event vocabulary has proven extensible — new events added without touching domain modules

---

# Phase: OPEN BANKING

**Goal.** Verified, automatic transaction data. This unlocks every intelligence phase that follows.

**Entry conditions**
- POST-MVP shipped
- [Q4](docs/DECISIONS.md#open-questions) resolved — provider selected
- Budget approved for provider fees

**This phase introduces the server layer.** See [ADR-003](docs/DECISIONS.md#adr-003) and
[docs/OPEN_BANKING.md](docs/OPEN_BANKING.md).

## OB-1 — Server foundation
- Introduce the API server (Hono or equivalent)
- Move the service role key server-side; the client keeps the anon key
- Repository restructuring for two artifacts ([ADR-005](docs/DECISIONS.md#adr-005) revisit)
- Migrate the event dispatcher from in-process to durable ([ADR-013](docs/DECISIONS.md#adr-013))
- Move recurring generation server-side ([Q2](docs/DECISIONS.md#open-questions))

## OB-2 — Bank connections
- `OpenBankingAdapter` interface and first implementation
- `ob_providers`, `ob_connections`, `ob_sync_log` tables
- Token storage in Supabase Vault — never on the client
- Consent flow with explicit scope display
- Connection status and re-authorization UX

## OB-3 — Sync pipeline
- Transaction sync with deduplication against manual entries
- Merchant name enrichment
- Auto-categorization from enriched data
- Balance reconciliation
- Token refresh background job
- 90-day consent expiry handling with advance notification
- `bank.connected` and `bank.connection_expiring` events

**Exit criteria**
- [ ] A household connects a real Israeli bank and sees transactions sync
- [ ] No bank token ever present in client memory, storage, or logs
- [ ] Deduplication correctly merges bank data with prior manual entries
- [ ] Consent expiry produces a re-auth prompt before access breaks
- [ ] Revocation deletes tokens and flags derived data
- [ ] Full audit trail of every data fetch

---

# Phase: INTELLIGENCE

**Goal.** Move from "what happened" to "what does this mean." First deterministic engines.

**Entry conditions**
- Open Banking shipped — engines need verified data, not hand-typed data
- At least 3 months of synced history for a meaningful cohort

Every engine here is a pure, unit-tested function. No LLM computes any figure
([ADR-012](docs/DECISIONS.md#adr-012)).

## INT-1 — Cash flow
- Income detection and classification
- Committed-expense model (fixed costs, recurring, known obligations)
- **Safe-to-Spend** — the flagship number
- Monthly cash-flow forecasting
- End-of-month position projection
- Overdraft prediction and early warning
- `income.received`, `recurring_payment.detected`, `subscription.detected` events

## INT-2 — Position and health
- Balance sheet model (assets, liabilities)
- Net-worth trajectory
- Income stability scoring
- Emergency fund planner (target derived from this household's actual fixed costs)
- Debt service ratio
- **Financial Health Score** — explainable, decomposed
  ([ADR-016](docs/DECISIONS.md#adr-016))
- Score change attribution

## INT-3 — Benchmarks
- Requires [Q3](docs/DECISIONS.md#open-questions) resolved — CBS data licensing
- **Household Benchmark Engine** — ranges only, never verdicts
  ([ADR-015](docs/DECISIONS.md#adr-015))
- Household-size, income, and children-age adjusted ranges
- Automatic budget generation from history plus benchmarks
- Savings-rate recommendation as a contextual range

## INT-4 — Provenance infrastructure
- Versioned external-rule storage ([ADR-017](docs/DECISIONS.md#adr-017))
- `source` / `effective_date` / `retrieved_at` / `rule_version` on every external fact
- Insight object model with provenance and expiry
- Stale-data detection and invalidation

**Exit criteria**
- [ ] Safe-to-Spend is accurate enough that households trust and act on it
- [ ] Every engine is a pure function with unit tests against known-correct fixtures
- [ ] Health score changes are always fully attributable
- [ ] No benchmark is ever presented as a single number
- [ ] No figure anywhere in the product originates from an LLM
- [ ] Every external fact carries provenance

---

# Phase: FINANCIAL OPTIMIZATION

**Goal.** The differentiation. Debt, mortgage, rights, and the Action Engine.

**Entry conditions**
- INTELLIGENCE shipped
- [Q7](docs/DECISIONS.md#open-questions) resolved — legal review on personalized recommendation
- Rule corpus sourcing established

Everything here respects the four-level regulatory separation
([ADR-018](docs/DECISIONS.md#adr-018)). Levels 1 and 2 ship first; level 3 only with legal sign-off.

## FO-1 — Debt
- Debt model across all liability types
- True lifetime interest cost
- Payoff planner: avalanche and snowball simulations, with the real cost difference shown
- Overdraft (מסגרת אשראי) dependency analysis
- Borrowing cost vs. Bank of Israel benchmark rates
- Debt consolidation simulator — must surface risks, not just the lower payment
- `loan.rate_opportunity_detected` event

## FO-2 — Mortgage
- Multi-track (מסלולים) mortgage model
- CPI indexation (הצמדה למדד) handling
- Full amortization schedule (לוח סילוקין)
- Total future interest
- **Refinancing simulator (מיחזור)** with break-even including early-repayment fees
- Partial prepayment simulator: pay down vs. invest
- Side-by-side scenario comparison
- `mortgage.refinance_opportunity_detected` event

## FO-3 — Israeli financial rights
- Versioned rules corpus from official sources
- Eligibility engine — rules only, never model inference
- Tax credit points (נקודות זיכוי)
- Tax refund detection (החזרי מס)
- National Insurance (ביטוח לאומי) benefits
- Child-related and municipal benefits
- Reserve duty (מילואים) rights
- Self-employed deductions

## FO-4 — Expense optimization
- Banking fee analysis
- Telecom / internet / electricity plan optimization (needs market rate data)
- Insurance cost analysis and duplicate detection
- Negotiation opportunity surfacing

## FO-5 — The Action Engine
- Ranked recommendations across every engine
- Each action carries: expected impact in shekels, confidence, assumptions, risks and tradeoffs,
  data source, and expiry
- Action tracking and outcome measurement

**Exit criteria**
- [ ] Mortgage arithmetic verified against an independent professional calculation
- [ ] Every eligibility determination traceable to a versioned, sourced rule
- [ ] No eligibility decision made by an LLM
- [ ] Every recommendation shows impact, confidence, assumptions, and risks
- [ ] Level-3 recommendations gated behind written legal review
- [ ] Recommendations expire when their underlying data goes stale

---

# Phase: PLATFORM

**Goal.** The Financial Twin, conversational access, and WhatsApp as a primary surface.

**Entry conditions**
- FINANCIAL OPTIMIZATION shipped
- [Q5](docs/DECISIONS.md#open-questions) and [Q6](docs/DECISIONS.md#open-questions) resolved

## PL-1 — WhatsApp assistant
- WhatsApp Business Platform integration behind the notification layer
- Per-member explicit opt-in, revocable
- Transaction alerts, budget warnings, salary notifications, unusual-charge alerts
- Interactive queries: "כמה נשאר לנו החודש?"
- Interactive actions: "תעביר את העסקה האחרונה לקטגוריית בית"

## PL-2 — AI layer
- Conversational interface over insight objects
- Natural-language query → intent parse → deterministic engine call → explanation
- AI transaction categorization (suggestion only, user confirms)
- Receipt understanding
- Monthly narrative summaries
- Anomaly explanation
- Proactive insight surfacing

**The AI layer reads insight objects. It never computes.** Any figure in AI output that is not
present in its input is a bug ([ADR-012](docs/DECISIONS.md#adr-012)).

## PL-3 — Financial Twin
- Complete household financial state model
- Fork / apply-change / recompute / diff
- **What-if simulator**: another child, salary drop, car purchase, moving, mortgage change,
  increased investment, affordability of a specific purchase
- Multi-decade projection

**Exit criteria**
- [ ] WhatsApp alerts delivered with correct per-member preferences
- [ ] Transaction domain code contains zero WhatsApp references
- [ ] AI never produces an unsourced number
- [ ] What-if simulations reconcile exactly with the deterministic engines
- [ ] A household can ask a genuine life question and get a grounded, explainable answer

---

## Deferred indefinitely

Recorded so they are not re-litigated. Full list in [docs/FEATURES.md](docs/FEATURES.md#explicitly-rejected-for-now).

- External bill splitting (Splitwise-style)
- Crypto portfolio tracking
- Stock trading / brokerage
- Business accounting
- Social comparison features
- Gamified saving streaks
