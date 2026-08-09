# User Pain Points

**Research date: 9 August 2026.** Derived from App Store and Google Play review corpora (Israeli
storefront where Israeli), vendor community forums, public feature-request boards, press coverage and
regulator actions. See [MARKET_RESEARCH.md](MARKET_RESEARCH.md) for methodology.

> **The most important caveat in this document.** Everything here is derived from **written reviews
> and product documentation**, not from talking to users. Reddit was blocked to automated access, and
> the real Israeli corpus — RiseUp's claimed 100,000-member Facebook community, FamilyBiz's, and
> החיים בפלוס's — requires human access. **In particular, nothing here is direct evidence of how
> Israeli couples actually divide money.** Treat frequency estimates as ordinal, not statistical.

## Scoring

**Frequency** — how often the complaint appears across corpora.
**Severity** — how much damage it does when it occurs (abandonment, wrong decisions, financial harm).
**Differentiation opportunity** — how much advantage solving it confers, factoring in how many
competitors already solve it.

| | Meaning |
|---|---|
| ●●● | High |
| ●●○ | Medium |
| ●○○ | Low |

---

## Tier 1 — High frequency, high severity, high opportunity

These are where the product is won or lost.

### P1. Categorisation is wrong, and fixing it is manual drudgery
**Frequency ●●● · Severity ●●● · Opportunity ●●●**

The single most-complained-about dimension in the Israeli market and a top complaint internationally.

- FamilyBiz's **#1 complaint**: *"עבודה של שעות כל חודש"* (Play, 31 Jul 2026); a paying premium user,
  *"במקום לעזור לי בהתנהלות אני מרגיש שאני עובד אצל האפליקציה"* (18 Apr 2026). **[VERIFIED]**
- MyFinanda's **#1 request**: custom categories and **bulk/multi-transaction editing**. **[VERIFIED]**
- Rocket Money: documented accuracy complaints (restaurants→groceries, gas→shopping). **[VERIFIED]**
- No issuer app is praised for categorisation. FIBI's own copy hedges it as
  *"לפי מיטב יכולת הזיהוי של הבנק"*. **[VERIFIED]**

**The specific unmet need, stated repeatedly:** *"שלא מכניסים בינה מלאכותית לדוגמה בהבחנה בין תשלומים
בקטגוריות שונות למרות שמדובר באותו בית עסק"* — **one merchant must be able to map to different
categories** based on amount, timing or context. FamilyBiz's structural weakness is precisely that
**one merchant → one category, with no amount- or timing-based splitting and no bulk edit.**
**[VERIFIED]**

**Why this is a real opportunity, not just table stakes:** Copilot solved accuracy with a private
per-user ML model (~93–94% first-pass, 95%+ after months) — **and still cannot let you view or edit
your own rules in-app; you must email support.** **[VERIFIED]** That is the state of the art. Nobody
anywhere has solved *"the machine got it wrong — show me why, and let me fix the reason, not just the
row."*

**Israeli difficulty multiplier:** Israeli transaction descriptors are short, abbreviated,
inconsistent Hebrew strings in RTL, with **no merchant-enrichment layer equivalent to Plaid's**.
Cold-start is far worse here. **[INFERENCE, high confidence]**

---

### P2. Couples cannot get transparency on shared money and privacy on personal money
**Frequency ●●● · Severity ●●● · Opportunity ●●●**

Products are binary: full transparency or full separation. Almost nothing sits in the middle.

| Product | Failure |
|---|---|
| **Monarch** | **No way to hide an account or transaction from a partner.** Shared Views organizes visibility; it does not restrict it **[LIKELY]** |
| **MyFinanda** | Recommends **one shared login** — and explicitly admits it is inadequate: *"אנחנו מתכננים לשפר… בגרסה עתידית"* **[VERIFIED verbatim]** |
| **Rocket Money** | All-or-nothing; the secondary user is denied their credit score **[VERIFIED]** |
| **Lunch Money** | All-or-nothing within an account; privacy requires running separate accounts, defeating the shared view |
| **Simplifi** | Hard-capped at **exactly one** other person |
| **Copilot** | Sharing is a shared password; **no Android at all**, so mixed-device couples are excluded outright |
| **RiseUp** | Mechanism **[UNKNOWN]** and unverifiable from outside |

