# Market Research — Israeli Household Finance

**Research date:** 9 August 2026
**Evidence labels:** [VERIFIED] · [LIKELY] · [INFERENCE] · [UNKNOWN]

Companion documents: [COMPETITOR_ANALYSIS.md](COMPETITOR_ANALYSIS.md) ·
[USER_PAIN_POINTS.md](USER_PAIN_POINTS.md) · [OUR_ADVANTAGES.md](OUR_ADVANTAGES.md)

---

## 1. Market structure

### Size

[VERIFIED — [ISA 2025 API report, published 26 Apr 2026](https://www.new.isa.gov.il/images/Fittings/isa/asset_library_pic/al_lobby/al_lobby-6267b530a26dd/API_report25.pdf)]

| Metric | Value |
|---|---|
| Licences granted cumulatively through 31 Dec 2025 | **25** |
| Consenting customers | **313,882** (244,468 individual, 69,414 corporate) |
| Share of market | **~4%** |
| Concentration | **Three providers serve 92% of individual customers** |
| Individuals via the API standard | 79.6% |
| **Individuals still screen-scraped** | **19.5%** |
| Corporate via API | 14.3% — effectively broken |

Call mix: credit cards 42.1%, loans 28.2%, current accounts 19.7%, deposits 6.1%, securities 3.4%,
**payment initiation 0.5%**. The ISA's own verdict: *"partial cooperation from data sources,
primarily banks, impedes sector development."*

**Trendline [VERIFIED]:** Nov 2024 was 156,000 customers and 19 licensees — with **17,000 people
revoking consent in the same period**
([Calcalist, 23 Feb 2025](https://www.calcalist.co.il/investing/article/skoqbm00cje)). The category
doubled in a year and remains early-adopter territory.

Per-product scale [VERIFIED]:

| Product | Scale |
|---|---|
| **FamilyBiz** | "over 100,000 registered households"; Play 100K+ downloads (~146K active devices); **#3 top-grossing Finance app in Israel** |
| **MyFinanda** | Play 50K+ installs; **4.7 rating — highest of any Israeli budgeting app**; #7 top-grossing Finance |
| **RiseUp** | Play 10K+ downloads (~37K active devices); iOS 4.43/124, first released Jul 2025 |
| **Bit** (for scale contrast) | **4.90M active Android devices** |

The entire licensed category is in the **low hundreds of thousands of users** — against roughly 2.7
million Israeli households [INFERENCE, order of magnitude]. Read two ways:

- **Optimistic:** penetration is in the single-digit percentages. The category is early.
- **Pessimistic:** the category has existed for years and has not crossed into the mainstream.
  Something is limiting adoption — price, trust, connection reliability, or insufficient value.

**Two signals favour the pessimistic reading.** [VERIFIED] RiseUp laid off **~50% of headcount in
April 2024** and **closed its UK operation in January 2026**. Its subscription price rose ~22% (₪45
→ ₪55 web, ₪64 on iOS) — a move more consistent with margin pressure than with demand strength.

[INFERENCE] The pessimistic reading deserves more weight than a product team naturally gives it.
**The MVP's job is to find out which constraint actually binds.**

**A distribution asymmetry worth internalising:** the banks and wallets have the users. Bit alone
has 4.9M active Android devices — roughly **30× the entire licensed PFM category**. Israeli banks
are also shipping quickly: One Zero's daily *"צ׳ק-אפ פיננסי"*, Leumi's cross-bank aggregation, FIBI's
MultiBank cross-bank categorisation, and Leumi's AI launched August 2026. **The competitive threat
is at least as likely to come from a bank as from another app.**

### The regulatory gate

[VERIFIED] Aggregating Israeli bank data requires a licence under **חוק שירות מידע פיננסי,
תשפ"ב-2021**, supervised by the **Israel Securities Authority (ISA)** — *not* the Bank of Israel.
Earlier planning documents in this repository stated BOI; that was incorrect and has been corrected.

Consequences:
- OurMoney **cannot connect to Israeli banks without an ISA licence**. This is a hard legal gate on
  the entire OPEN BANKING phase, not merely a technical one.
- The MVP's manual-entry constraint is therefore not only a scope decision — it is the only lawful
  option available without licensing.
- Payment initiation is a **separate and later** capability (ISA directive 7 June 2026; advanced
  payment initiation effective 6 December 2026 [VERIFIED via secondary sources — confirm against
  primary]). OurMoney has no reason to want it.

[VERIFIED] **API migration is incomplete**, particularly for business customers, and even licensed
incumbents report **partial coverage and connections that break every few months**.

**Which banks are live [VERIFIED]**, from RiseUp's public
[connections register](https://www.riseup.co.il/connections/) — the best real-world evidence
available: Hapoalim, Leumi, Pepper, Mizrahi-Tefahot, Discount, Mercantile, FIBI, Otsar Hahayal, HSBC,
One Zero, all via API. **Bank HaDoar is password/scrape only.**

**Pension and insurance are NOT on this rail [VERIFIED by absence]** — entirely missing from the
ISA's API-call breakdown. The CMA runs a parallel "open finance" track, but there is **no evidence
pension/insurance data is flowing to licensees as of Aug 2026 [UNKNOWN]**. Pension data still moves
through the separate **מסלקה פנסיונית** (§2.6).

### The single most important structural fact for OurMoney

> **Open-banking consent is per-individual. [INFERENCE, high confidence, load-bearing]**

Every implementation examined works as: *a customer authorises a provider to read their own
accounts.* No source describes merging two individually-consented views into one household ledger at
the bank layer. Mizrahi's own FAQ raises
*"יש לי חשבון משותף – האם על כל בעלי החשבון לאשר את שיתוף המידע?"*, confirming multi-owner consent is
known friction rather than a designed feature.

**A shared household ledger must therefore be built at the aggregator layer. No bank will provide
it.** This is the structural reason the household gap exists — and the structural reason it is
defensible.

### Survival economics

[VERIFIED] The international record for standalone consumer PFM is poor: Money Dashboard, Yolt,
Numbrs and Moneyhub all exited or pivoted, several with strong corporate parents. In couples finance
specifically, the two best products — **Ivella** and **Zeta** — both shut down (2024 and May 2025).

What survives is PFM embedded in a bank, PFM sold as B2B infrastructure, or PFM as a funnel into
lending. See [BUSINESS_MODEL.md](BUSINESS_MODEL.md).

---

## 2. Israeli financial realities that no international product models

These are the structural facts that make a naive port of a Western PFM produce **wrong numbers**,
not merely missing features.

### 2.1 The aggregated monthly card charge

[LIKELY] Israeli credit cards typically settle as a **single aggregated monthly debit** to the bank
account rather than a revolving balance carrying APR.

**Why it breaks imported products:** "Safe to spend" in Israel must project the *future consolidated
card charge* against the current bank balance. Rocket Money's Safe-to-Spend and Simplifi's Projected
Cash Flow both assume transactions hit the account roughly when they occur. [INFERENCE]

**Consequence:** a household can look solvent all month and be overdrawn on charge day. Any
cash-flow engine that does not model the charge date is not merely imprecise — it is wrong at
exactly the moment it matters.

### 2.2 Installments (תשלומים)

[INFERENCE, high confidence] A single Israeli purchase routinely generates N future transactions.
**No international product researched has an installments primitive** — not Copilot's ML, not
Simplifi's Projected Cash Flow, not Monarch's Forecasting.

Three separate things break:
- **Categorization** sees N transactions where there was one purchase.
- **Cash-flow forecasting** must know a committed liability exists before it appears.
- **Budgeting** must decide whether to book the purchase now or spread it — and the answer differs
  between "did we overspend this month" and "what do we owe."

Whether RiseUp handles installments is **[UNKNOWN]** and worth resolving early — it is a good proxy
for how seriously any Israeli competitor takes forecasting.

### 2.3 The overdraft (מינוס) as a normal state

[LIKELY] Israeli consumer debt lives in bank loans, credit-company loans, and the **overdraft
facility (מסגרת אשראי)** — not in revolving card balances.

[INFERENCE, high confidence] **No international product models a chronic, structural, normalized
overdraft as a first-class object.** Western products treat going negative as an exception to alert
on. For a substantial share of Israeli households it is the steady state, and the meaningful
questions are different: how deep, how expensive, what would it take to climb out, and what does
the household's real month look like when the starting balance is negative.

**Strategic consequence:** the entire international debt-payoff category — snowball, avalanche,
balance-transfer optimization, credit-utilization alerts — is built on a debt shape most Israeli
households do not have. **Porting it would solve a problem that isn't there.**

### 2.4 The mortgage is a portfolio, not a loan

[VERIFIED] The Israeli mortgage is a **combination of tracks** — prime, fixed unlinked, fixed
CPI-linked (צמוד מדד), variable — **each with different early-repayment fee calculations**.
Refinancing (מחזור) is a genuine multi-variable optimization: standard practice is to check whether
interest savings beat the penalty within 2–3 years, and to time CPI-linked repayment after mid-month.

Existing tooling is **calculators and human advisors** (Cheshbonai, CalcFinance, Avi-Mashkanta), not
applications. [VERIFIED]

**The sharpest asymmetry found in this research:** Sprive, the international best-in-class, solves
the *easier* single-rate UK version of this problem — and it is the only mortgage product anywhere
that actually acts rather than calculates. **Israel has the harder version and no equivalent
product.**

Caveat added after further research: **FamilyBiz ships mortgage refinancing opportunity alerts, and
Walty is expanding from mortgage origination into refinancing** with claimed reach across ~25% of
Israeli mortgage seekers. [LIKELY] The ground is under-served, **not empty**.

### 2.5 CPI linkage runs through everything

[INFERENCE] Inflation-linked liabilities and instruments are pervasive in Israeli household
finance — mortgages, some savings products, some obligations. **Inflation/CPI-linked liability
modeling is absent from every product researched**, because it is largely unnecessary in the US
market those products were built for.

### 2.6 Pension infrastructure Israel already has and isn't using

[VERIFIED] Israel has a **Pension Clearing House (המסלקה הפנסיונית)**, established 2012–2015 under
the Capital Market, Insurance and Savings Authority, centralizing pension data across insurers and
investment houses, **with an API already used by agents and software companies** for automatic data
collection and unified portfolio views.

**This is a structural advantage over every market in the international research.** The UK is still
building pensions dashboards; the US has nothing comparable; the EU's FIDA is over a year out.
Israel already has centralized, API-accessible pension data — and consumer PFM largely isn't using
it. FamilyBiz is the exception found. [LIKELY]

Israeli retirement math is also *harder*: pension fund vs. gemel vs. **keren hishtalmut** — a
tax-advantaged instrument liquid after six years, with **no foreign equivalent**, which no
international product could model even in principle.

### 2.7 חיסכון לכל ילד

[VERIFIED] Universal government child savings has **no international analogue**, and children's /
family savings is a near-universal gap in the products researched.

### 2.8 Other Israel-specific factors

| Factor | Status |
|---|---|
| Mixed salaried + self-employed (עצמאי) households | Common [INFERENCE]. RiseUp explicitly does not serve self-employed cash flow [VERIFIED]. **Every product researched fails at irregular income.** |
| Reserve duty (מילואים) income disruption | [UNKNOWN] — not researched. FamilyBiz offers reservist pricing, implying the segment is recognized commercially. |
| Annual irregular expenses (holidays, arnona, school) | [INFERENCE] Significant and poorly handled by monthly budgeting models. |
| Banking fees | [UNKNOWN] — worth researching; a plausible quick-win insight. |
| Childcare costs | [UNKNOWN] |
| Tax credits (נקודות זיכוי), National Insurance benefits, municipal benefits | [UNKNOWN] — **no dedicated consumer eligibility engine found**, though the search was shallow. Walty is building a tax-refund department. |
| Housing affordability | [UNKNOWN] — not researched |

---

## 3. Government infrastructure nobody has built on

One of the most striking findings. Israel runs substantial free public financial infrastructure and
**essentially nobody has built a good consumer product on top of any of it.** All **[VERIFIED]**.

| Service | What it is |
|---|---|
| **הר הכסף** — [itur.mof.gov.il](https://itur.mof.gov.il/) | Free ID-based lost-asset search across banks, pension, gemel, insurance |
| **הר הביטוח** — [harb.cma.gov.il](https://harb.cma.gov.il/) | Insurance policy registry |
| **מחשבון ביטוח דירה** — [dira.cma.gov.il](https://dira.cma.gov.il/) | **Official CMA home-insurance price comparison calculator** |
| **מחשבון ריסק** — [life.cma.gov.il](https://life.cma.gov.il/) | Official life/risk calculator |
| **כל זכות** — [kolzchut.org.il](https://www.kolzchut.org.il/) | The de-facto authoritative Hebrew rights wiki. API availability **[UNKNOWN]** |
| **Form 135** — [gov.il/he/service/itc135](https://www.gov.il/he/service/itc135) | **Fully online tax-refund filing incl. document upload** since tax year 2019 |
| **Free tax simulator** — [secapp.taxes.gov.il](https://secapp.taxes.gov.il/shSimulatorMas/main.aspx) | No identification required |
| **BOI standardized אישור עקרוני** | Uniform mortgage-offer format (§2.4) |

Tax refunds have a **six-year lookback** under §160 — in 2026 you can claim 2020–2025, and **the 2020
claim expires 31 Dec 2026**.

Meanwhile the commercial layer charges heavily for access to those free services:

| Service | Fee |
|---|---|
| **FinUpp** (Meitav subsidiary) | **13% of refund incl. VAT**, min ₪100/year, success-only |
| **מחזירים** | Tiered 20/19/18/17%; worked example **₪32,000 refund → ₪6,040 fee** |
| Market norm | **15–25% of refund + 18% VAT**; some impose ~₪800 minimums |

**No consumer tax-refund app exists in the Israeli App Store.** Data gets in universally via
**מייצג authorization** plus document upload — no open-banking or consumer API path.

### Two integrity warnings worth surfacing to users **[VERIFIED by inspection]**

- **itur-mof.org.il** brands itself *"הר הכסף 2 — 100% איתור כספים אבודים ברישיון משרד האוצר."* It is
  **not** the government site (that is itur.**mof.gov.il**). It discloses no company name, licence
  number or ownership, and monetises a "thorough" search.
- **FundBack** serves testimonial headshots from **randomuser.me** (a stock fake-person API) with
  visibly placeholder trust counters — *"₪0.1 מיליון הוחזרו"*, *"1% מהלקוחות מצאו כסף"*. Its fee
  percentage is **not disclosed anywhere on the site**.

**[INFERENCE]** A product that acts as an honest, free layer over public infrastructure is
differentiated on integrity alone — see [TRUST_AND_PRIVACY.md](TRUST_AND_PRIVACY.md).

---

## 4. Subscription cancellation — a blank, with a legal caveat

**There is no Israeli Rocket Money. [VERIFIED-negative]** Five Hebrew search angles — "ביטול מנויים",
"הוראות קבע", "מנויים מיותרים", "הוזלת חשבונות", "אפליקציה שמזהה מנויים" — returned only how-to
guides, bookkeeping SaaS, and banks' own standing-orders screens.

**Detection, however, is already solved by an incumbent.** **Cal** ships
*"בנקאות פתוחה - ניהול מינויים והוצאות קבועות"*, aggregating recurring expenses, subscriptions and
standing orders **across all card companies and banks**, free and consent-based **[VERIFIED]**.
Whether Cal lets you *cancel* in-app is **[UNKNOWN]**. **One Zero** detects subscription price
increases on its own cards **[VERIFIED]**.

**Switchy** ([switchy-ai.com](https://switchy-ai.com/)) is the one real adjacent player: AI telecom
comparison and switching concierge, 120+ plans across 10+ providers, free to the consumer,
telco-commission funded. Notably **data gets in by the user photographing their bill** — no open
banking. It alerts **~21 days before an introductory price expires**, a good hook since Israeli
telecom promos silently step up. **[VERIFIED]**

**Israel has a statutory cancellation duty [VERIFIED, Consumer Protection Law 1981 §14ט(ב)]:**

> *"...ייצור עוסק בדף הראשי של אתר האינטרנט שלו קישור ייעודי, מובלט וברור, שבאמצעותו ניתן לשלוח
> הודעת ביטול."*

Billing must stop within 3 business days; **statutory damages up to ₪10,000 without proof of damage**
if it continues.

⚠️ **The amendment number and commencement date are [UNKNOWN]** — one research stream verified the
section verbatim, another could not confirm it at all. **[INFERENCE]** If the duty is real and
enforced, the Rocket Money model (35–60% of first-year savings) may simply not transfer, because the
pain it monetises is partly legislated away here. **Requires a direct Knesset/nevo check before any
cancellation-concierge work.**

---

## 5. Where the Israeli market is underserved

Ranked by combination of evidence strength and strategic value.

**1. Per-member privacy inside a household.** [LIKELY] Every serious Israeli PFM found is a **single
shared household view**. RiseUp's privacy policy states that on a shared account, information is
available to the account partner. No product found offers per-partner visibility control,
separate-plus-joint budgets, or a mine/ours model. This is simultaneously the clearest gap and the
one whose *desirability* is least established — see the caution in §4.

**2. Long-term household planning.** [LIKELY] RiseUp's cited weakness is that "tracking alone
doesn't replace long-term financial planning." FamilyBiz has breadth but is criticized for
information overload. **Nobody in Israel is doing multi-year household planning well.**

**3. Cash tracking.** [LIKELY] RiseUp has none at all, and it is a repeated complaint. A trivially
solvable gap for a manual-entry product — and one of the few places where OurMoney's MVP
constraint is an advantage rather than a handicap.

**4. Installments and overdraft as first-class objects.** [UNKNOWN in Israel, absent
internationally] The two most Israel-specific modeling problems, and the two most likely to make a
forecast trustworthy or useless.

**5. Benefits and tax-rights eligibility.** [UNKNOWN, shallow search] No dedicated consumer
eligibility engine found. Possibly genuinely open, possibly under-researched.

**6. Children's financial planning.** [LIKELY absent] Neither RiseUp nor the international cohort
addresses it. חיסכון לכל ילד provides a natural, universal entry point.

**7. Financial health scoring.** [VERIFIED gap globally] The one rigorous methodology (FinHealth
Score: spend/save/borrow/plan) is survey-based and sold B2B. Every consumer "score" is a repackaged
credit score or an engagement gimmick. Nobody computes a live score from transaction data.

**8. Forecast explainability.** [INFERENCE] Nobody anywhere publishes forecast accuracy, offers
confidence intervals, or explains why a forecast moved.

---

## 6. Cautions

Three findings argue against over-confidence, and they belong in this document rather than buried.

**WhatsApp is not whitespace.** [LIKELY, high confidence] RiseUp already sends WhatsApp budget
alerts ~3×/week. Earlier planning treated the WhatsApp assistant as an uncontested differentiator.
What remains open is the *interactive* half — RiseUp's usage appears one-way. The differentiator is
narrower than assumed and should be re-scoped accordingly.

**Mortgage refinancing detection is already claimed** by FamilyBiz and, adjacently, by Walty.

**The privacy gap may not be a demanded feature.** Every Israeli product being fully-transparent
could mean nobody has built per-member privacy — or it could mean **Israeli couples don't want
it**, and full transparency is the cultural expectation. Desk research cannot distinguish these.
Given that OurMoney's clearest structural differentiator rests on this, **it is the single most
important thing to establish with real users before building on it.** Recorded as an open question.

---

## 7. Strategic summary

**Israel is behind on the data pipe and the product layer, but ahead on pension infrastructure, and
has structurally harder versions of the two problems where international products are weakest
anyway** (mortgage optimization, installment/overdraft cash flow).

The opportunity is not to build a better international PFM for Israel. It is to build the product
that **models Israeli financial structure correctly** — installments, aggregated card charges,
overdraft-as-normal, CPI linkage, keren hishtalmut, חיסכון לכל ילד — because no imported product
can, and the incumbents that could have not prioritized it.

The risk is that the category's low penetration (~314K customers across 25 licensees) reflects a
demand ceiling rather than an execution gap.

---

## 8. Research quality and gaps

**Blocked:** riseup.co.il returned 403 across its entire domain; gov.il, Google Play and Trustpilot
403'd automated fetches; WebSearch quota exhausted mid-research. **All RiseUp facts are
second-hand.**

**Not researched at all:** PayBox, MAX, Isracard; Pepper/Leumi/Discount/Mizrahi/FIBI PFM depth;
Israeli banking fee structures; childcare costs; reserve-duty income disruption; housing
affordability; Hebrew-language app store review data.

**The three highest-value follow-ups**, all answerable in a browser in under an hour:
1. RiseUp's household model — separate logins, privacy, separate vs. joint budgets
2. The full ISA register at gov.il/he/departments/general/info_0005
3. Real store ratings and Hebrew review themes for RiseUp and FamilyBiz

**And one that requires users, not searching:** whether Israeli couples want per-member privacy.
