# OurMoney — Product Vision

> **OurMoney is the Financial Operating System for Israeli households.**

This document describes the long-term product. It is deliberately larger than the MVP.
Its purpose is to make sure the domain model, architectural boundaries, and product language
chosen today do not have to be torn down later.

**Nothing in this document is MVP scope.** For what is actually being built first, see
[ROADMAP.md](../ROADMAP.md) and [PHASE_1_PLAN.md](PHASE_1_PLAN.md).

---

## 1. The Shift

Almost every budgeting app answers one question:

> "Where did our money go?"

That question is backward-looking, low-value, and — once a user has seen the answer two or three
times — boring. Retention in this category collapses because the product's job ends the moment
the chart is rendered.

OurMoney's thesis is that the valuable question is forward-looking:

> "Given everything true about this household, what should we do next?"

A household does not want a pie chart. It wants to know whether it can afford a second child,
whether its mortgage is costing more than it should, whether it is one broken car away from
overdraft, and what the single highest-impact thing it could change this month is.

Answering that requires the product to understand the household — not just its transactions.

---

## 2. What "Financial Operating System" Means

An operating system does three things: it holds a model of the machine's state, it exposes that
state coherently, and it schedules what happens next.

OurMoney should eventually do the same for a household's finances.

| OS concept | OurMoney equivalent |
|---|---|
| System state | A complete, verified model of the household's financial position |
| Device drivers | Open Banking connections, credit cards, pension/insurance data, CSV import |
| Scheduler | The Action Engine — what should this household do next, in what order |
| Notifications | Event-driven alerts across in-app, push, WhatsApp, email |
| Applications | Budgets, goals, simulators, planners, optimizers |
| Permissions | Household member roles and visibility levels |

The critical word is **state**. Most budgeting apps store a transaction log. An operating system
stores a model. The difference is what makes intelligence possible.

---

## 3. What the Product Must Eventually Understand

To answer forward-looking questions, the system needs a far richer model of the household than
"a list of transactions."

### Household composition
- Number of adults and their relationship to each other
- Number of children, their ages, their birth dates
- Dependents beyond children (supported parents, etc.)
- Employment status per adult (salaried, self-employed, mixed, unemployed, student, reserve duty)
- Geographic region and housing situation (rent, own, live with family)
- Vehicle ownership

### Income
- Monthly net household income
- Income per earner
- Income stability and variance (a salaried engineer and a freelance designer have different risk)
- Non-salary income: rental, dividends, allowances, benefits
- Expected future income changes (maternity leave, planned job change, expected raise)

### Outflows
- Fixed expenses (rent/mortgage, utilities, insurance, tuition, loan payments)
- Recurring subscriptions and bills
- Discretionary spending
- Annual and irregular obligations (arnona, insurance renewals, car test, school fees, holidays)

### Balance sheet
- Assets: property, vehicles, cash, investments, crypto
- Liabilities: mortgage, loans, credit card balances, overdraft (מסגרת אשראי), family debt
- Net worth and its trajectory over time

### Long-horizon instruments
- Mortgage: tracks (מסלולים), remaining principal, rates, indexation (הצמדה), repayment schedule
- Pension funds (קרן פנסיה), study funds (קרן השתלמות), provident funds (קופת גמל)
- Management fees on each
- Insurance policies: life, health, disability, mortgage life, home, vehicle
- Investment accounts

### Children
- Per-child financial profile
- חיסכון לכל ילד (the state Savings for Every Child program) — account, track, balance
- Parent supplementary contributions
- Education savings
- Projections to ages 18 and 21

### Forward obligations
- Known future expenses with dates (bar/bat mitzvah, army send-off, university, wedding)
- Planned purchases (car, apartment, renovation)
- Financial goals with target amounts and dates

### Rights and entitlements
- Tax credit points (נקודות זיכוי) and the household's actual entitlement
- Eligible tax refunds (החזרי מס)
- National Insurance (ביטוח לאומי) benefits the household may qualify for
- Municipal benefits (הנחות בארנונה)
- Reserve duty (מילואים) related rights
- Employment-related rights
- Self-employed deductions and benefits

---

## 4. The Questions OurMoney Should Eventually Answer

These are the product's north star. Each one is a concrete, answerable question — not a vague
aspiration — and each requires deterministic computation over verified data.

### Spending and cash flow
- What can this household **safely** spend this month, after all committed obligations?
- What should this household be saving, given its income and composition?
- Are these expenses appropriate relative to household size, ages, and income?
- Which expenses should be reduced first, ranked by impact and by ease?
- Which subscriptions are unused or duplicated?
- Are we paying unnecessary bank fees, card fees, or account fees?

### Resilience
- Is this household financially resilient?
- How many months could it survive if the primary income stopped?
- Is it dependent on overdraft to get through the month?
- What is the emergency fund target for *this specific* household, and how far away is it?

### Debt and mortgage
- What is the true cost of the household's debt, in shekels, over its remaining life?
- Which debt should be paid off first, and why?
- Would consolidating debt actually help, or just extend it?
- Could refinancing the mortgage (מיחזור משכנתא) materially improve the household's position?
- What is the break-even point on refinancing, including fees?
- Would a partial prepayment (פירעון חלקי) be better than investing the same money?

### Children
- How much should this household save per child, and by when?
- What will the חיסכון לכל ילד account be worth at 18 and 21 under current settings?
- Is the current track (deposit vs. investment) appropriate for this child's age?
- Is a parent contribution top-up worth it for this family?