The two products that solved this best — **Ivella** (Personal / Split / Joint + Savings Pods) and
**Zeta** — are both **dead**, with no successor. **Honeydue** still has the most granular control
found anywhere (a three-way per-account toggle: share everything / balance only / hidden) and its
support has *"gone completely dark."* **[VERIFIED]**

**Real-world cases nobody designs for:** saving for a gift; managing a private inheritance; and — the
case nobody markets to — quietly building an exit fund from a controlling relationship.

---

### P3. Nobody tells you what will happen, only what happened
**Frequency ●●● · Severity ●●● · Opportunity ●●●**

- Across all eight Israeli banks, **no bank offers safe-to-spend, projected balance, or תחזית תזרים.**
  The best that exists is Pepper's *scheduled* future transactions and One Zero's predictive overdraft
  alert. **[VERIFIED]**
- **RiseUp is essentially alone** with a weekly "how much is left to spend" — and shows **only the
  current month.** A reviewer reports RiseUp's answer to a request for longer horizon was "there's
  enough data." **[VERIFIED]**
- FamilyBiz surfaces a month-end projection formula and **paywalls the view.**
- Internationally: **Copilot has no forecasting at all** (it is an open feature request on their own
  board); **YNAB has none**; Simplifi's Projected Cash Flow at 30/90/365 days is the best in the
  cohort. **[VERIFIED]**

**And where forecasts exist, they are uncalibrated and unexplained.** Neither Simplifi nor Monarch
publishes accuracy, offers confidence intervals, or explains why the forecast changed since last
week. **A forecast that silently moves is a forecast users learn to ignore.** **[INFERENCE]**

---

### P4. Israeli financial reality is not modelled by any product
**Frequency ●●● · Severity ●●● · Opportunity ●●●**

This is the pain point users cannot articulate because they have never seen it solved.

| Reality | Status |
|---|---|
| **Installments (תשלומים)** — one purchase generates N future transactions | **No product anywhere has this primitive [INFERENCE, high confidence].** Categorisation sees N rows; forecasts miss a committed liability; budgets cannot decide when to book it |
| **Aggregated monthly card charge** | Safe-to-spend must project the *future consolidated charge* against the bank balance. Rocket Money and Simplifi both assume transactions hit the account when they occur **[INFERENCE]** |
| **Overdraft (מסגרת אשראי)** as a normalized structural object | **No international product models chronic overdraft as first-class.** Only One Zero detects impending overdraft — including at other banks **[VERIFIED]** |
| **Multi-track CPI-linked mortgage** with per-track early-repayment penalties | Sprive (UK) is the only mortgage product that *acts*, and it solves an easier single-rate version **[VERIFIED]** |
| **קרן השתלמות**, CPI linkage throughout | No foreign equivalent; unmodellable by any international product even in principle |
| **חיסכון לכל ילד** | **Zero third-party tooling anywhere [VERIFIED by absence]** — only blog posts |
| **bit / PayBox fragmentation** | The indie app Sakem Li treats them as first-class filterable payment methods; no aggregator sees the whole picture **[VERIFIED]** |

**The consequence: a naive port of any Western PFM produces wrong numbers in Israel.**

---

### P5. Bank connections break, opaquely and repeatedly
**Frequency ●●● · Severity ●●● · Opportunity ●●○**

**The number one complaint theme in every single product's reviews, in every market.** **[VERIFIED
across all products]** — Monarch (Canada), YNAB (re-auth), Simplifi (disconnections), Quicken
(Android sync, data loss), Honeydue (stale data), RiseUp (*connections fail opaquely and need
re-linking every few months*), FamilyBiz (stale data for 8+ days).

Nobody has solved it, and the aggregators are the shared point of failure. Opportunity is rated only
medium because much of the cause sits outside any app's control — **but the *handling* is entirely
within our control**, and nobody handles it well: no clear status, no explanation, no graceful
degradation.

**The Israeli-specific compounding hazard [VERIFIED]:** consent lapse legally forces data deletion.
MyFinanda destroyed a four-year paying customer's entire categorisation history because of it:
*"אובדן מוחלט של כל הנתונים שלי! כל הסיווגים והנתונים שבניתי במשך שנים נמחקו."* Finanda blamed the
law. **The user's rebuttal is the insight: the law requires deleting *data*, not the *categorisation
skeleton*.** Preserving the user's rules and category structure across consent renewals is an
obvious, currently-unmet requirement.

