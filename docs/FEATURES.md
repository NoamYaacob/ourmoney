# OurMoney — Feature Registry

A long-term catalogue of everything OurMoney may eventually do.

**This is a registry, not a plan.** Presence in this document implies nothing about scheduling.
For what is being built and in what order, see [ROADMAP.md](../ROADMAP.md).

> **Revised after the August 2026 market research.** Three changes worth knowing before reading:
>
> 1. **A new section — [Israeli structural primitives](#israeli-structural-primitives) — was added at
>    the top of CORE.** Installments, the aggregated card charge and overdraft-as-normal are not
>    features; they are correctness requirements, and no product anywhere has them.
> 2. **Several entries were downgraded** because a competitor already does them well. Cross-bank
>    aggregation, subscription detection and pension aggregation are now marked
>    **[COMPETITOR-SOLVED]** — see [OUR_ADVANTAGES.md § What NOT to build](OUR_ADVANTAGES.md#what-not-to-build).
> 3. **US-style debt payoff was moved to "explicitly rejected"** — it models a debt shape Israeli
>    households largely do not have
>    ([MARKET_RESEARCH.md §2.3](MARKET_RESEARCH.md#23-the-overdraft-מינוס-as-a-normal-state)).
>
> New status marker: **[COMPETITOR-SOLVED]** — a competitor does this well enough that entering is a
> poor use of effort. Not the same as low value.

## Tier definitions

| Tier | Meaning |
|---|---|
| **CORE** | Table stakes. Without these it is not a budgeting app. Includes all MVP scope. |
| **GROWTH** | Makes the product genuinely useful and drives retention. Mostly post-MVP. |
| **DIFFERENTIATION** | The reason a household picks OurMoney over anything else. The moat. |
| **MOONSHOT** | Transformative if achieved. High technical, regulatory, or partnership risk. |

## Status legend

| Marker | Meaning |
|---|---|
| **[MVP]** | In approved MVP scope — being built first |
| **[NEXT]** | Immediately post-MVP, no major new dependencies |
| **[BLOCKED: x]** | Requires x before it is possible |
| **[REG]** | May carry Israeli regulatory/licensing implications — legal review required |
| **[RESEARCH]** | Feasibility, data availability, or partnership unproven |
| **[COMPETITOR-SOLVED]** | A competitor does this well enough that entering is a poor use of effort. Not the same as low value |
| **[PROPOSED — needs approval]** | Research argues for it, but it is **outside approved scope** and must not be built until explicitly approved |

---

# CORE

## Israeli structural primitives

**These are correctness requirements, not features.** A product that lacks them does not merely
offer less — it displays wrong numbers to Israeli households. No product researched, Israeli or
international, has any of them. See [MARKET_RESEARCH.md §2](MARKET_RESEARCH.md) and
[PRODUCT_VISION.md §5.5](PRODUCT_VISION.md).

| Primitive | Status | Notes |
|---|---|---|
| **Installments (תשלומים) as a first-class object** | **[PROPOSED — needs approval]** | One purchase → N future obligations. **Proposal:** carry the columns in migration 001 so the most-referenced table is not remodelled later; UI and forecasting stay POST-MVP. **This is not currently in approved MVP scope** — see [Q18](DECISIONS.md#open-questions) |
| **Charge-date vs transaction-date** | **[PROPOSED — needs approval]** | A card transaction on the 3rd may not debit the bank until the 10th of the following month. Same proposal and same open question as installments |
| **Projected consolidated card charge** | [BLOCKED: cash-flow engine] | The number Israeli households actually need. Isracard's day-countdown is the only acknowledgement of it in the market |
| **Overdraft (מסגרת אשראי) as a modelled state** | [BLOCKED: balance sheet] | Depth, cost, and exit path — not an exception alert |
| **CPI (מדד) linkage on liabilities** | [BLOCKED: mortgage model] | Absent from every product researched |
| **קרן השתלמות** | [BLOCKED: pension data] | No foreign equivalent; unmodellable by any imported product |

**The proposal, stated precisely.** Add installment and charge-date columns to `transactions` in
migration 001; compute nothing over them until a cash-flow engine exists. This follows the
[ADR-006](DECISIONS.md#adr-006) reasoning — general model now, thin implementation now, no rewrite
later — and the same logic that keeps `receipt_url` and `parent_id` in the MVP schema unused.

**It is a proposal, not a decision.** Approved MVP scope does not include it, no migration reflects
it, and it would add columns to the most security-sensitive table in the system. The argument
against is equally real: `transactions` is the table every RLS policy and every future migration
touches, and speculative columns on it are not free.

**Do not implement without explicit approval** ([Q18](DECISIONS.md#open-questions)).

## Accounts and financial position

| Feature | Status | Notes |
|---|---|---|
| Manual bank accounts | **[MVP]** | checking, savings, credit card, cash, investment, other |
| Manual credit cards | **[MVP]** | modeled as an account type |
| Shared vs personal accounts | **[MVP]** | `owner_id` null = household-owned |
| Account balances | **[MVP]** | integer agorot, manually maintained |
| Account archiving | **[MVP]** | preserve history, exclude from totals |
| Multi-currency accounts | **[NEXT]** | ILS-only in MVP; USD/EUR common for Israeli households |
| FX rate handling | [BLOCKED: rate data source] | needed for real multi-currency |
| Net worth tracking | **[NEXT]** | assets minus liabilities over time |
| Asset registry | [BLOCKED: balance sheet model] | property, vehicles, valuables |

## Transactions

| Feature | Status | Notes |
|---|---|---|
| Manual transaction entry | **[MVP]** | the critical daily action |
| Shared vs personal transactions | **[MVP]** | `is_shared` flag |
| Transaction notes | **[MVP]** | |
| Receipt photo attachment | **[NEXT]** | Supabase Storage — `receipt_url` column exists, unused in MVP |
| Transaction exclusion from budgets | **[MVP]** | `is_excluded` |
| CSV import | **[MVP]** | Israeli bank export formats |
| CSV duplicate detection | **[MVP]** | account + date + amount + description |
| Real-time household sync | **[MVP]** | Supabase Realtime |
| Split transactions | **[NEXT]** | partial shared / partial personal |
| Transaction search | **[NEXT]** | full-text over description and merchant |
| Bulk edit / bulk categorize | **[NEXT]** | |
| Transaction attachments beyond receipts | **[NEXT]** | warranties, invoices |
| Open Banking auto-sync | [BLOCKED: **ISA licence** + server layer] | **[COMPETITOR-SOLVED]** Cal, Leumi and FIBI all ship free cross-bank aggregation. Needs an ISA licence ([Q13](DECISIONS.md#open-questions)) — a legal gate, not just a technical one |
| Merchant enrichment | [BLOCKED: Open Banking] | clean merchant names, logos, locations |

## Categorization

| Feature | Status | Notes |
|---|---|---|
| System category set (Hebrew) | **[MVP]** | 23 seeded categories |
| Custom household categories | **[MVP]** | |
| Income vs expense categories | **[MVP]** | `is_income` |
| Uncategorized transaction queue | **[MVP]** | surfaced prominently |
| Categorization rules | **[MVP]** | contains / equals / starts_with |
| Retroactive rule application | **[MVP]** | user-triggered |
| Sub-categories | **[NEXT]** | `parent_id` column already exists |
| Rule priority ordering | **[NEXT]** | `sort_order` already exists |
| AI transaction categorization | [BLOCKED: AI layer] | suggestion only, user confirms |

## Budgets

| Feature | Status | Notes |
|---|---|---|
| Monthly category budgets | **[MVP]** | |
| Spent / remaining per category | **[MVP]** | dashboard core |
| Total household budget view | **[MVP]** | |
| Budget threshold notifications | **[MVP]** | push, at a fixed threshold; configurable % is [NEXT] |
| Budget over-run indication | **[MVP]** | negative remaining |
| Budget templates / copy last month | **[NEXT]** | large UX win, small effort |
| Budget rollover rules | **[NEXT]** | carry unspent forward |
| Non-monthly budget periods | **[NEXT]** | weekly, quarterly, custom |
| Automatic budget generation | [BLOCKED: benchmark engine] | propose a budget from history + benchmarks |

## Recurring and obligations

| Feature | Status | Notes |
|---|---|---|
| Recurring transaction templates | **[MVP]** | |
| Recurring frequencies | **[MVP]** | daily → yearly |
| Auto-generation on due date | **[MVP]** | on app open |
| Skip single occurrence | **[MVP]** | |
| Recurring payment detection | **[NEXT]** | infer templates from transaction history |
| Annual expense planning | **[NEXT]** | arnona, insurance, car test, tuition |
| Bill increase detection | **[NEXT]** | "your internet went up ₪22/month" |
| Future obligation calendar | [BLOCKED: forward model] | known dated future expenses |

## Savings and goals

| Feature | Status | Notes |
|---|---|---|
| Savings goals | **[MVP]** | name, target, optional date |
| Goal progress tracking | **[MVP]** | manual `current_agorot` |
| Goal linked to account | **[MVP]** | optional `account_id` |
| Goal completion | **[MVP]** | |
| Pace projection | **[NEXT]** | "at this rate: 14 months" |
| Auto-progress from linked account | **[NEXT]** | derive from account balance |
| Emergency fund as a first-class goal | **[NEXT]** | distinct from generic savings |

## Household and access

| Feature | Status | Notes |
|---|---|---|
| Household creation | **[MVP]** | |
| N-member households | **[MVP]** | schema supports N; UX optimized for 2 |
| Invite via token + share sheet | **[MVP]** | WhatsApp-friendly link |
| Invitation expiry | **[MVP]** | 7 days |
| Admin / member roles | **[MVP]** | coarse-grained |
| Member removal | **[MVP]** | admin only |
| Email invitations | **[NEXT]** | requires transactional email provider |
| Member types (teen, child, dependent) | **[NEXT]** | additive to `household_members` |
| Visibility levels per member | **[NEXT]** | teen cannot see parents' income |
| Multiple households per user | [BLOCKED: household switching UX] | MVP: one household per user |
| Advisor / accountant guest access | **[REG]** | time-limited read-only |

## Platform basics

| Feature | Status | Notes |
|---|---|---|
| Email auth | **[MVP]** | |
| Secure session (expo-secure-store) | **[MVP]** | |
| Biometric app lock | **[MVP]** | |
| RLS on every financial table | **[MVP]** | non-negotiable |
| Hebrew RTL UI | **[MVP]** | |
| Dark / light mode | **[MVP]** | |
| Push notifications | **[MVP]** | budget alerts |
| Basic analytics | **[MVP]** | monthly trend, top categories, income vs expense |
| CSV export | **[NEXT]** | |
| PDF export | **[NEXT]** | tax purposes |
| English UI | **[NEXT]** | i18n scaffolding exists from day one |
| Offline read-only mode | **[NEXT]** | cached reads; MVP ships error boundaries only |
| Widgets (iOS/Android home screen) | **[NEXT]** | budget remaining at a glance (Safe-to-Spend once it exists) |

---

# GROWTH

## Financial intelligence — cash flow

| Feature | Status | Notes |
|---|---|---|
| **Safe-to-Spend** | [BLOCKED: obligation model] | income − committed − goals = safe discretionary. Flagship number. |
| Monthly cash-flow forecasting | [BLOCKED: recurring detection] | project month-end position |
| Income detection and tracking | [BLOCKED: Open Banking] | reliable salary identification needs verified bank data |
| Income stability scoring | [BLOCKED: 6+ months history] | variance in deposit amount and timing |
| Committed-expense calculation | [BLOCKED: recurring detection] | what is already spoken for |
| End-of-month projection | [BLOCKED: cash-flow engine] | "you will end ₪340 short" |
| Overdraft prediction | [BLOCKED: cash-flow engine] | warn before it happens |

## Financial intelligence — position

| Feature | Status | Notes |
|---|---|---|
| **Financial Health Score** | [BLOCKED: health engine] | explainable, multi-dimensional |
| Score change explanation | [BLOCKED: health engine] | "+2 emergency fund, +1 refinance" |
| Savings-rate calculation | **[NEXT]** | simple, high value |
| Savings-rate recommendation | [BLOCKED: benchmark engine] | contextual range, not a verdict |
| Emergency fund planner | [BLOCKED: obligation model] | target = f(fixed costs, income stability, dependents) |
| Debt service ratio | [BLOCKED: debt model] | |
| Spending-to-income ratio | **[NEXT]** | |
| Net-worth trajectory | [BLOCKED: balance sheet] | |
| Financial resilience assessment | [BLOCKED: health engine] | "you could survive 2.3 months" |

## Household benchmarks

| Feature | Status | Notes |
|---|---|---|
| **Household Benchmark Engine** | [BLOCKED: CBS data licensing] | see ARCHITECTURE.md |
| Household-size adjusted ranges | [BLOCKED: benchmark engine] | |
| Income-adjusted ranges | [BLOCKED: benchmark engine] | |
| Children-age adjusted ranges | [BLOCKED: benchmark engine] | |
| Regional adjustment | [BLOCKED: benchmark engine] | [RESEARCH] data granularity uncertain |
| Historical self-comparison | **[NEXT]** | compare household to its own past — no external data needed |
| "Is this reasonable?" per category | [BLOCKED: benchmark engine] | always a range with caveats |

## Expense optimization

| Feature | Status | Notes |
|---|---|---|
| Subscription detection | **[NEXT]** | **[COMPETITOR-SOLVED]** Cal aggregates subscriptions and standing orders across **all issuers and banks**, free. Build for completeness, never as a headline |
| Unused subscription detection | [BLOCKED: usage signal] | [RESEARCH] hard without usage data |
| Duplicate subscription detection | **[NEXT]** | two music services, two clouds |
| Banking fee analysis | [BLOCKED: Open Banking] | עמלות — often invisible to users |
| Telecom plan optimization | [BLOCKED: market rate data] | [RESEARCH] needs plan catalogue |
| Internet plan optimization | [BLOCKED: market rate data] | [RESEARCH] |
| Electricity plan optimization | [BLOCKED: market rate data] | [RESEARCH] |
| Insurance cost analysis | [BLOCKED: policy model] | **[REG]** |
| Bill negotiation opportunities | [BLOCKED: market rate data] | surface the opportunity, user acts |
| Price increase alerts | **[NEXT]** | recurring amount changed |

---

# DIFFERENTIATION

## Children and family planning

| Feature | Status | Notes |
|---|---|---|
| Child financial profiles | [BLOCKED: member types] | age, birth date, per-child data |
| Per-child savings goals | [BLOCKED: child profiles] | |
| **חיסכון לכל ילד tracking** | [BLOCKED: child profiles] | state program — deeply Israeli, high signal |
| Track selection guidance (deposit vs investment) | [BLOCKED: חיסכון model] | **[REG]** — information/simulation only |
| Parent contribution optimization | [BLOCKED: חיסכון model] | is the ₪57/month top-up worth it for this family |
| Projection to age 18 / 21 | [BLOCKED: חיסכון model] | deterministic compounding |
| Education goal planning | [BLOCKED: child profiles] | university cost modeling |
| First-car goal | [BLOCKED: child profiles] | |
| Housing / equity goal per child | [BLOCKED: child profiles] | |
| Bar/bat mitzvah expense planning | [BLOCKED: forward obligations] | large, predictable, dated |
| Teen financial education | [BLOCKED: member types] | teen-scoped app experience |
| Teen allowance management | [BLOCKED: member types] | |
| "Can we afford another child?" | [BLOCKED: what-if engine] | cost model by child age |

## Debt

| Feature | Status | Notes |
|---|---|---|
| Debt overview | [BLOCKED: debt model] | all liabilities in one place |
| Interest cost calculation | [BLOCKED: debt model] | true lifetime cost in shekels |
| Debt payoff planner | [BLOCKED: debt model] | |
| Avalanche simulation | [BLOCKED: debt model] | highest rate first |
| Snowball simulation | [BLOCKED: debt model] | smallest balance first |
| Avalanche vs snowball comparison | [BLOCKED: debt model] | show the real cost difference |
| Loan refinancing simulator | [BLOCKED: market rate data] | **[REG]** |
| Debt consolidation simulator | [BLOCKED: market rate data] | **[REG]** — often a trap; must show risks |
| Overdraft (מסגרת אשראי) analysis | [BLOCKED: Open Banking] | chronic overdraft is a major Israeli problem |
| Overdraft dependency scoring | [BLOCKED: Open Banking] | |
| Borrowing cost vs market benchmark | [BLOCKED: BoI rate data] | "you pay 11%, market is 7.5%" |

## Mortgage

| Feature | Status | Notes |
|---|---|---|
| Mortgage account modeling | [BLOCKED: mortgage model] | the single largest household liability |
| Multi-track support (מסלולים) | [BLOCKED: mortgage model] | prime, fixed, ק"צ, variable — Israeli mortgages are multi-track |
| Indexation handling (הצמדה למדד) | [BLOCKED: mortgage model] | CPI-linked tracks |
| Remaining principal tracking | [BLOCKED: mortgage model] | |
| Full repayment schedule (לוח סילוקין) | [BLOCKED: mortgage model] | deterministic amortization |
| Total future interest | [BLOCKED: mortgage model] | usually shocking and motivating |
| **Refinancing simulator (מיחזור)** | [BLOCKED: market rate data] | **[REG]** — potentially the highest-value feature in the product |
| Break-even analysis | [BLOCKED: refinance sim] | including early-repayment fees (עמלת פירעון מוקדם) |
| Partial prepayment simulator | [BLOCKED: mortgage model] | pay down vs invest |
| Scenario comparison | [BLOCKED: mortgage model] | side-by-side |
| Rate opportunity monitoring | [BLOCKED: BoI rate data] | proactive alert when refinancing becomes worthwhile |

## Israeli financial rights

> **Hard requirement:** this entire area must run on versioned, verified, sourced rules.
> An LLM must never determine eligibility. See [ARCHITECTURE.md](ARCHITECTURE.md#data-provenance-future).

| Feature | Status | Notes |
|---|---|---|
| **Eligibility engine** | [BLOCKED: rules corpus] | versioned rule sets, official sources |
| Tax credit points (נקודות זיכוי) | [BLOCKED: rules corpus] | **[REG]** |
| Tax refund detection (החזרי מס) | [BLOCKED: rules corpus] | **[REG]** — many Israelis are owed money |
| National Insurance benefits (ביטוח לאומי) | [BLOCKED: rules corpus] | **[REG]** |
| Child-related benefits | [BLOCKED: rules corpus] | |
| Municipal benefits (הנחות ארנונה) | [BLOCKED: rules corpus] | [RESEARCH] varies by municipality |
| Reserve duty rights (מילואים) | [BLOCKED: rules corpus] | highly relevant in Israel |
| Employment rights | [BLOCKED: rules corpus] | |
| Self-employed deductions | [BLOCKED: rules corpus] | **[REG]** |
| Government program matching | [BLOCKED: rules corpus] | |
| Rule version tracking | [BLOCKED: rules corpus] | rules change annually |

## Pension and insurance

| Feature | Status | Notes |
|---|---|---|
| Pension overview | [BLOCKED: pension data] | **[COMPETITOR-SOLVED]** — **[REG]**. FamilyBiz already does this well via the מסלקה, including minors' policies; Cover does it free with a WhatsApp agent |
| Management fee analysis | [BLOCKED: pension data] | **[REG]** — fees quietly destroy returns |
| Fee vs market comparison | [BLOCKED: market data] | **[REG]** |
| Projected retirement income | [BLOCKED: pension data] | **[REG]** — deterministic projection only |
| קרן השתלמות tracking | [BLOCKED: pension data] | **[REG]** |
| Insurance coverage overview | [BLOCKED: policy model] | **[REG]** |
| Duplicate insurance detection | [BLOCKED: policy model] | **[REG]** — very common, very costly |
| Coverage gap detection | [BLOCKED: policy model] | **[REG]** |
| Insurance cost benchmarking | [BLOCKED: market data] | **[REG]** |
| Mortgage life insurance check | [BLOCKED: policy model] | **[REG]** |

## Notifications and the WhatsApp assistant

| Feature | Status | Notes |
|---|---|---|
| In-app notification centre | **[NEXT]** | |
| Push notifications | **[MVP]** | budget thresholds only in MVP |
| Per-member notification preferences | **[NEXT]** | |
| Per-event notification rules | **[NEXT]** | every txn / above amount / shared only / etc. |
| Email notifications | **[NEXT]** | requires email provider |
| **WhatsApp transaction alerts** | [BLOCKED: server layer + WABA] | major differentiator in Israel |
| WhatsApp budget warnings | [BLOCKED: WABA] | |
| WhatsApp salary-received alert | [BLOCKED: WABA] | |
| WhatsApp unusual-charge alert | [BLOCKED: anomaly engine] | |
| WhatsApp interactive queries | [BLOCKED: WABA + AI layer] | "כמה נשאר לנו החודש?" |
| WhatsApp interactive actions | [BLOCKED: WABA + AI layer] | "תעביר את העסקה לקטגוריית בית" |
| Per-member WhatsApp opt-in | [BLOCKED: WABA] | explicit consent, revocable |

## The Action Engine

| Feature | Status | Notes |
|---|---|---|
| **Action Engine** | [BLOCKED: intelligence engines] | the "what should we do next" core |
| Ranked recommendations | [BLOCKED: action engine] | by expected impact |
| Expected financial impact per action | [BLOCKED: action engine] | in shekels, with a horizon |
| Confidence level per action | [BLOCKED: action engine] | |
| Stated assumptions per action | [BLOCKED: action engine] | |
| Risks and tradeoffs per action | [BLOCKED: action engine] | never optimize blindly |
| Data source attribution | [BLOCKED: provenance] | |
| Recommendation expiry | [BLOCKED: provenance] | market-rate advice goes stale |
| Action tracking | [BLOCKED: action engine] | did the household act? did it help? |
| Outcome measurement | [BLOCKED: action tracking] | closes the feedback loop |

---

# MOONSHOTS

| Feature | Status | Notes |
|---|---|---|
| **Household Financial Twin** | [BLOCKED: complete domain model] | see PRODUCT_VISION.md §7 |
| **What-if simulator** | [BLOCKED: Financial Twin] | fork the twin, apply change, diff outcomes |
| "What if we have another child?" | [BLOCKED: what-if] | |
| "What if salary drops 20%?" | [BLOCKED: what-if] | |
| "What if we buy a ₪180,000 car?" | [BLOCKED: what-if] | |
| "What if we move?" | [BLOCKED: what-if] | |
| "What if mortgage payments increase?" | [BLOCKED: what-if] | |
| "What if we invest ₪1,000/month more?" | [BLOCKED: what-if] | |
| "Can we afford a ₪25,000 vacation?" | [BLOCKED: what-if] | |
| Multi-decade life planning | [BLOCKED: Financial Twin] | |
| **AI Financial Coach** | [BLOCKED: intelligence engines] | conversational layer over deterministic results |
| Natural-language financial queries | [BLOCKED: AI layer] | AI parses intent → calls engine → explains result |
| Monthly AI narrative summaries | [BLOCKED: AI layer] | |
| Proactive AI insights | [BLOCKED: AI layer] | |
| Anomaly explanation | [BLOCKED: anomaly engine] | |
| Receipt understanding (OCR + parsing) | [BLOCKED: AI layer] | line-item extraction |
| Voice transaction entry (Hebrew) | [RESEARCH] | Hebrew STT quality uncertain |
| Automated benefit claim assistance | **[REG]** | filing on the household's behalf |
| Regulated product execution | **[REG]** | requires licensing or licensed partner |
| Marketplace / product comparison | **[REG]** | revenue model implications |
| Open Banking payment initiation | [BLOCKED: BoI write APIs] | **[REG]** |
| B2B2C via employers or banks | [RESEARCH] | distribution play |

---

## Cross-cutting dependency map

Reading this top to bottom shows why the ordering in the roadmap is what it is.

```
MVP (manual data)
   │
   ├─→ Historical self-comparison, savings rate, subscription detection
   │      (no new dependencies — cheap early wins)
   │
   └─→ Server layer  ─────────────────────────────┐
          │                                        │
          ├─→ Open Banking ──→ verified data       │
          │        │                               │
          │        ├─→ overdraft analysis          │
          │        ├─→ banking fee analysis        │
          │        └─→ merchant enrichment         │
          │                                        │
          ├─→ WhatsApp Business Platform ──────────┤
          │                                        │
          └─→ AI layer (explanation only) ─────────┤
                                                   │
   Verified data ──→ Deterministic engines ────────┤
          │              │                         │
          │              ├─→ cash-flow engine ──→ Safe-to-Spend
          │              ├─→ debt model      ──→ payoff planners
          │              ├─→ mortgage model  ──→ refinance simulator
          │              ├─→ benchmark engine ──→ "is this reasonable?"
          │              ├─→ health engine   ──→ Financial Health Score
          │              └─→ rules corpus    ──→ eligibility engine
          │                        │
          │                        └─→ Action Engine ──→ ranked recommendations
          │                                   │
          └─→ complete domain model ──→ Financial Twin ──→ What-if simulator
```

## Discovered by market research (9 Aug 2026)

Candidates surfaced by competitive and pain-point research that were not in the original registry.
**None are MVP.** Each records the user problem and why existing products fail at it.
Evidence: [USER_PAIN_POINTS.md](USER_PAIN_POINTS.md) · [OUR_ADVANTAGES.md](OUR_ADVANTAGES.md)

| Feature | User problem | Why existing products fail | Phase | Regulatory |
|---|---|---|---|---|
| **Rule provenance — "why was this categorised here?"** | A wrong category is fixed row by row, forever | **Copilot has the market's best categoriser and will not show you your own rules.** Every Israeli product is Weak/Absent on editable rules | POST-MVP | None |
| **Multi-condition rules (amount, timing, context)** | One merchant legitimately maps to different categories | FamilyBiz's documented structural limit is **one merchant → one category**; users ask for this explicitly | POST-MVP | None |
| **Bulk transaction editing** | Re-categorising a month takes hours | **MyFinanda's #1 request**; FamilyBiz's #1 complaint | POST-MVP | None |
| **Installment (תשלומים) as a first-class object** | One purchase becomes N transactions; forecasts miss the committed liability | **No product anywhere has this primitive** | INTELLIGENCE | None |
| **Card charge-date projection** | Household looks solvent all month, overdrawn on charge day | International products assume transactions hit the account when they occur | INTELLIGENCE | None |
| **Overdraft as a modelled state, not an alert** | For many Israeli households מינוס is the steady state, not an exception | No international product models chronic overdraft; only One Zero predicts entering it | INTELLIGENCE | None |
| **Forecast calibration and change-explanation** | A forecast that silently moves is one users stop trusting | **Nobody publishes accuracy, confidence intervals, or why the forecast changed** | INTELLIGENCE | None |
| **Irregular / variable income budgeting** | Mixed salaried + עצמאי households; commission and reserve-duty income | **Every budgeting model researched assumes a monthly salary.** RiseUp explicitly excludes self-employed cash flow | INTELLIGENCE | None |
| **Proportional-income expense splitting** | "She earns 60%, so she pays 60% of shared costs" | The most-requested real couples mechanic, **automated by no product found.** People use spreadsheets | POST-MVP | None |
| **Shared goals with tracked individual contributions** | "How much of this deposit did each of us put in?" | Goals are common; contribution attribution is tracked by nobody | POST-MVP | None |
| **Household separation / data forking** | Relationships end; joint financial history has no exit path | **No mainstream product has a flow to fork shared data back into two clean accounts** | POST-MVP | Possible |
| **Partner-lite mode** | One partner runs the money; the other wants a monthly summary, not homework | Every product assumes symmetric engagement | POST-MVP | None |
| **Data-loss-free migration to Open Banking** | A four-year MyFinanda user lost **all** categorisation history on migration | The law requires deleting *data*, not the *categorisation skeleton* — a self-inflicted wound worth never repeating | OPEN BANKING | None |
| **Duplicate insurance detection** | Households pay twice for the same cover | FamilyBiz automates it; RiseUp detects it. **Parity, not differentiation** | FIN. OPT. | Yes |
| **Annual irregular expense planning** | Holidays, arnona, school costs wreck monthly budgets | Monthly budgeting models handle it poorly everywhere | INTELLIGENCE | None |
| **Reserve-duty (מילואים) income disruption** | Income shocks with statutory compensation | [UNKNOWN] — not researched; FamilyBiz's reservist pricing implies the segment is recognised commercially | FIN. OPT. | Yes |

---

## Explicitly rejected (for now)

Recording these so they are not re-proposed:

| Feature | Why not |
|---|---|
| Splitwise-style external bill splitting | Different product, different social graph |
| Crypto portfolio tracking | Low overlap with the target household |
| Stock trading / brokerage | Heavily regulated, not the mission |
| Business / company accounting | Different product entirely |
| Credit score monitoring | [RESEARCH] Israeli credit data access unclear |
| Social features / spending comparison with friends | Encourages harmful behavior |
| Streaks and gamified saving pressure | Can push households into bad decisions — see PRODUCT_VISION.md §5.4 |
| **Cross-bank aggregation as a headline feature** | **Cal, FIBI MultiBank and Leumi all do it free.** Requires an ISA licence and beats nobody — [OUR_ADVANTAGES.md](OUR_ADVANTAGES.md#what-not-to-build) |
| **Subscription cancellation concierge** | Rocket Money's model takes 35–60% of first-year savings and generates its worst complaints; conflicts with [ADR-025](DECISIONS.md#adr-025) |
| **Shared-wallet / who-owes-whom mechanics** | **PayBox has by far the most developed shared-money architecture in Israel**; Bit has 4.9M active devices |
| **US-style snowball/avalanche debt payoff** | Built on revolving card debt — **not the dominant Israeli debt shape.** Would solve a problem Israeli households largely do not have |
| **Any deposit product or neobank** | Couples-finance-as-neobank **failed economically twice** — Ivella and Zeta both died with good feature fit |
