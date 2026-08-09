# Our Advantages — Where OurMoney Can Win

**Research date:** 9 August 2026
**Question this answers:** *What can OurMoney become that users cannot currently get from one
product?*

Sources: [COMPETITOR_ANALYSIS.md](COMPETITOR_ANALYSIS.md) · [MARKET_RESEARCH.md](MARKET_RESEARCH.md) ·
[USER_PAIN_POINTS.md](USER_PAIN_POINTS.md)

> **Read this first.** Two assumed differentiators did not survive research, and they are named in
> [What we lost](#what-we-lost) rather than quietly dropped. The remaining advantages are stronger
> for being tested.

---

## What we lost

**1. WhatsApp is not whitespace.** [VERIFIED] RiseUp's signature mechanic is WhatsApp — insights
pushed roughly 3×/week. It is the incumbent's most distinctive feature, not an unoccupied space.

What survives: RiseUp's WhatsApp is **outbound only, not conversational**. [VERIFIED] Nobody in
Israel offers a two-way assistant that answers *"כמה נשאר לנו החודש?"* or accepts
*"תעביר את העסקה האחרונה לקטגוריית בית"*. The differentiator is **interactivity**, not the channel —
a much narrower claim than the roadmap previously assumed.

**2. Mortgage refinancing detection is already claimed.** FamilyBiz ships refinance opportunity
alerts; RiseUp sells mortgage advisory at ₪6,000; Walty reaches a claimed ~25% of Israeli mortgage
seekers and is expanding into refinancing and tax refunds. [LIKELY]

What survives: every Israeli mortgage offering resolves to **a paid human advisor or a lead
handoff**. Nobody has built continuous, automated, multi-track mortgage optimization as software.
The problem is harder in Israel than anywhere Sprive operates, and it remains unsolved — but the
ground is contested, not empty.

---

## The structural reason a household product is defensible

This is the most important single finding in the research, and it underpins everything below.

> **Open-banking consent in Israel is per-individual.** [INFERENCE, high confidence, load-bearing]

Every implementation examined works the same way: a customer authorises a provider to read **their
own** accounts. No source describes merging two individually-consented views into one household
ledger at the bank layer. Mizrahi's own FAQ raises
*"יש לי חשבון משותף – האם על כל בעלי החשבון לאשר את שיתוף המידע?"* — confirming that multi-owner
consent is known friction rather than a designed feature.

**A shared household ledger must therefore be constructed at the aggregator layer. No bank will
ever provide it.**

Two consequences follow:

1. **The household gap is structural, not an oversight.** Banks cannot close it without a
   cross-institution consent model that does not exist. That is why every bank product studied
   offers joint *accounts* but no משק בית construct.
2. **It is the one advantage a bank cannot simply ship.** One Zero can — and did — build the best AI
   in Israeli banking; FIBI can aggregate every bank. Neither can produce a two-person household
   ledger without solving a consent problem outside their control.

Everything in this document that depends on the household being the unit of analysis inherits this
defensibility.

---

## Short-term differentiation

Achievable within the MVP and immediately after, with no bank connectivity, no licence, no AI.

### S1. Manual and cash entry, done properly — in a market where the leader has none

[VERIFIED] **RiseUp does not support cash at all**, and it is a repeated complaint. MyFinanda
supports a cash wallet only. The entire licensed category is built on open-banking aggregation, and
treats anything unconnected as a gap.

Meanwhile **Lyra** (manual-only, free, PWA, explicitly anti-open-banking) and **החיים בפלוס**
(manual by design, privacy-positioned) both exist and both articulate a couple model — evidence
that manual-first is a *chosen* position for a real segment, not merely a limitation. [VERIFIED]

**This inverts the MVP's biggest apparent weakness.** OurMoney's manual-entry constraint is not
only a scope decision and a licensing necessity — it addresses a verified, unserved complaint about
the market leader.

### S2. Two real logins with a household model — Strong for only one Israeli budgeting app

[VERIFIED] Across every Israeli product studied, *household sharing with two separate logins* is
**Strong** for exactly two: **FamilyBiz** (budgeting) and **PayBox** (a wallet, not a budgeting app).

- **MyFinanda openly admits its model is inadequate** — it recommends both partners share one
  MyFinanda user, and says improvement is planned for a future version. [VERIFIED verbatim]
- **RiseUp's mechanism is unverifiable from outside** — Play describes *"אותו חשבון"* (one account),
  other evidence suggests per-partner messaging. [UNKNOWN]
- **החיים בפלוס** uses one shared login for both spouses. [VERIFIED]

[ADR-006](DECISIONS.md#adr-006) already forbids assuming exactly two members, and the schema has
`household_members` with per-member identity from migration 001. **This is a day-one structural
advantage over most of the market**, and it costs nothing extra to hold.

### S3. A transparent, editable rules engine — attacking the widest competitor's #1 complaint

[VERIFIED] **Categorisation is FamilyBiz's most-cited complaint**: *"עבודה של שעות כל חודש"*
(hours of work every month); a paying user writes *"אני מרגיש שאני עובד אצל האפליקציה"* (I feel like
I work for the app). Its structural weakness is documented — **one merchant maps to one category,
with no amount- or timing-based splitting and no bulk edit**.

Across the Israeli matrix, *rules engine (editable)* is **Weak or Absent for every product**.
Internationally, even Copilot — the best categoriser in the market — **does not let users view or
edit their own rules without emailing support**. [VERIFIED]

**Nobody, anywhere, has solved "the machine got it wrong; show me the reason and let me fix the
reason, not just this row."**

MVP-2 already includes categorisation rules. The strategic instruction from this research is that
**the rules must be visible, editable, reorderable, testable against history, and bulk-appliable**
— those properties, not raw accuracy, are the differentiator.

### S4. Privacy posture as an explicit product position

[VERIFIED] **FamilyBiz's marketing says data is never transferred to any external party; its terms
and privacy policy say the opposite** — data shared with third-party insurance brokers, third-party
advertising served on user data, anonymised data shareable with or without payment, biometrics and
GPS collected. Google Play's data-safety disclosure confirms the harder version.

[VERIFIED] **RiseUp earns commission from product providers**, but the disclosure lives one legal
document away in general terms — the savings page calls the provider a *"שותף טכנולוגי"*
(technology partner) and says nothing about being paid; the vouchers and mortgage pages carry **no
disclosure at all**.

The incumbents have created a **trust vacuum**, and MyFinanda is the only Israeli player with a
clean model (B2C + B2B white-label, no advertising, no referral marketplace). [VERIFIED]

OurMoney can state plainly and verifiably: **no data sale, no advertising, no referral commissions,
and inline disclosure if that ever changes.** See [TRUST_AND_PRIVACY.md](TRUST_AND_PRIVACY.md).

### S5. Basic app quality the incumbents lack

[VERIFIED] **RiseUp has no dark mode, no widgets, and no biometric login.** Isracard's most-requested
features are dark mode and widgets. Biometric enrolment failures are a signature complaint across
MAX and Isracard.

OurMoney's MVP already includes dark/light mode and biometric gating ([ROADMAP.md](../ROADMAP.md)
MVP-1). This is not differentiation in any deep sense — but it is table stakes the market leader
does not meet, and it is free.

---

## Medium-term differentiation

Requires Open Banking (and therefore an **ISA licence**), richer data, or substantially more
engineering.

### M1. Installments (תשלומים) and the aggregated card charge as first-class objects

[INFERENCE, high confidence] **No international product has an installments primitive.** In the
Israeli matrix, installment modelling is `?` for every product except Cal (issuer-side only).

A single Israeli purchase generates N future transactions. Any forecast that does not model this —
and does not model the **future consolidated card charge** landing against the bank balance — is
wrong precisely when it matters: the household looks solvent all month and is overdrawn on charge
day.

This is unglamorous infrastructure, and it is the difference between a forecast users trust and one
they learn to ignore.

### M2. The overdraft (מינוס) as a modelled object rather than an alert

[INFERENCE, high confidence] No international product models a chronic, structural, normalized
overdraft. Western products treat going negative as an exception to alert on; for many Israeli
households it is the steady state.

In the Israeli matrix, *overdraft as first-class object* is **Partial** for RiseUp and One Zero,
**Absent** everywhere else.

The meaningful questions — how deep, how expensive, what would it take to climb out, what does a
real month look like starting negative — are asked by nobody.

### M3. Interactive conversational finance in Hebrew

Narrowed by research, but still real. RiseUp's WhatsApp is outbound-only; One Zero's "Ella" is the
strongest bank AI and Leumi shipped *"לאומי AI"* in August 2026 — **but both are single-bank, and
neither is a household product.**

The unoccupied space is a **two-way assistant over a *household's* complete financial picture in
Hebrew**, answering questions and taking instructions.

### M4. Deterministic financial intelligence — with independent validation

[VERIFIED] **One Zero's MCP connector (29 July 2026) serves *processed and categorised* data rather
than raw transactions, explicitly to suppress hallucination.** A bank arrived independently at the
same architectural principle as [ADR-012](DECISIONS.md#adr-012).

[VERIFIED] The counter-example is equally instructive: **Cleo's LLM does not compute budgets or
categorise transactions — it narrates numbers a conventional backend already calculated**, and many
intents return pre-written templates. Cleo settled with the FTC for **$17M**.

Origin claims deterministic computational engines rather than language-model estimation — the same
principle — but **every such claim is vendor-sourced with no independent audit**.

OurMoney's rule is already written and is architecturally enforceable rather than promised. As AI
enters Israeli finance, **"our numbers are computed, not generated"** becomes a verifiable safety
claim at exactly the moment it starts to matter.

### M5. Pension and insurance via the מסלקה — where Israel is ahead of the world

[VERIFIED] Israel has an **API-accessible Pension Clearing House**. The UK is still building
pensions dashboards; the US has nothing; the EU's FIDA is over a year out.

**Important qualifier established by research:** pension and insurance data does **not** travel on
the open-banking rail — it is entirely absent from the ISA's API-call breakdown. It moves through
the separate **מסלקה פנסיונית**, under a different regulator (the CMA). [VERIFIED by absence]
Whether that data is flowing to licensees at all as of August 2026 is [UNKNOWN].

This means pension access is a **separate integration with a separate approval path**, not a bonus
that arrives with Open Banking. It should be planned as its own dependency.

**FamilyBiz already does this well** — pension and insurance via the מסלקה including minors'
policies, and automated duplicate-insurance detection. This is FamilyBiz's genuine strength and
should not be attacked head-on.

The opening is that FamilyBiz's own users report **information overload** and its **categorisation
is its worst feature**. Pension data presented inside a product that also makes the monthly picture
clear is a different product from a data dump.

### M6. Long-term family planning grounded in real spending

[VERIFIED] **Long-term family planning is Absent for every Israeli product** and, internationally,
Strong only in Quicken Classic — desktop software with no live account connection.

RiseUp's cited weakness is verbatim that *tracking alone doesn't replace long-term financial
planning*.

The deep planners (ProjectionLab, Boldin, MaxiFi) are **manual-assumption tools by design** —
ProjectionLab markets the absence of bank linking as a privacy feature. **Nobody answers "what
actually happens to our spending if we have another child," starting from what the household
actually spends.**

---

## Long-term moat

Capabilities that get harder to copy as they accumulate data, trust and distribution.

### L1. The Household Financial Twin

[VERIFIED] **Financial twin is Absent for every product in both tables** — Israeli and
international, banks and apps.

A durable model of a household's complete financial state, against which decisions can be
simulated before they are made. Every other advantage in this document is an input to it.

**Why it is defensible:** it compounds. Its quality is a function of history depth, correctness of
Israeli-specific modelling (installments, overdraft, CPI linkage, keren hishtalmut), and household
trust — none of which can be bought or shipped quickly. A competitor starting three years later
starts with three fewer years of household history.

### L2. A real, explainable financial health score

[VERIFIED] **Financial health score is Absent for every Israeli product**, and internationally the
only rigorous methodology (FinHealth Score — spend/save/borrow/plan) is **survey-based and sold
B2B**. Every consumer "score" is a repackaged credit score or an engagement gimmick.

**The methodology is published and free to read. The gap is purely execution.**

A score computed live from real transaction data, where every movement is explained
(*+2 emergency fund improved · +1 expensive loan refinanced*), is achievable and unoccupied — with
the standing caution against gamification that could encourage harmful decisions.

### L3. The Israeli rights and benefits engine

[VERIFIED] **Benefits/tax eligibility as a product is Absent for every Israeli product.** Where it
exists it is a **commissioned human referral** — FamilyBiz's tax-refund partner claiming ₪10,242
average, Walty's nascent tax-refund department.

Nobody has built a versioned, sourced eligibility engine over tax credits (נקודות זיכוי), National
Insurance benefits, municipal benefits, reserve-duty entitlements and government programmes.

**Why it is a moat rather than a feature:** it requires exactly the discipline
[ADR-017](DECISIONS.md#adr-017) already mandates — every rule carrying `source`, `effective_date`,
`retrieved_at`, `rule_version`. That is unglamorous, ongoing, and expensive to maintain, which is
precisely what makes it hard to copy. It is also the capability most likely to make a household say
"this app found me money."

**Regulatory caution:** this is the advantage most likely to touch Israeli licensing. See
[ADR-016](DECISIONS.md#adr-016).

### L4. Trust as an accumulating asset

The incumbents have made this available. FamilyBiz's marketing contradicts its own privacy policy;
RiseUp's commission disclosure is one legal document away from the pages where it matters; both
monetize through provider commissions.

[INFERENCE] A product that takes no commissions, sells no data, serves no advertising, and discloses
inline is making a claim its two largest competitors **cannot make without changing their business
model**. That is the definition of a defensible position — and the reason
[BUSINESS_MODEL.md](BUSINESS_MODEL.md) treats referral revenue as strategically dangerous rather
than merely optional.

---

## Ranked: the three strongest moat candidates

**1. The Household Financial Twin (L1)** — absent everywhere, compounds with data, and every other
capability feeds it.

**2. The Israeli rights and benefits engine (L3)** — absent everywhere, expensive to maintain,
demonstrably valuable, and directly monetizable *without* commissions.

**3. Deterministic financial intelligence (M4)** — already architecturally committed, independently
validated by One Zero's design choice, and increasingly a *safety* claim as competitors add LLMs.

Trust (L4) underpins all three rather than competing with them.

---

## What NOT to build

Competitors solve these well enough that entering is a poor use of effort.

| Do not build | Because |
|---|---|
| **Cross-bank aggregation UX** | **Cal** does it best in Israel and free; FIBI's MultiBank turns it into categorised cross-bank budgeting; Leumi does it free. Requires an ISA licence and beats nobody |
| **Subscription detection as a headline feature** | **Cal** leads and is free; One Zero detects price increases; internationally Rocket Money and Emma are strong |
| **Shared-wallet / who-owes-whom mechanics** | **PayBox** has by a distance the most developed shared-household-money architecture in Israel (the Box model, explicitly framed for couples, flatmates and separated co-parents). Splitwise owns settling-up internationally. **Bit has 4.9M active Android devices** |
| **A pension data product** | **FamilyBiz already does this well** via the מסלקה, including minors' policies |
| **US-style debt payoff (snowball/avalanche)** | Built on revolving card debt, which is **not the dominant Israeli debt shape**. Would solve a problem Israeli households largely do not have |
| **Bank-grade AI chat over a single bank** | **One Zero's "Ella"** is the strongest AI in Israeli banking and Leumi shipped לאומי AI in Aug 2026. Competing on single-institution chat is competing on their turf with their data |
| **A neobank or any deposit product** | The couples-finance-as-neobank model **failed economically twice** — Ivella and Zeta both died with good feature fit |
| **Bill negotiation concierge** | Rocket Money's model takes 35–60% of first-year savings and generates its worst complaints; the cultural and regulatory fit in Israel is doubtful |

---

## What the MVP must prove

Before investing in Open Banking, AI, or WhatsApp, the MVP needs to answer:

1. **Will Israeli households do manual entry at all?** RiseUp's *"I could fill in Excel for free"*
   complaint cuts both ways. Lyra and החיים בפלוס suggest a manual-first segment exists; its size is
   [UNKNOWN].
2. **Do Israeli couples want per-member privacy — or is full transparency the cultural norm?**
   [UNKNOWN] and **not answerable by desk research.** OurMoney's clearest structural differentiator
   (S2) rests on it. **This is the single most important open question in the entire research.**
3. **Does the household model produce the emotional outcome RiseUp gets credit for?** Its reviews
   cite reduced financial stress in the relationship — *"RiseUp changed the financial conversation in
   our home."* If OurMoney's shared model does not produce that, no engine will compensate.
4. **Does a transparent rules engine measurably reduce categorisation drudgery?** FamilyBiz's #1
   complaint is the clearest testable hypothesis available.
5. **Will households pay?** RiseUp is ₪55/mo (₪64 on iOS), FamilyBiz ₪49.90/mo, MyFinanda ~₪16.60/mo
   effective, החיים בפלוס ₪16.70–22.90/mo. **The price band is wide and the top has just risen ~22%.**

None of these require a licence, an engine, or an LLM to answer.