---

## Tier 2 — High frequency, moderate severity

### P6. Manual entry and cash are second-class or absent
**Frequency ●●● · Severity ●●○ · Opportunity ●●●**

- **RiseUp refuses cash entirely** and is punished for it: *"I could fill in Excel for free."*
  **[VERIFIED]**
- MyFinanda limits manual entry to a cash wallet; users say *"הרסתם הכל"*. **[VERIFIED]**
- FamilyBiz and Sakem Li make manual entry central and are **rewarded** for it. **[VERIFIED]**

**There is no product that does automated aggregation *well* and manual/cash *well*.** Given that
open banking covers only ~4% of the Israeli market, a product that treats manual entry as a
first-class citizen rather than a fallback has a much larger addressable audience than one that does
not.

---

### P7. The app is built around selling, not around your money
**Frequency ●●● · Severity ●●○ · Opportunity ●●●**

Actively destroying incumbent ratings at Cal, Bit, PayBox, MAX and One Zero. **[VERIFIED]**

- Cal: *"you can't see the app for all the ads"*
- MAX: *"the whole app is built around selling — where's the info about my transactions?"*; opening
  the savings tab triggers sales calls the next day
- Bit: *"3 to 5 popups, usually mid-operation"*
- One Zero: *"מרגיש כאילו הורדתי משחק לטלפון ולא חשבון בנק"*
- PayBox: relentless ad and notification-permission nags

**Opportunity is high because this is free to not do**, and because it directly supports the trust
positioning in [TRUST_AND_PRIVACY.md](TRUST_AND_PRIVACY.md).

---

### P8. Basic app hygiene is missing almost everywhere
**Frequency ●●● · Severity ●●○ · Opportunity ●●○**

Universal unmet asks across nearly every Israeli app examined **[VERIFIED]**:

| Missing | Notes |
|---|---|
| **English localisation** | The single most-repeated request at One Zero (~7 of 45 recent iOS reviews, several from olim). RiseUp's listing **claims English and does not have it** — ~50% of its negative iOS reviews |
| **Dark mode** | Isracard users frame it as an **accessibility** issue. Pepper shipped it; Leumi's own app still has not |
| **Home-screen widgets** | Top request at RiseUp and Isracard (*"I've been writing this here for months"*) |
| **iPad / tablet layouts** | Absent nearly everywhere |
| **Persistent biometric enrolment** | **The defining defect of Israeli finance apps.** Isracard worst (*"I've done it 8 times in 3 days"*), MAX close behind, **RiseUp has no biometric login at all** |
| **OTP fallback** | SMS-only nearly everywhere — *"stuck abroad, can't get in for a month"* (MAX) |
| **Breakage after redesigns and forced updates** | Universal complaint; Pepper and One Zero both criticised for weekly forced updates |

---

### P9. Advice without action
**Frequency ●●○ · Severity ●●● · Opportunity ●●●**

Almost every product tells you things. Only **Rocket Money** (cancels subscriptions) and **Sprive**
(moves money onto your mortgage) actually *do* things — and **Rocket Money's execution is the single
largest source of its complaints.** **[VERIFIED]**

The gap between *"your electricity bill went up 30%"* and *"here is the switch, tap to execute"* is
unclosed almost everywhere. In Israel it is entirely unclosed: **there is no Israeli Rocket Money,
and no dedicated subscription-cancellation or bill-renegotiation service exists at all.**
**[VERIFIED-negative]**

Switchy is the one adjacent player, and notably it gets data in by **having the user photograph their
bill** rather than via open banking. **[VERIFIED]**

---

### P10. Subscription detection is a promise, not a product
**Frequency ●●○ · Severity ●●○ · Opportunity ●●○**

