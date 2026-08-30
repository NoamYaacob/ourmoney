# OurMoney — Product + Experience Direction

**Status:** Concept review package. No production code changed. No direction implemented or approved yet.
**Source:** Full interactive version published as a Claude Artifact during this checkpoint (concept mockups, not production screens). This document plus `screenshots/` and `MANIFEST.md` are a static export of that artifact for independent (ChatGPT) review.
**Branch:** `design/mobile-redesign` — not merged to `main`.

This checkpoint was explicitly scoped as research and concept work, *before* any further route-by-route polishing ("Checkpoint 8"). The brief was: don't make OurMoney prettier — figure out why a household would choose it, understand its value in minutes, and keep using it with their partner.

---

## 1. Product thesis

> OurMoney tells a household what it can safely do with its money now, what is going to happen next, and what deserves attention — together.

This thesis was checked against the actual engine inventory (`lib/engines/`) rather than accepted at face value. The finding: it is **not aspirational** — three of its four core questions are already fully answered by deterministic code running in production today. The gap is presentation, not capability.

| Question | Answered today by | Status |
|---|---|---|
| מה באמת פנוי לנו? (What's really available?) | `calculateSafeToSpend` | Already OurMoney's most proprietary number — no competitor researched (including 2025–26 award-winner Copilot Money) ships a clean forward-looking day-by-day safe-to-spend trajectory. |
| מה הולך לקרות לכסף שלנו? (What's coming?) | `calculateCashFlowForecast` | Day-by-day projected balance, exact low-point date/amount, already visualized correctly (solid-actual / dashed-forecast). |
| מה השתנה ודורש תשומת לב? (What changed?) | `buildFinancialAlerts` (9 detectors) | The single biggest gap between what's computed and what's shown — currently one dashboard panel, not a first-class experience. |
| האם אנחנו מתקדמים? (Are we progressing?) | `calculateSavingsPace` + budget pace | Partial — per-goal detail exists, no cross-goal household trajectory view. |
| מה שלי/שלך/שלנו? (household layer) | `is_shared`, `payer_id`, dormant `owner_id` | Data exists; zero presentation layer today. Cross-cutting lens, not a sixth screen. |

**Sharpened conclusion:** the five questions are a correct mental model but a wrong literal five-tab IA. Q1–Q3 are one connected ledger story; Q5 is a lens applied everywhere (household consent in Israel is per-individual, so a shared ledger can only ever be built at OurMoney's aggregator layer, never a bank's — this is the real structural moat). The three directions below resolve this differently.

---

## 2. Retention model

No streaks, no badges, no re-engagement notifications ("we miss you"). Every return-trigger must trace, in one hop, to a real deterministic calculation changing.

| Stage | What creates the return | Powered by |
|---|---|---|
| First session | Real Safe-to-Spend + real 30-day low point, immediately, not a demo | exists today |
| First week | Budget pace projection switches on (needs 3+ elapsed days by design) | exists today |
| Daily, lightweight | Safe-to-Spend delta + unread "what changed" count | needs a snapshot/delta mechanism (new, small) |
| Weekly review | Pushed recap of what changed and whether the month is on pace | can be derived today (packaging only) |
| Monthly transition | New budget period opens with last month's pace as context | exists today |
| Event-driven | Price increase / obligation due / forecast crosses into shortfall | exists today (event + notification pipeline) |

Competitive grounding: YNAB's loop is forced trade-offs, not gamification. Monarch's Weekly Recap is a *pushed* artifact, not something the user must remember to check. Cleo's loop is personality-driven, which OurMoney's "deterministic-only, no fabricated intelligence" rule explicitly forecloses — the right call for a product whose pitch is trust.

---

## 3. "מה חשוב עכשיו" — proactive intelligence model

Every insight must answer, in order: **what happened → why it matters to this household → what can be done.** Audited item-by-item against the existing alert engine:

| Insight | Status |
|---|---|
| Recurring charge increased | exists today (`recurring_price_increase`) |
| Category spend changed materially | exists today (`category_spend_above_typical`) |
| Upcoming obligation changes the low point | exists today (`forecast_shortfall` / `upcoming_obligation`) |
| Safe-to-Spend changed meaningfully | **needs new state** — a persisted "last seen" snapshot to diff against |
| Category moving unusually fast | exists today (budget pace) |
| Installment about to end | can be derived today — new detector, same pattern as existing ones, no new engine |
| Goal falling behind / ahead | behind: exists; ahead: needs a symmetric threshold |
| Tight period from income + commitments | exists today (forecast's low-point date/amount) |
| Something changed since last visit | **needs new state** — same snapshot mechanism, generalized |

**Headline finding:** 7 of 9 example insights are buildable today from the existing 9-detector alert engine. The two new pieces both reduce to one capability: persisting a snapshot of the household's last-seen computed state. No AI, no new financial logic.

**Failure mode to avoid:** a scrolling list of everything the alert engine can produce, re-skinned as cards. The engine already ranks by severity — the experience's job is to surface the top 2–3 that matter, in one sentence each, and stop.

---

## 4. Household model (מה שלי / מה שלך / מה שלנו)

**What already exists, unsurfaced:**
- `is_shared` — real budget/analytics attribution (not cosmetic).
- `payer_id` — captured on every transaction, currently write-only.
- `buildUpcomingCommitments` — already splits every upcoming charge into `sharedAgorot` / `personalAgorot`.
- `owner_id` on accounts — schema + hook exist, zero consumers read it.

**What this must never become:**
- No who-owes-whom / settlement math — explicitly PayBox's territory (per `OUR_ADVANTAGES.md`), explicitly excluded from any direction below.
- No per-member Safe-to-Spend — forbidden by both CLAUDE.md and `calculateSafeToSpend`'s own scope guard.
- No visibility restriction — ADR-029 is frozen at shared/personal only; every household member sees every row today. No mockup implies hiding a transaction from a partner.

**The concept:** attribution as a lens (Monarch's "Owners" filter is the closest transferable pattern), applied to already-existing fields — not a new data model. Safe-to-Spend stays one household number; its *breakdown* can honestly show shared vs. personal reserved amounts, which `buildUpcomingCommitments` already computes per line item. Honeydue's most transferable idea is turning a shared transaction into the place a financial conversation happens (an in-line note), instead of a side-channel text message — small, low-risk, no new financial logic.

**Genuinely future work:** surfacing `owner_id` for account grouping (needs a settings UI to set the field); any per-member privacy (needs the ADR-029 schema that doesn't exist yet, and the still-open Q11 user research).

---

## 5. Decision tools

**Flagged tension, not resolved:** "Can we afford ₪2,500?" is technically almost free — re-run `calculateSafeToSpend` / `calculateCashFlowForecast` with one synthetic, non-persisted extra outflow. But CLAUDE.md's hard MVP constraints explicitly list **"No what-if simulator or Financial Twin."** A single-shot, non-persisted, single-expense affordability check is far smaller than a multi-scenario life-event simulator, but close enough to the literal constraint that it must not be built quietly. **This requires an explicit product-owner scope decision before implementation** — presented here as the strongest decision-tool candidate, not as an approved feature.

**Lower-risk decision interactions (no synthesized hypothetical, no scope conflict):**
- "When can we afford X goal?" — already fully answered by `calculateSavingsPace`.
- "Does this obligation fit?" — showing an obligation's effect on the forecast before it's marked upcoming.
- Budget headroom at the point of spending — surfacing "₪X left this category" at transaction entry.

---

## 6. Visual grammar

Not gradients or glassmorphism — a signature treatment per financial concept, and discipline about which numbers earn hero typography.

| Concept | Signature treatment | Status |
|---|---|---|
| Safe-to-Spend | The one number allowed true hero scale; a reserved/available proportion indicator beneath it | mostly exists (Direction D hero); indicator is new |
| Forecast | Solid actual / dashed projection / marked low point | already correct in `ForecastChart` |
| Goals | Target-date-aware ring with pace context, not a silent linear bar | new ring treatment over existing `calculateSavingsPace` data |
| Obligations | Urgency through time — `CountdownRing` | exists, underused beyond installments |
| Installments | Completion — `InstallmentTrack` | exists, correct |
| Recurring | Rhythm — cadence dots + a delta badge the moment a price changes | new, small primitive |
| Attention / alerts | Significance without panic — shape/icon carry severity, color only reinforces | pattern already established (`StatusChip`/`StatusDot`) |
| Household | A consistent attribution chip wherever `payer_id`/`is_shared` surface | new, small primitive |

**Number hierarchy discipline:** exactly one hero number per screen, answering that screen's core question; everything else drops to `figure`/`large`/`row`. The pattern to break: identical `SurfacePanel → title → amount → rows` regardless of what the number means.

---

## 7. Direction A — The Household Ledger, Sharpened

Evolves the approved Direction D Home. Keeps the current IA; gives Safe-to-Spend/forecast/attention one unmistakable visual language; threads a household filter through existing screens.

- **Thesis:** the household's real financial position is already computed better than anything in market — say so clearly, everywhere, without moving what users already know how to find.
- **Promise:** "Open it, and in three seconds you know exactly where you stand — and exactly what changed."
- **Home model:** hero Safe-to-Spend → dedicated "מה חשוב עכשיו" panel (ranked, not scattered) → goals/forecast summary — same skeleton as today, disciplined typography.
- **Household model:** a שלי/שלך/שלנו filter added to Transactions and the commitments list — a control, not a new screen.
- **Decision support:** none in v1; only the lower-risk items (goal pace, budget headroom).
- **Mobile:** current stacked-card composition, refined. **Tablet:** two-column (hero+attention / forecast+goals). **Desktop:** three-zone layout exploiting width without new content.
- **Survives intact:** every current route; Checkpoint 6/7 detail screens.
- **Needs rethinking:** Home's attention panel becomes a full screen; Safe-to-Spend detail gains the proportion indicator; Recurring gains the cadence/delta primitive.
- **Not building:** any new nav tab, any settlement mechanic, any per-member split.
- **Risk:** safest and fastest to ship, but risks staying "a very good dashboard" rather than answering the brief's central challenge.

## 8. Direction B — Ask OurMoney (One Running Story) — *recommended base*

Fuses Safe-to-Spend, the forecast, and "what changed" into a single vertical narrative instead of adjacent dashboard cards.

- **Thesis:** a household doesn't think in tabs — it thinks "where do we stand, what's coming." One continuous narrative answers that in the order a person actually asks it.
- **Promise:** "Scroll once. You'll know where you stand, what's changing, and what to do."
- **Why it's differentiated:** no competitor researched (YNAB, Copilot, Monarch, Rocket Money, Cleo) presents cash position as a narrative feed instead of a dashboard grid.
- **Home model:** hero → one sentence on why it moved → the forecast's shape → the 2–3 things that matter → goal trajectories, as one flow.
- **Household model:** a persistent שלי/שלך/שלנו toggle re-narrates the same flow from that lens, rather than a buried filter.
- **Decision support:** "Can we afford this?" as a quietly-present in-story action — pending the Section 5 scope decision.
- **Mobile:** the natural home for this direction. **Tablet:** a focused center column, not stretched into a grid. **Desktop:** narrative column + a persistent right rail for ranked insights/goals.
- **Survives intact:** every detail route — only the entry point changes.
- **Needs rethinking:** Home and Cash Flow effectively merge; Budget's role shrinks to "detail behind the story."
- **Not building:** a chatbot or conversational input — the "story" is a narrative voice, not literal Q&A (would require the excluded LLM/AI layer).
- **Risk:** the biggest IA change among the low/medium-risk options; needs real editorial discipline to avoid feeling like a wall of text; users who want to jump straight to "the budget screen" may feel the story is in the way.

## 9. Direction C — Two People, One Picture

The most substantial IA challenge. Household attribution becomes the primary navigational axis (שלי/שלך/שלנו first, category second), not a filter.

- **Thesis:** per-individual open-banking consent means no bank can ever build a shared household view — if that's the real moat, the structure should say so on every screen.
- **Promise:** "See your money, their money, and your money together — without ever feeling watched."
- **Home model:** three lensed tiers — שלנו (shared Safe-to-Spend + commitments) always first, שלי/שלך side by side.
- **Household model:** the core of the direction — שלנו/שלי/שלך as persistent tabs across every screen, built entirely from `is_shared`/`payer_id`/`owner_id` as they exist today.
- **Safe-to-Spend:** still one household number, never split; שלי/שלך show each partner's personal recurring/obligation load only (a subset `buildUpcomingCommitments` already sums).
- **Mobile:** a persistent top segmented control — the single most consequential mobile decision in this direction. **Tablet:** שלי/שלך genuinely side by side with שלנו as a header band. **Desktop:** three true columns always visible simultaneously — the philosophy's full realization.
- **Survives intact:** detail routes, with an added lens tag; engines unchanged.
- **Needs rethinking:** almost the entire navigation shell.
- **Not building:** any settlement calculation between שלי and שלך; any visibility restriction (both partners still see everything); no separate login/account split.
- **Risk:** highest implementation cost and biggest behavior change; risks manufacturing a "his and hers" framing a household may not actually think in; the segmented control is a permanent header cost on every screen; irrelevant to a household with only one active user.

---

## 10. Product gap matrix

| Concept | Status | Notes |
|---|---|---|
| Safe-to-Spend hero + proportion indicator | Exists today | Indicator is pure presentation |
| 30-day forecast, low point, shortfall date | Exists today | Already visualized correctly |
| "מה חשוב עכשיו" from existing 9 alert types | Exists today | Needs a dedicated surface + copy layer, not new logic |
| Installment-ending detector | Can be derived today | Same pattern as existing detectors |
| Goal "ahead of pace" symmetry | Can be derived today | Inputs already exist; only the threshold is missing |
| Safe-to-Spend delta since last visit | Needs new state | Persisted "last seen" snapshot to diff against |
| "What changed since last visit" diff feed | Needs new state | Same snapshot mechanism, generalized |
| Weekly recap (pushed) | Can be derived today | Packaging of existing weekly aggregates |
| שלי/שלך/שלנו filter on lists | Can be derived today | Uses existing `is_shared`/`payer_id` |
| Shared/personal reserved breakdown | Exists today | `buildUpcomingCommitments` already computes it |
| Accounts grouped by owner | Needs new state | `owner_id` exists but is write-only; needs UI to set it |
| In-line note on a shared transaction | Needs engine work | New table + UI; small in scope |
| Per-member Safe-to-Spend | Future / not planned | Conflicts with a hard CLAUDE.md constraint; not proposed |
| Who-owes-whom / settlement | Explicitly excluded | PayBox's territory; not proposed by any direction |
| Per-member visibility | Future | Needs the ADR-029 schema + Q11 user research |
| "Can we afford this?" affordability check | Needs a scope decision | Near-free technically; collides with "no what-if simulator" |
| Goal-pace / budget-headroom decision prompts | Can be derived today | Reframing of existing figures |
| Recurring cadence-dot + delta-badge | Can be derived today | New small component, existing data |
| Goal progress ring with pace context | Can be derived today | New component, existing engine output |

---

## 11. Final recommendation

**Recommended: Direction B's narrative structure, using Direction A's שלי/שלך/שלנו filter (not Direction C's full tab restructure) as the household mechanism.** This gets the genuinely differentiated "one running story" structure — which no researched competitor does — while keeping the household layer optional rather than a permanent structural cost on every screen. Direction C's deeper insight (attribution as identity, not filter) is worth revisiting once real usage data exists.

1. **What should OurMoney become?** The one place a household reads its real financial position as a coherent story, not a data-entry tool or category tracker.
2. **Strongest defensible differentiation?** The day-by-day forward-looking Safe-to-Spend trajectory, explained in plain language, plus a household model no bank can structurally build.
3. **Why use it every week?** The story changes every time something real changes, and OurMoney explains it in one sentence instead of requiring the household to notice it themselves.
4. **What would make them pay?** Trust earned by being consistently right about a number with real consequences — not any single feature.
5. **Overbuilt relative to value?** The Budget tab as a standalone destination — more useful woven into the story/alerts than visited as its own dashboard.
6. **Missing experience > another dashboard?** "מה חשוב עכשיו" as a first-class experience — buildable almost entirely from today's engines.
7. **Next three checkpoints, if approved:**
   - **Checkpoint 8** — "מה חשוב עכשיו" dedicated experience from the existing alert engine + שלי/שלך/שלנו filter on transactions/commitments.
   - **Checkpoint 9** — the Safe-to-Spend snapshot/delta mechanism + weekly recap.
   - **Checkpoint 10** — restructure Home into the narrative, folding in Cash Flow; separately, get an explicit product-owner decision on the affordability check before building it.

---

## 12. Constraints honored throughout (nothing above proposes otherwise)

- No production code changed to produce this document or the artifact it exports.
- No per-member Safe-to-Spend, no settlement/who-owes-whom mechanic, no visibility restriction — all explicitly excluded from every direction.
- No AI/LLM integration, no WhatsApp channel — retention and insight models are 100% deterministic and push-only.
- No what-if simulator built without an explicit scope decision (Section 5).
- Hebrew-first RTL preserved as a first-class constraint in every mockup.
- Every figure shown in the mockups is a verbatim value from `dev/designQaStressClient.ts` (household משפחת כהן־לוי) — nothing invented.
