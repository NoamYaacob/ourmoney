# Business Model — Strategic Analysis

**Research date:** 9 August 2026
**Status:** Analysis only. **No monetization decision has been made.** See
[Q10](DECISIONS.md#open-questions).

> **The product is not being optimized for monetization yet, and should not be.** This document
> exists so that when a model is chosen, the choice is made with its conflicts of interest already
> visible — not discovered later, after the product has been shaped around them.

---

## What the market teaches

### The structural lesson: standalone consumer PFM is a hard business

[VERIFIED] Standalone UK/EU PFM apps have died at a high rate — Money Dashboard, Yolt, Numbrs
(pivoted), Moneyhub (exited direct-to-consumer) — **even with strong corporate parents** (ClearScore,
ING). In couples finance specifically, the two best products both shut down: Ivella (2024) and Zeta
(May 2025).

What survives falls into three shapes:

1. **PFM embedded in a neobank** — the PFM is a retention feature; the bank makes money elsewhere.
2. **Infrastructure sold B2B** — Tink (acquired by Visa), Nordigen (GoCardless), Moneyhub's pivot.
3. **PFM as a funnel into a lending or affiliate business** — Fintonic, Emma, Sprive, Rocket Money.

[INFERENCE] **Pure subscription consumer PFM that is not embedded, not infrastructure, and not a
lead funnel is the hardest of the four positions.** That is precisely the position OurMoney occupies
by default. This should be treated as a known strategic risk, not a surprise later.

The counterexamples matter though: YNAB and Lunch Money both sustain on subscription alone. YNAB
does it with the strongest retention sentiment in the category (4.6★ Trustpilot [LIKELY]); Lunch
Money does it bootstrapped, with no investors and a small team. Both are **narrow and opinionated**
rather than broad.

---

## How the Israeli incumbents actually make money

This section matters more than the generic model survey below, because it establishes the **market
norm OurMoney would be deviating from**.

### RiseUp — five revenue streams [VERIFIED]

1. Subscriptions — **₪55/mo web; ₪64/mo or ₪619/yr via iOS in-app purchase.** Was ₪45 through
   2023–24: a **~22% increase**.
2. **Commission from product providers.**
3. Paid human advisory — **₪1,890 / ₪3,590 / ₪5,890**.
4. Mortgage advisory — **₪6,000**.
5. B2B to employers.

Health signals worth noting: **~50% of headcount laid off April 2024**, and the **UK operation
closed January 2026**. [VERIFIED] The category leader is not obviously thriving on subscription
alone — which is itself evidence about the model.

### FamilyBiz — four revenue streams [VERIFIED]

1. Subscriptions — **₪49.90/mo or ₪349.90/yr**.
2. **Commissions** — stated plainly in its own copy: the company earns from companies providing car
   insurance, pension transfers and similar.
3. A **benefits marketplace** with unusually explicit economics — car insurance up to 40% off,
   portfolio management, a tax-refund service claiming a **₪10,242 average**, mortgage consultation
   at ₪5,990.
4. **Its own insurance agency**, launched ~3 November 2025, where **AI scans user data for excess
   fees and alerts a human agent before the customer notices.**

Its CEO's framing is the clearest statement of where the market believes it is heading: customers
*"no longer want apps displaying data. They want financial partners."*

### MyFinanda — the clean counter-example [VERIFIED]

B2C freemium (**~₪16.60/month effective**, sold as non-renewing 3- and 6-month blocks) plus a
substantial **B2B white-label arm** for banks and insurers. **No advertising, no referral
marketplace.** Its Play data-safety declaration states no third-party data sharing.

It also has **the highest Play rating of any Israeli budgeting app (4.7)**. [VERIFIED] That is one
datapoint, not causation — but it is the datapoint that argues a clean model is commercially
survivable.

### What this establishes

[INFERENCE] **Provider commissions are the Israeli norm, not the exception.** Both leaders take
them. A product that refuses them is making a real competitive sacrifice — and simultaneously
claiming ground neither leader can occupy without changing their business.

The price band is also now well established: **₪16.60 → ₪64/month**, and the top of it just rose.

---

## Monetization models

### 1. Consumer subscription

**How:** Flat monthly or annual fee per household.

**Verified market anchors:**
| Product | Price | Source quality |
|---|---|---|
| **RiseUp (Israel)** | **₪55/mo web · ₪64/mo or ₪619/yr iOS** | [VERIFIED] |
| **FamilyBiz (Israel)** | **₪49.90/mo or ₪349.90/yr** | [VERIFIED] |
| **Moneytor (Israel)** | ₪49/mo or ₪490/yr | [VERIFIED] |
| **החיים בפלוס (Israel)** | ₪16.70–22.90/mo | [VERIFIED] |
| **MyFinanda (Israel)** | ~₪16.60/mo effective | [INFERENCE from block pricing] |
| Simplifi | ~$3.99/mo promotional | [VERIFIED] |
| YNAB | ~$109/yr | [VERIFIED] |
| Monarch | ~$14.99/mo monthly tier | [VERIFIED] |
| Copilot | ~$95/yr | [VERIFIED] |
| Undebt.it | $10/**year** | [VERIFIED] |

**Fit for OurMoney:** Strong. Aligns incentives almost perfectly — the only way to earn revenue is
to be worth paying for.

**Risks:** the Israeli band is wide (₪16.60–₪64) and segmented by whether the product aggregates.
The two products at the bottom of the band (**MyFinanda, החיים בפלוס**) are the ones with weak or no
aggregation — which is where OurMoney's MVP sits. [INFERENCE] **An unconnected product probably
cannot charge RiseUp's price**, and pricing near the bottom of the band may be the only honest
option until Open Banking exists.

**Conflict of interest:** Minimal. The main one is subtle — subscription products are incentivized
toward *engagement*, and engagement is not the same as financial wellbeing. A product that helps a
household so thoroughly that they need it less has a retention problem. This is the honest tension
in the model and should be resolved in the user's favour explicitly.

---

### 2. Freemium

**How:** Free tier with core tracking; paid tier for intelligence features.

**Fit:** Good, and probably the natural acquisition path in a market where the incumbent charges
₪49.90–₪55/mo from day one.

**Natural free/paid line for OurMoney** [INFERENCE]: the MVP feature set (manual tracking, household
sharing, budgets, categories) is the free tier; the deterministic engines (Safe-to-Spend, health
score, benchmarks, mortgage/debt optimization) are paid. This has the useful property that the free
tier is genuinely useful and the paid tier is genuinely expensive to build — so the boundary is
economically honest rather than artificial.

**Risk:** Free users on an Open Banking product cost real money per month in aggregator fees.
[INFERENCE] Free tiers in PFM are far more expensive than in typical SaaS. A free tier may only be
viable *before* Open Banking, or with manual-entry-only accounts.

**Conflict of interest:** Low, with one caveat — the temptation to make the free tier
*deliberately frustrating* rather than *genuinely limited*. These feel different to users and one
of them destroys trust.

---

### 3. Premium household plan

**How:** Per-household pricing rather than per-seat, with higher tiers for more members or more
features.

**Fit:** Strong, and structurally aligned with the domain model. [ADR-006](DECISIONS.md#adr-006)
already forbids assuming exactly two members; pricing per household rather than per person matches
that.

**Note:** free partner seats are the international norm — Monarch, YNAB (6 people), Lunch Money
(unlimited), Origin and Emma Family all include partner access at no extra cost. [VERIFIED]
**Charging per seat would be a competitive disadvantage**, not a revenue opportunity.

---

### 4. Financial marketplace / referral revenue / lead generation

**How:** Commission for referring users to loans, mortgages, insurance, pension products.

**Fit:** Financially attractive. **Strategically dangerous.** This deserves a section of its own —
see [The core conflict](#the-core-conflict-recommendation-revenue) below.

---

### 5. Advisor marketplace

**How:** Connect households to human financial advisors, mortgage brokers (יועץ משכנתאות), or
accountants; take a fee.

**Fit:** Moderate. Less corrosive than product referral because the advice is delivered by a
licensed human who carries the regulatory duty — which also neatly sidesteps the licensing
questions in [ADR-016](DECISIONS.md#adr-016).

**Risk:** Quality control. A bad advisor referral damages trust as badly as a bad product referral.

---

### 6. B2B2C — employer benefit

**How:** Employers purchase OurMoney as a financial-wellness benefit for employees.

**Fit:** Genuinely interesting for Israel [INFERENCE]. Israeli employers already administer
significant financial infrastructure for employees (pension, keren hishtalmut, שכר), so financial
wellness is a familiar benefit category.

**Advantages:** solves distribution, removes consumer price sensitivity, produces predictable
revenue.

**Risks:** long sales cycles; a hard requirement that employers **never** see individual financial
data — which must be architecturally guaranteed, not merely promised.

---

### 7. Bank or credit partnership

**How:** License the product to a bank or credit-card company as their PFM layer.

**Fit:** Plausible given the survival pattern above — PFM embedded in a bank is one of the three
shapes that lives.

**Risk:** It is the end of the independent product. A bank-owned OurMoney cannot credibly tell a
household "your bank is charging you unnecessary fees" or "refinance away from this lender" —
which is a substantial fraction of the product's value.

---

## The core conflict: recommendation revenue

This is the most important strategic point in this document.

**The scenario.** OurMoney's Action Engine identifies that a household's ₪200,000 consumer loan at
9% could be refinanced at 6.5%. OurMoney earns a commission from the recommended lender.

**Why this is corrosive even when the recommendation is correct:**

1. **The user cannot distinguish "best for me" from "best commission."** Even a perfectly honest
   recommendation is indistinguishable from a bought one, from the outside. The trust cost is paid
   whether or not the abuse occurs.
2. **It biases what the engine looks for.** A product earning referral fees on loans develops more
   sophisticated loan-refinancing detection than, say, "you don't need this loan at all." Bias
   enters through *attention*, not through lying.
3. **It corrupts the deterministic engine's purpose.** [ADR-012](DECISIONS.md#adr-012) exists so
   that financial figures are trustworthy and reproducible. If the engine's *outputs* are
   commercially motivated, the integrity of its *inputs* stops mattering.
4. **The strongest recommendation is often "do nothing" or "you already have this."** No commission
   model pays for that, and it is frequently the correct advice.
5. **It is hard to reverse.** Once revenue depends on referral volume, removing it means removing
   revenue.

**The Israeli incumbents demonstrate the failure mode directly.** [VERIFIED]

**RiseUp's** terms of use state verbatim that it receives payment from the managing company for the
savings service. But the savings page itself calls that provider a *"שותף טכנולוגי"* (technology
partner) and says nothing about being paid by them. **The vouchers page and the mortgage page carry
no disclosure at all.** The disclosure exists — one legal document away, in general terms, with no
rates and no per-product breakdown.

**FamilyBiz** goes further: it launched **its own insurance agency** where **AI scans user data for
excess fees and alerts a human agent before the customer notices.** That is a coherent business. It
is also a product whose analysis engine is pointed at generating leads for its own agency.

Neither is fraud. Both illustrate the mechanism precisely: **the conflict does not appear as a lie,
it appears as where the disclosure lives and what the engine is pointed at.**

**Rocket Money is the international cautionary case.** [VERIFIED] It charges a **35–60% share of the
first year's savings** on negotiated bills, and its bill-negotiation and cancellation services are
simultaneously its most distinctive feature and its largest source of complaints. Whether Rocket
Money user data feeds Rocket Mortgage lead generation is **structurally obvious but publicly
undisclosed** — [INFERENCE], deliberately not stated as fact. The point is that the *suspicion*
attaches regardless.

**Cleo** is the regulatory cautionary case. [VERIFIED] It monetizes through cash advances and
subscriptions, and **the FTC sued it; it settled for $17M (~27 March 2025)** over deceptive advance
claims and an **illegal subscription trap** — users had to enrol in a recurring subscription *before*
being told their actual eligibility. Monetizing financially stressed users attracts regulatory
attention as well as reputational cost.

**Preliminary position** (not yet an ADR): **if OurMoney ever earns referral revenue, the
recommendation surface and the revenue surface must be architecturally separate**, and any
recommendation carrying commercial interest must disclose it inline — not in a footer, not in terms
of service. The `Recommendation` object in [ARCHITECTURE.md](ARCHITECTURE.md) already carries
`assumptions`, `confidence`, `risks` and `source`; a `commercial_interest` field belongs in the same
structure, and it should be impossible to render a recommendation without rendering that field.

---

## Preliminary strategic read

[INFERENCE — this is reasoning, not a decision]

**Most likely viable path:** freemium → household subscription, with the deterministic engines as
the paid tier. It is the model with the fewest conflicts, and it matches what the two healthiest
independent products in the category (YNAB, Lunch Money) actually do.

**Most likely second revenue line, if one is needed:** B2B2C employer benefit. It solves
distribution without touching recommendation integrity.

**The line that should be approached with the most caution:** lending and insurance referral. Not
because it is unethical *per se* — done transparently it can serve users well — but because it is
the one model that can quietly change what the product is for.

**Do not decide any of this now.** The MVP's job is to find out whether the household model works at
all.

---

## What must be answered before any monetization decision

| # | Question | Status |
|---|---|---|
| B1 | Willingness-to-pay for an **unconnected** (manual-entry) product — the ₪16.60–22.90 tier, not the ₪49.90–64 tier | [UNKNOWN] — needs primary research |
| B2 | Cost per connected household per month under Israeli Open Banking | [UNKNOWN] — blocks free-tier viability |
| B3 | Does referral revenue require a license in Israel (loans, insurance, pension)? | [UNKNOWN] — overlaps [Q7](DECISIONS.md#open-questions) |
| B4 | Is there real Israeli employer demand for financial-wellness benefits? | [UNKNOWN] |
| B5 | Would a bank partnership be acceptable given it removes bank-critical advice? | Strategic, unanswered |