Duplicate-charge detection is everywhere in Israel (Leumi חכם, Hapoalim דן, Discount תובנות, One
Zero, RiseUp, MAX's 2023 promise). **Actual subscription identification exists in exactly two
places**: **Cal** (cross-issuer, verified live and genuinely impressive) and **One Zero**
(price-increase detection on its own cards). **[VERIFIED]**

Hapoalim's UP control comes close but the T&C reveal **the bank chooses which recurring payments are
monitored, not the user** — which materially undercuts it. **[VERIFIED]**

Opportunity is only medium **because Cal already does the hard part well**, for free, across all
issuers and banks. See "what not to build" in [OUR_ADVANTAGES.md](OUR_ADVANTAGES.md).

---

## Tier 3 — Lower frequency, high severity when hit

### P11. Self-employed and variable-income households are abandoned
**Frequency ●●○ · Severity ●●● · Opportunity ●●●**

**RiseUp excludes them explicitly [VERIFIED]** — it requires separated business/personal accounts and
"a fixed monthly income of similar amounts."

Internationally the same: **every budgeting model researched — zero-based, envelope, Spending Plan,
Flex — assumes a monthly salary arriving on a schedule.** YNAB users specifically complain about the
rigid calendar-month framing when not paid monthly. **[INFERENCE, strongly supported]**

The **mixed household** (one salaried partner, one עצמאי) is common in Israel and served by nobody
well.

---

### P12. Debt gets no optimisation anywhere
**Frequency ●●○ · Severity ●●● · Opportunity ●●●**

**No Israeli product has any debt tooling at all.** **[VERIFIED by absence across the matrix]**

Internationally, everything is **snowball or avalanche as a fixed heuristic**. No product describes
an objective function, a solver, or first-class handling of promotional APR cliffs, balance-transfer
fee economics, or tax-deductible interest. The "AI debt" apps wrap the same two primitives in chat.
**[LIKELY, based on targeted absence across every product checked]**

And the international primitives are **the wrong shape for Israel** anyway — they assume revolving
card debt. Israeli debt is bank loans, credit-company loans, and the overdraft.

---

### P13. Financial rights, tax and benefits are a product blank
**Frequency ●○○ (as a *complaint*) · Severity ●●● · Opportunity ●●●**

Low complaint frequency because **users do not know to ask for it** — you cannot complain about a
benefit you never knew existed.

- Across every Israeli bank, the phrase **מיצוי זכויות appears exactly once** — inside FIBI's human
  retirement advisory for הגיל השלישי. **[VERIFIED]**
- Across every Israeli PFM app, tax refunds and rights are handled purely as **commissioned
  referrals**, never as product. **[VERIFIED]**
- The government runs the infrastructure (הר הכסף, הר הביטוח, כל זכות, the CMA calculators, a **free
  online tax simulator and fully-online Form 135**) and **nobody has built a decent consumer layer on
  top of any of it.** **[VERIFIED]**

Meanwhile commercial intermediaries charge **15–25% of the refund plus VAT** for access to a free
government service, with a worked example of **₪6,040 on a ₪32,000 refund**. **[VERIFIED]**

---

### P14. Nobody plans for a family over years
**Frequency ●○○ · Severity ●●● · Opportunity ●●●**

**Verified gap in both markets.** The deep planners (ProjectionLab, MaxiFi, cFIREsim, OnTrajectory)
are **manual-assumption tools by design** — ProjectionLab markets the *absence* of bank linking as a
privacy feature and users praise it for that. Boldin links accounts but **captures balances only, not
transactions**, and says so explicitly. **[VERIFIED]**

> **Nobody anywhere answers "what actually happens to my spending if we have a baby / take parental
> leave / move cities / go part-time," starting from what you actually spend.** **[VERIFIED gap]**

Israeli-specific instances nobody touches: bar/bat mitzvah planning, army send-off, חיסכון לכל ילד
projections to 18 and 21, and the cost trajectory of a second or third child.

---

### P15. Failure modes nobody designs for
**Frequency ●○○ · Severity ●●● · Opportunity ●●○**

- **Breakup / divorce.** **No mainstream product has a flow to fork shared financial history back
  into two clean individual accounts.** Every couples app accumulates joint data with no exit path.
  **[VERIFIED gap]** Onward addresses post-separation co-parenting expenses only. PayBox is the only
  Israeli product that even names *"גרושים עם ילדים משותפים"* as a use case.
- **Asymmetric engagement.** Every product assumes both partners participate. **The overwhelmingly
  common real pattern — one partner runs the money, the other wants a monthly summary and no homework
  — is designed for by nobody.** There is no "partner-lite" mode. **[VERIFIED gap]**
- **Onboarding collision.** FamilyBiz: if the invitee already has an account they **cannot** be added
  — the existing account must be deleted first. A real, common failure mode for couples who each tried
  the app separately. **[VERIFIED]**

---

### P16. Trust and pricing grievances
**Frequency ●●○ · Severity ●●○ · Opportunity ●●●**

| Grievance | Evidence |
|---|---|
| **Paywalling previously-free features** | FamilyBiz, accelerating and recent: *"בתקופה האחרונה הם סגרו בתשלום פיצ'רים חיוניים שהיו חינמיים"* (2 Aug 2026) **[VERIFIED]** |
| **Cannot cancel your own subscription** | Rocket Money's **most-repeated complaint** is account lockouts preventing users cancelling Premium. **Cleo settled with the FTC for $17M** over, among other things, an illegal subscription trap **[VERIFIED]** |
| **Undisclosed conflicts** | RiseUp's savings page calls Meitav a *"שותף טכנולוגי"* while the terms disclose RiseUp is paid by them. Vouchers and mortgage pages disclose nothing **[VERIFIED]** |
| **Marketing/legal contradiction** | FamilyBiz marketing says data never leaves; its own terms say the opposite, and Play data-safety confirms the harder version **[VERIFIED]** |
| **Billing disputes** | FamilyBiz: unauthorised premium charges; a 50%-only refund after next-day cancellation **[VERIFIED]** |
| **Predatory lookalikes** | itur-**mof.org.il** posing as the government's הר הכסף; FundBack serving stock fake-person testimonial photos with placeholder trust counters **[VERIFIED]** |

---

## Summary — ranked by opportunity

| Rank | Pain point | Freq | Sev | Opp | Why it ranks here |
|---|---|---|---|---|---|
| 1 | **P4** Israeli financial reality unmodelled | ●●● | ●●● | ●●● | Correctness, not a feature. Nobody has the primitives |
| 2 | **P2** Couples transparency vs privacy | ●●● | ●●● | ●●● | The best two solutions died; survivors are binary |
| 3 | **P1** Categorisation and unfixable rules | ●●● | ●●● | ●●● | #1 complaint; state of the art still can't show its reasoning |
| 4 | **P3** No forward view | ●●● | ●●● | ●●● | Almost absent in Israel; uncalibrated where it exists |
| 5 | **P14** Long-horizon family planning | ●○○ | ●●● | ●●● | Verified global gap; nobody grounds simulation in real spending |
| 6 | **P13** Rights, tax and benefits | ●○○ | ●●● | ●●● | Free government infrastructure, no consumer layer, 15–25% intermediaries |
| 7 | **P12** Debt optimisation | ●●○ | ●●● | ●●● | Zero Israeli tooling; international primitives are the wrong shape |
| 8 | **P6** Manual and cash as second-class | ●●● | ●●○ | ●●● | Open banking is only ~4% of the market |
| 9 | **P9** Advice without action | ●●○ | ●●● | ●●● | Entirely unclosed in Israel |
| 10 | **P11** Self-employed / variable income | ●●○ | ●●● | ●●● | Explicitly abandoned by the category leader |
| 11 | **P7** Built around selling | ●●● | ●●○ | ●●● | Free to not do; directly supports trust positioning |
| 12 | **P16** Trust and pricing grievances | ●●○ | ●●○ | ●●● | Competitors are actively creating this opening |
| 13 | **P5** Connections break | ●●● | ●●● | ●●○ | Cause is largely external; *handling* is ours |
| 14 | **P15** Breakup, asymmetry, onboarding collision | ●○○ | ●●● | ●●○ | Genuinely novel, but narrow |
| 15 | **P8** App hygiene | ●●● | ●●○ | ●●○ | Table stakes, not differentiation — but omitting it is fatal |
| 16 | **P10** Subscription detection | ●●○ | ●●○ | ●●○ | **Cal already does the hard part well, for free** |

**What this ranking says about the MVP:** items 3, 8, 11, 15 and parts of 1 are addressable with
manual data and no engines — which is exactly the MVP as scoped. Items 5, 6, 7, 9, 10 require
verified data, engines, or both. See [OUR_ADVANTAGES.md](OUR_ADVANTAGES.md) for the sequencing.
