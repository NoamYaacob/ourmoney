# Competitor Analysis

**Research date: 9 August 2026.** Evidence labels: **[VERIFIED]** / **[LIKELY]** / **[INFERENCE]** /
**[UNKNOWN]**. See [MARKET_RESEARCH.md](MARKET_RESEARCH.md) for methodology and the warning about
unreliable Hebrew listicles.

Ratings are from the Apple iTunes API (`country=il` where Israeli) and live Google Play listings,
fetched 9 Aug 2026.

---

# Part 1 — Israeli products

## 1.1 RiseUp (רייזאפ) — category leader

**Positioning [VERIFIED]:** not a ledger but a cash-flow coach — *"להיות בטוב עם הכסף שלך"*.
Software + human advisors in chat + a claimed 100,000-member Facebook community.

**Company [VERIFIED]:** founded 2017; ~$50M raised; $30M Series B Apr 2022 (Corner Ventures, Aleph,
Latitude, Sir Ronald Cohen). **Layoffs 30 Apr 2024 — ~50% of headcount.** **UK operation closed
January 2026.**

| Dimension | Finding |
|---|---|
| Data in | ISA-licensed provider, one of the first four (28 Sep 2022). Open banking API for every institution except Bank HaDoar. Explicitly read-only. ISO 27001:2013. **[VERIFIED]** |
| Budgeting / forecast | Monthly forecast; **weekly "how much is left to spend"** — the closest thing to safe-to-spend in Israel. **No projection beyond the current month [VERIFIED, review-sourced]** |
| Couples | Dedicated [partner page](https://www.riseup.co.il/partner); *"אפשר להזמין בחינם את בן או בת הזוג"*. **Mechanism ambiguous [UNKNOWN]** — Play says *"אותו חשבון"* (one login), other evidence suggests per-partner messaging (two identities) |
| Self-employed | **Explicitly excluded** — requires separated business/personal accounts and stable monthly income. **Cash unsupported. [VERIFIED]** |
| AI / WhatsApp | **WhatsApp is the signature mechanic** — insights pushed ~3×/week, **outbound only, not conversational**. Terms disclose use of OpenAI, Gemini and Anthropic Claude. **[VERIFIED]** |
| Detection | Duplicate charges, unnecessary fees, **duplicate insurance policies** **[VERIFIED]** |
| Rights / tax / pension / child savings | **All absent [VERIFIED by absence]** |
| Pricing | **₪55/mo** web · **₪64/mo or ₪619/yr** iOS IAP · was ₪45 through 2023–24 → **~22% increase [VERIFIED]** |
| Ratings | iOS **4.43 / 124** (first released 14 Jul 2025) · Play **4.5 / 216, 10K+ downloads** (~37K active devices) |

**Business model — five streams, all [VERIFIED]:** subscriptions; **commission from product
providers**; paid human advisory at **₪1,890 / ₪3,590 / ₪5,890**; mortgage advisory at **₪6,000**;
B2B to employers.

> **The disclosure finding.** The terms of use state verbatim *"רייזאפ מקבלת תשלום מהחברה המנהלת עבור
> שירות החיסכון"*. But the savings page itself calls Meitav a *"שותף טכנולוגי"* (technology partner)
> and says nothing about being paid by them. The vouchers page and the mortgage page carry **no
> disclosure at all**. The disclosure lives one legal document away, in general terms, with no rates
> and no per-product breakdown. **[VERIFIED]** — see [TRUST_AND_PRIVACY.md](TRUST_AND_PRIVACY.md).

**Referral programme [VERIFIED]:** ₪50 on registration + data connection, **₪150 total** on
conversion. One reward per household. **[INFERENCE]** ₪150 CAC against ₪55/month.

**Review themes [VERIFIED].** *Praise is emotionally strong and behavioural:* zero manual entry;
*"עזר לי להגיע לתזרים חיובי של 2000 שקל בחודש"*; *"RiseUp changed the financial conversation in our
home."* Human support appears in ~39% of positive reviews.
*Complaints:* **advisor chat is slow and clunky** (*"ממשק ההתכתבות עם הצוות מסורבל מאוד"*, 19 Jul 2026)
— which matters because advisors are a core selling point; **no English despite the listing claiming
it** (~50% of negative iOS reviews); **no dark mode, no widgets, no biometric login**; open-banking
connections **fail opaquely and need re-linking every few months**; **cannot handle daily-deposit
sweep accounts**; *"I could fill in Excel for free"*.

---

## 1.2 FamilyBiz (פמילי ביז) — widest scope, best couples architecture

**Scale [VERIFIED]:** "over 100,000 registered households"; Play 100K+ downloads (~146K active
devices); **#3 top-grossing Finance app in Israel**. ISA licence 28 Sep 2022.

| Dimension | Finding |
|---|---|
| Scope | Whole-financial-life aggregator: banks, cards, loans, mortgages, **insurance, pension, gemel/hishtalmut**, crypto, real estate **[VERIFIED]** |
| Data in | Open banking **plus** a 20-article help category on **recovering your bank website password** → [LIKELY] credential scraping runs in parallel. **Manual entry fully supported** ("בנק ידני") — the app is usable with zero connections **[VERIFIED]** |
| Pension/insurance | Via the **מסלקה**, including minors' policies. Annual refresh free, 6-monthly on premium **[VERIFIED]** |
| **Couples — best documented in Israel** | Invite via SMS code. **The partner gets their own separate account and login.** Symmetric permissions, both edit everything, real-time sync. **[VERIFIED]** ⚠️ **Hard trap:** if the invitee already has an account they **cannot** be added — it must be deleted first |
| Forecasting | Formula surfaced in-product. **No per-category hard limits, no envelope rollover, no daily safe-to-spend.** Forecast view is **premium-gated** |
| **Categorisation — the #1 complaint** | *"עבודה של שעות כל חודש"* (31 Jul 2026); *"במקום לעזור לי… אני מרגיש שאני עובד אצל האפליקציה"* (paying user). **Structural weakness: one merchant → one category. No amount- or timing-based splitting, no bulk edit** |
| Alerts | Salary deposited, cellular price increases, **recommendations benchmarked against other users**, mortgage-refinance opportunities. **Duplicate-insurance detection is automated.** But *"תנועה חשודה"* is **manual flagging only** |
| AI | Used internally for the insurance lead engine. **No conversational AI, no WhatsApp, no generative AI in the app.** Support bot gives *"תשובות סותרות"* |
| Pricing | **₪49.90/mo or ₪349.90/yr [VERIFIED]** |
| Ratings | iOS **4.48 / 551** · Play **4.4 / ~1,270** |

**Business model — four streams [VERIFIED]:** subscriptions; commissions (*"הרווח של החברה מגיע
מחברות שנותנות שירותים שונים כגון ביטוחי רכב, מעבר פנסיה ועוד"*); a **benefits marketplace** with
unusually explicit economics (car insurance to 40% off, Meitav portfolio management, tax-refund
service claiming ₪10,242 average, mortgage consultation ₪5,990); and **its own insurance agency**
launched ~3 Nov 2025 where **AI scans user data for excess fees and alerts a human agent before the
customer notices.** CEO Goldstein: customers *"no longer want apps displaying data. They want
financial partners."*

**Negative themes [VERIFIED]:** **paywalling previously-free features, recent and accelerating** —
*"בתקופה האחרונה הם סגרו בתשלום פיצ'רים חיוניים שהיו חינמיים"* (2 Aug 2026); categorisation drudgery;
bugs (white screens, stale data 8+ days, a months-long unfixed **Bit + PayBox charge bug**); billing
disputes; privacy pushback. Top requests: **web version, AI categorisation, English.**

> **Privacy contradiction — the most attackable point in FamilyBiz's positioning [VERIFIED].**
> Marketing says ISO 27001/27018 and *"המידע נשמר רק אצלנו ולא יועבר לאף גורם חיצוני"*. The terms and
> privacy policy say the opposite: data shared with third-party insurance brokers, **third-party
> advertising served on user data**, anonymised data shareable *"בתמורה או שלא בתמורה"*, biometrics
> and GPS collected, hosting possibly outside Israel. **Google Play data-safety confirms the harder
> version.**

---

## 1.3 MyFinanda (פיננדה) — cheapest, weakest on couples

Oldest in the market (iOS first release **8 Oct 2014**). Consumer brand MyFinanda; **Finanda
Innovations** is the B2B parent.

| Dimension | Finding |
|---|---|
| Data in | Dual path — open-banking consent **and** legacy credential-based updates, documented side by side. Refresh: morning only on free; 3×/day premium **[VERIFIED]** |
| Manual entry | **Cash wallet only** — confirmed by the company. A major complaint |
| **Couples — explicitly inadequate, and they admit it** | *"אנחנו ממליצים… שימוש משותף באותו משתמש MyFinanda… אנחנו מתכננים לשפר ולייעל את נושא השיתוף בגרסה עתידית."* **[VERIFIED verbatim]** No separate identities, no roles, no private/shared split — and it collides with mandatory device biometric auth |
| Features | Auto-categorisation by ענף; budget targets; annual comparison; **total net-worth report**. **No cash-flow forecasting, no safe-to-spend** — MyFinanda is retrospective |
| Absent | Debt, mortgage, tax, benefits, children's savings, subscription detection, pension (company confirmed on Play 19 May 2026: *"עדיין לא 🙂"*), AI, WhatsApp |
| Pricing | **3 months ₪49.90 / 6 months ₪89.90, one-off and explicitly non-renewing.** Excel export sold separately. **[INFERENCE] ~₪16.60/month effective — a third of RiseUp** |
| Ratings | iOS **4.46 / 452** · Play **4.7 / ~1,480, 50K+ installs, #7 top-grossing Finance** — **the highest Play rating of any Israeli budgeting app** |

**Business model [VERIFIED]:** genuinely dual — B2C freemium plus a substantial B2B arm (white-label
apps for banks and insurers). **No advertising, no referral marketplace** — a cleaner model than
FamilyBiz. Play data-safety: **"לא מתבצע שיתוף נתונים עם צדדים שלישיים"**.

> **The open-banking migration disaster — a structural lesson for us [VERIFIED].** A four-year paying
> customer: *"לאחר המעבר לבנקאות הפתוחה… אובדן מוחלט של כל הנתונים שלי! כל הסיווגים והנתונים שבניתי
> במשך שנים נמחקו."* Finanda's reply blamed the law. **The user's rebuttal is the real insight: the
> law requires deleting *data*, not the *categorisation skeleton*.**

---

## 1.4 Smaller Israeli products

| Product | Notes |
|---|---|
| **Lyra** (lyra-il.com) | **PWA only.** *"יתרת הבנק משקרת"*. **Manual only by design**, explicit anti-open-banking privacy stance. **The best-articulated couple model found anywhere: each partner has their own login, both see one shared cash flow, with personal vs household distinguished.** Free. **[VERIFIED]** Appears solo/early-stage — **treat as a signal of unmet demand, not a competitor** |
| **Moneytor** (moneytor.ai) | Net-worth aggregator incl. pensions via the מסלקה, real estate, RSUs, crypto. **₪49/mo or ₪490/yr.** "Family account" free with Premium but **mechanism [UNKNOWN]**. iOS **4.43 / 23, last updated Mar 2025 (~17 months stale)** |
| **סכם לי / Sakem Li** | Free, indie. Widgets, statement import, biometric lock, **`bit` and `PayBox` as first-class filterable payment methods**, receipt attachment, AI assistant. Spouse sharing listed, mechanism [UNKNOWN]. iOS **4.79 / 24** |
| **החיים בפלוס** | Manual by design, privacy-positioned, coaching-derived. **One shared login for both spouses.** **₪16.70–22.90/mo.** iOS 4.72 / 58 but **last updated Aug 2024 (~2 years stale)** |
| **פעמונים** | Nonprofit, 20+ years, 80,000+ households, **free counselling**, general-audience (not haredi-branded). Claims Rishumit improved household annual cash flow ~₪18,000 |
| **bizibox** | Horizontal cash-flow platform spanning household, self-employed, SMB and accountants. Pricing [UNKNOWN] |
| **Gem** | iOS-only indie, 4.56 / 101; **partner-sharing beta in flight** |

**Verified NOT REAL or DEAD [VERIFIED]:** Mony, Coins, Budgeto, Sindibad, Sheker — do not resolve or
are parked. **MyCheck** — real company, never a budgeting product. **Mint** — Intuit shut it down
globally Jan 2024; any Israeli listicle still recommending it is stale. **"Scarab/סקראב"** — appears
in one templated SEO listicle with no primary source; **likely fabricated AI content**.

---

## 1.5 Banks

| Bank | Aggregates other banks? | Budgeting | Household | AI | Ratings |
|---|---|---|---|---|---|
| **Pepper** (Leumi) | [LIKELY NO] | **Strongest bank budgeting module**, six meaningful releases in eight months incl. **dark mode** and **user-selectable budget-cycle start date** — both of which Leumi's own app lacks | Fully digital joint accounts incl. **adding a partner to an existing account**. No cross-bank household view | **None** — 24/6 chat with a *human* banker is the flagship | iOS 4.61 / 35,159 · Play ~3.8–4.1 |
| **Leumi** | **YES — clearest cross-bank capability among the big two [VERIFIED].** Other banks' accounts **and all card charges incl. non-bank cards**, with duplicate-charge detection. **Free.** ⚠️ **No press coverage of this flagship feature exists at all** | Thin; **no budget feature in any 2025–26 release note** | Joint accounts only. Only "sharing" shipped is a **statement PDF to WhatsApp** | **"לאומי AI" launched c. 4 Aug 2026** — free-text chat that also **executes transactions**. Days old. Multiple reviewers angry that **human chat was removed** | iOS 4.52 / 38,711 · Play 4.44 / 41,366 |
| **Hapoalim** | [UNKNOWN — treat as absent] | **A PAID BUNDLE.** "UP control" ₪9/mo. ⚠️ **T&C: *"התשלומים הקבועים… יוגדרו על ידי הבנק"* — the bank picks which recurring payments are monitored, not the user** | **No משק בית, no couples product.** An iOS reviewer reports shared-account setup failing on iPhone but working on Android | **"דנית"** AI banker; **"דן"** free push-based insights (duplicate charges, unusual expenses). **WhatsApp via פועלים PRO** | iOS 4.56 / 87,769 · Play 4.6 / 87.5K |
| **Discount** | Outbound platform only; private open-banking page **404s** | **No ניהול תקציב module at all** — an insights layer, not a budgeting product | Joint accounts only | **דידי** 24/7 digital rep | ⚠️ iOS **4.63 / 60,823** vs Play **3.2 / 12.1K** — **a 1.4-point gap, same product, unexplained** |
| **Mizrahi-Tefahot** | **YES** | **Effectively absent [LIKELY].** Site-wide search for "ניהול תקציב" returns only literacy PDFs | Nothing | Investment-side only | **Worst in the survey: 2.8 on both platforms.** Best-in-class *service* reputation (3 years running), worst-in-class app |
| **FIBI** | **"מולטי בנק" — the best-developed of any Israeli bank**: all banks + **credit-card data from banks and card companies** + securities | **Yes, free.** And **the single most competitively relevant fact in the bank set: categorisation also applies to MultiBank-shared external cards and other banks' accounts.** FIBI is the only bank that turns cross-bank aggregation into categorised cross-bank budgeting | **FibiWise 360** — explicit family-office framing, open to non-customers. ⚠️ **[UNKNOWN]** whether two partners can each log in and see one shared view; the described mechanism is one person aggregating | "פיבי הבנקאית הווירטואלית" [INFERENCE: insights engine, not an LLM]. New **AI & DATA department Apr 2026** | Play 4.1 / 7.27K · iOS 3.9 |
| **One Zero** | **YES, full — "ההון שלי", gated to paid tiers** | **No dedicated budgeting module marketed. No safe-to-spend.** The clearest gap vs RiseUp | Joint accounts actively marketed; **partners can view each other's pension data**. **[INFERENCE] no משק בית construct**; two partners banking elsewhere can only merge by opening a **joint** account | **The strongest in Israeli banking.** "Ella" — 10+ models; **and the 29 Jul 2026 MCP connector letting customers connect account data to ChatGPT and Claude** | iOS 3.98 / 2,146 · **Play 2.9–3.0 / 3.01K** |
| **Esh** | No | No | **No joint accounts, no household feature of any kind [VERIFIED]** | No | Statistically meaningless volume |

**One Zero's daily "צ׳ק-אפ פיננסי" [VERIFIED]** is the most interesting bank feature in Israel: a
daily automated scan flagging **duplicate charges, credit line nearing exhaustion, and an account
about to go into overdraft — including at other banks, with a recommended transfer** (*"כן, גם אם זה
מאצלנו לבנק אחר"*). It **also detects subscription price increases**. BOI survey: **51% of One Zero
customers say the bank proactively acts to reduce their costs vs 29% system-wide.**

**The One Zero MCP connector, 29 July 2026 [VERIFIED, Calcalist/TheMarker/ynet/Walla]** deserves
attention because the design choice matters: it serves **processed and categorised** data from the
bank's infrastructure layer, **not raw transactions, explicitly to suppress hallucination.** PM Niv
Netzer: *"מאפשר לסוכן החיצוני למשוך נתונים מעובדים ומסווגים בזמן אמת."* Phase 1 is read-only and
opt-in; **Phase 2 within months is supervised agency** — the AI prepares transfers, the customer
approves in-app. This is the same architectural principle as our
[ADR-012](DECISIONS.md#adr-012), arrived at independently by a bank.

---

## 1.6 Card issuers and wallets

| Product | Key finding |
|---|---|
| **Cal (כאל)** | **The aggregation and subscription leader, and the best-executed open-banking consumer feature in Israel [VERIFIED].** *"חדש באפליקציית כאל: מהיום, אפשר לרכז את כל סוגי ההוצאות שיש לך **בכרטיסי האשראי של כל החברות וחשבונות הבנק**"* — recurring expenses, subscriptions and standing orders **across all issuers and banks**, free, consent-based. ⚠️ **Cancellation from inside Cal: [UNKNOWN]** — detection and aggregation verified, cancellation not. Also the **only explicitly documented shared-account card view** (username+password login exposes every card on a joint account). Complaints: **ad and loan upsell density** (*"you can't see the app for all the ads"*), a live defect rendering the Approve button off-screen on smaller iPhones. iOS 4.59 / 68,057 |
| **MAX (מקס)** | Auto-categorisation with donut chart; **user-renameable transactions** (a genuinely differentiated small feature); charge-date tools (change, split, defer). ⚠️ **Its 2023 open-banking page promises subscription detection in future tense and there is no evidence it shipped — [UNKNOWN].** **MyMAX is the strongest family product of the three issuers**: prepaid kids' card with **two-sided visibility** — kids get their own page with balance, transactions and their own category breakdown. Complaints: biometric enrolment doesn't persist, **OTP is SMS-only with no email fallback** (*"stuck abroad, can't get in for a month"*), customer service is the #1 negative theme at 29.5%. iOS 4.65 / 61,520 |
| **Isracard (ישראכרט)** | Home screen shows upcoming charge per card + **countdown of days to charge date**; standing orders surfaced; **6-month charges chart** new in the current release. **Worst reliability profile of the three — crashes are 32.2% of negative iOS reviews.** Signature bug: Face ID enrolment that doesn't persist (*"I've done it 8 times in 3 days"*). Most-requested: dark mode, widgets, per-transaction push. iOS 4.34 / 32,712 |
| **PayBox** (Discount) | **By a distance the most developed shared-household-money architecture in Israel [VERIFIED].** One account subdivided into **יתרה ראשית / Box אישי** (earns up to 5%) **/ Box קבוצה** (manager legally owns) **/ Box שותף** (participants are authorised signatories) **/ Box ילד** (funds belong to the parent). Explicitly framed for *"זוגות, שותפים לדירה, **גרושים עם ילדים משותפים**"* — managing shared money **without a joint bank account**. Dedicated **ועד הורים** vertical: *"כולם רואים מי שילם, מתי ועל מה."* Undermined by crashes (30.1% of iOS negatives) and a **₪1,000/month cap widely read as a card-acquisition funnel** — the most emotionally charged complaint in the study. iOS 4.67 / 63,136 · Play 4.23 / 78,317 (**13.2% one-star**) |
| **Bit** (Hapoalim) | **Largest install base of any app studied — 4.90M active Android devices.** **"Pockets" (כיסים) shipped ~20–22 Jul 2026** — additional balances for separating business income, a class fund, or vacation money. Moving onto PayBox's turf, very new; mechanics [UNKNOWN]. **No aggregation, budgeting or categorisation.** #1 design grievance: **payment source defaults to the credit card rather than the in-app balance** |

---

# Part 2 — International products

Full profiles are in the research corpus; this section keeps what is strategically load-bearing.

| Product | Best at | Fatal limitation for our purposes |
|---|---|---|
| **Monarch** | **Couples UX** — Shared Views tag accounts/transactions Mine/Theirs/Ours and filter every surface. Free partner seats, own logins. Real snowball/avalanche Pay Down Goals. iOS **4.9 / ~104K** | **No way to hide an account or transaction from a partner.** US/Canada only. Trustpilot ~2.3 despite the 4.9 App Store rating |
| **Copilot** | **Categorisation — best in class.** A **private per-user ML model** trained on your own corrections; ~93–94% first-pass, 95%+ after months. Best notification system found anywhere. Ships a **beta MCP integration** | **Apple-only, no Android at all.** No forecasting (it's an open feature request). No real couples model — sharing is a shared password. **You cannot view or edit your own rules in-app; you must email support** |
| **YNAB** | **Household structure — the most flexible found.** YNAB Together: 6 people, own logins, **owner chooses which budgets each person sees** → "his / hers / ours" budgets natively. Broadest country footprint. Trustpilot **~4.6, best of the majors** | No forecasting. Debt tooling is single-loan amortization only. **No user-facing AI.** Rigid calendar-month framing |
| **Rocket Money** | **Subscription cancellation** — the only mainstream product that actually cancels. Claims 1M+ cancelled | **Complaint severity is extreme**: PissedConsumer 1.6/5, 7% would recommend; ConsumerAffairs customer service 1.0/5. Most-repeated theme: **account lockouts preventing users cancelling their own Premium subscription.** Bill negotiation takes **35–60% of first-year savings.** Debt tooling is marketing-thin |
| **Origin** | Claims a **multi-agent architecture where "the underlying math runs through deterministic computational engines — not language model estimation"** — the same principle as our ADR-012. **Partner Mode: each partner chooses which accounts to link.** $119/session human CFP | **Every one of those claims is vendor-sourced with no independent audit [LIKELY only].** If true it is the most important AI design in the cohort; if marketing, it is Cleo with a CFP attached |
| **Simplifi** | **Projected Cash Flow at 30/90/365 days** off recurring income, bills and planned spend — better than Monarch Core, and Copilot and YNAB have nothing. Most methodology-flexible budgeting. Cheapest major | **Hard-capped at exactly one other person.** **No debt tooling at all** (open feature request) |
| **Quicken Classic** | **Long-horizon planning and mortgage math — deepest anywhere.** Lifetime Planner What-If mode; amortization, extra-payment, **refi break-even including closing-cost recovery** | Desktop software; **2.5★ Android companion**; no couples model; US/Canada only |
| **Emma** | **Spaces + Family** — a shared Space pools connections and manages a joint budget **while keeping personal spending private.** Subscription price-increase detection | Ultimate tier only (£14.99/mo). No forecasting depth, no scenario simulation |
| **Cleo** | — | **The cautionary tale. [VERIFIED from Cleo's own engineering blog]** Its LLM **does not compute your budget or categorize transactions — it narrates numbers a conventional backend already calculated.** Many intents return **pre-written templated responses**. And: **the FTC sued Cleo and it settled for $17M (~27 Mar 2025)** over deceptive advance claims and an **illegal subscription trap** — users had to enroll in a recurring subscription *before* being told their actual eligibility |
| **Plum** | **Auto-save algorithm is real compute with a real output** — learns bill timing and payday from 3–12 months, recalculates every few days, adapts to tight months. Genuine FCA-regulated SIPP with lost-pension finding | **No LLM chat.** Individual-only architecture; no couples |
| **Lunch Money** | **Multi-currency best-in-class** — historic FX rates stored per transaction. Unlimited free collaborators. Developer API | No forecasting, no debt, no goals. Sharing is all-or-nothing within an account |
| **Moneyhub** | — | ⚠️ **Do not model as a live competitor. [VERIFIED]** Exited D2C Feb 2025; consumer app being **decommissioned 14 August 2026** |

### The couples specialists — a graveyard **[VERIFIED]**

| Product | Status |
|---|---|
| **Ivella** | **Dead.** Shipped the deepest yours/mine/ours architecture ever built — Personal, **Split**, and Joint Accounts plus Savings Pods. Failed acquisition, team joined EarnIn, final update 14 May 2024. **No surviving successor** |
| **Zeta** | **Dead.** 1M+ downloads at peak; users given 30 days to move funds, deadline ~9 May 2025; domain no longer resolves |
| **Honeydue** | **Alive but thinly maintained.** Still has **the most granular partner-privacy control found anywhere: a three-way per-account toggle — share everything / share balance only / hide entirely.** 2026 reviews report support "gone completely dark" |
| **Waypoint** (Canada) | Live, 2025, founded by a couple. **Private personal budget profiles alongside the shared household budget.** CAD $12.99/mo for 5 members |
| **Onward** | Real, $12.7M raised — but targets **co-parenting for separated parents**, not intact couples |

> **[INFERENCE] The lesson: couples-finance-as-neobank failed economically even with good feature
> fit. What replaced it is couples support as a *feature* of a generalist budgeting app — cheaper to
> run and systematically shallower.** That is the opening.

---

# Part 3 — Feature matrix

**Legend:** **Strong** = shipped and good · **Partial** = exists but limited · **Weak** = nominal ·
**Absent** = verified not present · **?** = insufficient evidence, do not assume

## 3.1 Israeli products

| Feature | RiseUp | FamilyBiz | MyFinanda | Cal | One Zero | FIBI | Leumi | Pepper | PayBox |
|---|---|---|---|---|---|---|---|---|---|
| Cross-bank transaction sync | Strong | Strong | Strong | Strong | Strong | Strong | Strong | Absent | Absent |
| Manual / cash entry | **Absent** | Strong | Weak | Absent | Absent | Absent | Absent | Absent | n/a |
| Budgeting | Partial | Partial | Partial | Weak | **Absent** | Partial | Weak | Strong | Absent |
| Categorisation quality | Partial | **Weak** | Partial | Partial | Partial | Partial | Partial | Partial | Absent |
| Rules engine (editable) | ? | Weak | Weak | Absent | Absent | Absent | Absent | Absent | Absent |
| Safe-to-Spend | **Partial** (weekly, current month only) | Weak | Absent | Absent | Absent | Absent | Absent | Absent | Absent |
| Cash-flow forecast | Partial | Partial (paywalled) | Absent | Absent | Absent | Absent | Absent | Weak (scheduled only) | Absent |
| **Household sharing (two logins)** | **?** | **Strong** | **Absent** (shared login, admitted) | Partial (joint acct artifact) | Absent | ? | Absent | Absent | **Strong** (Box model) |
| Private-vs-shared visibility | Absent | **Absent** | Absent | Absent | Absent | Absent | Absent | Absent | Partial |
| Real-time alerts | Strong | Strong | Weak | Strong | **Strong** | Partial | Strong | Partial | Weak |
| WhatsApp | **Partial** (outbound only) | Absent | Absent | Absent | Absent | Weak | Absent | Absent | Absent |
| AI assistant | Weak | Absent | Absent | Absent | **Strong** | Weak | **Partial** (new) | Absent | Absent |
| Household benchmarks | Absent | **Partial** | Absent | Absent | Absent | Absent | **Partial** (peer compare) | Absent | Absent |
| Subscription detection | Partial | Weak | Absent | **Strong** | **Partial** | Absent | Partial | Absent | Absent |
| Subscription cancellation | Absent | Absent | Absent | ? | Absent | Absent | Absent | Absent | Absent |
| Debt optimisation | Absent | Absent | Absent | Absent | Absent | Absent | Absent | Absent | Absent |
| Mortgage optimisation | **Partial** (paid human) | **Partial** (paid human) | Absent | Absent | Absent | Absent | Absent | Partial | Absent |
| Child savings / חיסכון לכל ילד | Absent | Absent | Absent | Absent | Absent | Partial (product only) | Partial (product only) | ? | Partial (Box ילד) |
| Benefits / tax eligibility | Absent | Weak (referral) | Absent | Absent | Absent | Weak (human, retirement only) | Absent | Absent | Absent |
| Pension | Absent | **Strong** (מסלקה) | Absent | Absent | Partial | Absent | Absent | ? | Absent |
| Insurance | Partial (duplicate detection) | **Strong** | Absent | Absent | ? | Absent | Absent | ? | Absent |
| Financial health score | Absent | Absent | Absent | Absent | Absent | Absent | Absent | Absent | Absent |
| What-if simulator | Absent | Absent | Absent | Absent | Absent | Partial (FibiWise) | Absent | Absent | Absent |
| Financial twin | Absent | Absent | Absent | Absent | Absent | Absent | Absent | Absent | Absent |
| Action engine | Weak | Partial | Absent | Weak | **Partial** | Absent | Weak | Absent | Absent |
| Long-term family planning | Absent | Weak | Absent | Absent | Absent | Partial | Absent | Absent | Absent |
| **Installments (תשלומים) modelling** | ? | ? | ? | Partial (issuer-side) | ? | ? | ? | ? | n/a |
| **Overdraft as first-class object** | Partial | Absent | Absent | Absent | **Partial** | Absent | Absent | Absent | n/a |

## 3.2 International products

| Feature | Monarch | Copilot | YNAB | Rocket | Origin | Simplifi | Quicken | Emma | Cleo |
|---|---|---|---|---|---|---|---|---|---|
| Transaction sync | Strong | Strong | Strong | Strong | Strong | Strong | Partial | Strong | Strong |
| Budgeting | Strong | Strong | **Strong** | Weak | Partial | **Strong** | Strong | Partial | Weak |
| Categorisation | Strong | **Strong** | Weak | Partial | ? | Partial | Partial | Partial | Partial |
| Safe-to-Spend | Partial | Absent | Absent | **Partial** | ? | **Strong** | Partial | **Partial** | Absent |
| Cash-flow forecast | Partial (Plus) | **Absent** | **Absent** | Partial | ? | **Strong** | **Strong** | Partial | ? |
| Household sharing | **Strong** | **Weak** | **Strong** | Partial | **Strong** | Weak (1 person) | Absent | **Strong** | Absent |
| Private-vs-shared | **Absent** | Absent | Partial | Absent | **Partial** | Absent | n/a | **Partial** | n/a |
| WhatsApp | Absent | Absent | Absent | Absent | Absent | Absent | Absent | Absent | Absent |
| AI assistant | Partial | Partial | **Absent** | Absent | **?** (claimed strong) | Absent | Absent | Weak | **Weak** (narrates only) |
| Benchmarks | Absent | Absent | Absent | Absent | ? | Absent | Absent | Absent | Absent |
| Subscription detection | Strong | Strong | Absent | **Strong** | ? | Partial | Absent | **Strong** | ? |
| Subscription cancellation | Absent | Absent | Absent | **Strong** | ? | Absent | Absent | Partial | Absent |
| Debt optimisation | **Partial** | Absent | Weak | Weak | ? | **Absent** | Partial | Absent | Weak |
| Mortgage optimisation | Partial (Plus) | Absent | Absent | Absent | Absent | Absent | **Strong** | Absent | Absent |
| Child / family savings | Absent | Absent | Absent | Absent | Absent | Absent | Absent | Absent | Absent |
| Benefits / tax eligibility | Absent | Absent | Absent | Absent | Partial (filing) | Absent | Partial (reports) | Absent | Absent |
| Pension | Absent | Absent | Absent | Absent | Partial | ? | Strong | Absent | Absent |
| Financial health score | ? | Absent | Weak (Age of Money) | Weak | ? | Absent | Absent | Absent | **Weak** (gamified) |
| What-if simulator | Partial (Plus) | Absent | Absent | Absent | ? | Absent | **Strong** | Absent | Absent |
| Financial twin | Absent | Absent | Absent | Absent | Absent | Absent | Partial | Absent | Absent |
| Action engine | Weak | Weak | Absent | Partial | ? | Weak | Absent | Weak | Weak |
| Long-term family planning | Partial | Absent | Absent | Absent | Partial | Absent | **Strong** | Absent | Absent |

**Specialists for reference:** ProjectionLab / Boldin / MaxiFi — **Strong** what-if, **Absent**
transaction grounding. Undebt.it — **Strong** debt breadth at $10/year, manual entry only.
Sprive — **Strong** mortgage *action*, UK-only, overpayment only. Honeydue — **Strong**
private-vs-shared, dying. FinHealth Score — **Strong** methodology, survey-based and B2B only.

---

# Part 4 — Reading of the matrix

**Three columns are empty for every product in both tables:** financial twin, real transaction-driven
health score, and long-term family planning grounded in actual spending.

**Two rows are empty for every Israeli product:** debt optimisation and benefits/tax eligibility as a
*product* (as opposed to a commissioned human referral).

**The single most striking cell:** *Household sharing (two logins)* is **Strong** for only two
Israeli products — FamilyBiz and PayBox — and PayBox is a wallet, not a budgeting app. The category
leader's mechanism is **unverifiable from outside**.

**The clearest imported gap:** every international product with strong household support (Monarch,
YNAB, Emma, Origin) is **structurally unavailable in Israel** because no aggregator covers Israeli
banks. Riseup's English expansion targeting **UK banks rather than Israeli ones** is a quiet but loud
signal about where connectivity is easier.

**The clearest local advantage:** Israel already has an **API-accessible pension clearing house**.
The UK is still building pensions dashboards; the US has nothing; the EU's FIDA is 1+ years out.
Israel is behind on the data pipe and the product layer, but **ahead on pension infrastructure** —
and has **structurally harder versions** of the two problems (mortgage optimisation,
installment/overdraft cash flow) where international products are weakest anyway.