### Life decisions
- Can this household afford another child?
- Can it afford a ₪180,000 car — and what does that do to everything else?
- Can it afford a ₪25,000 vacation this year?
- Can it afford to buy a home, and at what price point?
- What happens if one salary drops by 20%?

### Rights
- What tax benefits is this household likely entitled to but not claiming?
- Is there a probable tax refund waiting?
- Are there National Insurance or municipal benefits being missed?

### Trajectory
- How can this household improve its position over the next month?
- Over the next year?
- Over the next decade?

---

## 5. Product Principles

### 5.1 Deterministic first, AI second

Every number the product states must come from a deterministic engine operating on verified data.
AI explains, translates, converses, and surfaces — but never computes a financial figure.

This is not a stylistic preference. A budgeting app that hallucinates a mortgage number, a tax
entitlement, or a benefit eligibility does real financial harm to a real family. See
[ARCHITECTURE.md](ARCHITECTURE.md#deterministic-financial-intelligence-vs-ai) for the enforced boundary.

### 5.2 Every recommendation is explainable

No black-box scores. If the financial health score moves from 74 to 78, the household sees exactly
which four things contributed and by how much. If the product recommends refinancing, it shows the
assumptions, the arithmetic, the fees included, and the break-even point.

### 5.3 Benchmarks are ranges, never verdicts

The product must never say "a family of four should spend ₪X on food." Households differ by region,
dietary needs, children's ages, health, and a hundred things the product cannot see. Benchmarks are
presented as contextual ranges with explicit caveats, and personal circumstances always override the
generic figure.

### 5.4 Advice must not be harmful

Gamification that pushes a household to skip a necessary medical expense to protect a streak is a
product failure. The Action Engine must weigh tradeoffs and risks, not just optimize a number.

### 5.5 Israeli-specific by design

Generic international budgeting apps fail Israeli households because they do not model
חיסכון לכל ילד, מסגרת אשראי, מילואים, ארנונה, קרן השתלמות, מדד-linked mortgages, or נקודות זיכוי.
This specificity is the moat.

### 5.6 The household, not the individual

Financial decisions in a family are made jointly and imperfectly. The product should reduce friction
between partners, not create it. Shared visibility, shared goals, and a shared picture — with the
ability to keep some things personal.

---

## 6. Household Composition and Permissions (Future)

The MVP treats every household member as an equal adult with full visibility. That is correct for a
two-partner household and wrong for everything else.

The long-term model must support:

| Member type | Typical visibility |
|---|---|
| `adult_partner` | Full household financial visibility |
| `adult_member` | Configurable — e.g. a supported parent living in the household |
| `teen` | Own allowance, own savings goal, own spending. Not parents' income or net worth. |
| `child` | Read-only view of their own savings goal, possibly gamified |
| `dependent` | No app access; exists in the model for planning purposes only |
| `advisor` | Time-limited, revocable, read-only access for an accountant or planner |

Key design implication for today: **do not assume two members, and do not assume all members see
everything.** The `household_members` table already supports N members with a `role` column. The
future permission model extends `role` into a richer `member_type` plus a visibility policy — an
additive migration, not a rewrite.

The MVP explicitly does not implement this. It only avoids foreclosing it.

---

## 7. The Household Financial Twin (Long-Term Concept)

The eventual endpoint of the data model is what we call the **Household Financial Twin**: a complete,
queryable, simulatable representation of the household's financial state.

The Twin is not a feature. It is what the accumulated domain model becomes once it is complete enough
to answer counterfactuals.

Once a household has a Twin, the product can answer:

> "What if we have another child in two years, and one of us takes six months of unpaid leave,
> and we also want to replace the car?"

by forking the Twin, applying the changes, running the deterministic engines forward, and diffing
the outcomes. Cash flow, savings trajectory, emergency fund coverage, debt service ratio, and
financial health score all recompute.

This is the difference between a budgeting app and a financial operating system.

**The Twin is explicitly out of scope for MVP and for several phases after it.** It is documented here
because the incremental decisions that make it possible — modeling household composition properly,
storing money as integers, keeping the financial engine deterministic and separate from AI, versioning
external rule data — all have to be made early or not at all.

---

## 8. Regulatory Reality

Some of the capabilities described here touch Israeli regulated activity. Investment advice,
insurance advice, pension advice, and credit brokering are licensed activities under Israeli law.

The product architecture must therefore keep four things separable:

1. **Information** — "Your mortgage rate is 5.2%. The current market average for this track is 4.6%."
2. **Simulation** — "If you refinanced at 4.6%, here is the arithmetic."
3. **Personalized recommendation** — "You should refinance." ← may require licensing
4. **Regulated execution** — actually initiating or brokering the product. ← definitely requires licensing

Levels 1 and 2 are defensible for a software product. Levels 3 and 4 require legal review before
they ship, and possibly a licensed partner or a licensed entity.

See [ARCHITECTURE.md](ARCHITECTURE.md#regulatory-separation-future) for how these are kept architecturally distinct,
and [DECISIONS.md](DECISIONS.md) for the recorded decision.

**MVP implements none of these levels.**

---

## 9. What This Vision Does NOT Change About the MVP

To be explicit, because vision documents have a habit of leaking into sprints:

The MVP remains exactly what was approved: manual accounts, manual transactions, categories, rules,
monthly budgets, CSV import, recurring expenses, savings goals, basic analytics, Hebrew RTL, dark mode,
secure auth, and RLS.

This document changes **zero lines of MVP scope**. It changes only:
- how we name things
- where we draw module boundaries
- which future doors we take care not to close

If a proposed MVP task cannot be traced to the approved MVP feature list, it is out of scope
regardless of how well it serves this vision.
