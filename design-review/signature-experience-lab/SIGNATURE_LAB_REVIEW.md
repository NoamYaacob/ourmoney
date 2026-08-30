# OurMoney — Signature Experience Lab Review

**Status:** Isolated design/prototyping lab. No production code changed, no direction chosen, no Checkpoint 8 started.
**Source:** Full interactive version published as a Claude Artifact ("Signature Experience Lab"). This document plus `screenshots/` and `MANIFEST.md` are a static export for independent (ChatGPT) review.
**Branch:** `design/mobile-redesign` — not merged to `main`.

## Why this checkpoint exists

The prior "Product + Experience Direction" checkpoint validated OurMoney's product thesis and produced three IA directions (A/B/C), but the reviewer's conclusion was that none of the three was visually distinctive enough to approve: all three still relied on the generic pattern *canvas → card → title → number → rows → progress bar*. This lab stops designing full screens and instead designs **how money itself behaves on screen** — six signature primitives, tested individually, before any Home composition is built from them.

---

## 1. The six signature primitives

Each primitive was explored as 2–3 competing visual grammars before one was selected. Rejected sketches and the reason they lost are documented for every primitive in the artifact itself; summarized here.

### 1. Money Journey
A causal path through the next 30 days — not a line chart, not a transaction list. Time runs right→left (today at the RTL reading start). Every inflection point is a named, tappable node with a one-sentence explanation of what happens and why.

- **Rejected:** a generic line chart (no causal labeling — indistinguishable from any bank app), a six-bar chart (reads as spending-by-category, not a story about time).
- **Winning treatment:** a continuous labeled path with income/outflow nodes, an amber "low point" marker, and a light area-fill beneath the line.
- **States shown:** mobile light, mobile dark, desktop light, a "tight/negative future" variant (illustrating what the path looks like when a real large obligation — the ₪8,500 family vacation — lands in the same 30-day window and pushes the low point negative), and a tapped-node interaction state.
- **All figures real:** ₪16,985 available cash, ₪12,840 salary (נועם), ₪6,240 mortgage, ₪1,224 arnona, ₪2,140 low point, ₪13,950 next salary (דנה) — all verbatim fixture values or numbers already established in the prior checkpoint's artifact.

### 2. Safe-to-Spend Instrument
The calculation itself made visible — available minus protected equals free — before any caption is read.

- **Rejected:** a plain progress bar (reads as "% of budget used," not a subtraction), a vertical "water glass" (correct idea, but reads as a battery/loading indicator).
- **Winning treatment:** a horizontal split-fill capsule (dim "protected" segment, bright "free" segment) with an exact proportional boundary, and a tap-to-expand receipt listing exactly what's protected (₪9,384 recurring, ₪1,224 arnona, ₪2,079 open installments — summing to the ₪12,687 protected total).

### 3. Impact Preview — "אפשר להרשות לעצמנו את זה?"
**Flagged: design prototype only, requires explicit product-scope approval.** This directly re-triggers CLAUDE.md's hard MVP constraint "no what-if simulator or Financial Twin." A single-shot, non-persisted, single-expense affordability check is far smaller than a multi-scenario life-event simulator, but close enough to the literal constraint that it must not be built without an explicit decision.

- Live-computed in the artifact using this household's real numbers (client-side only, not wired to any production engine): typing an amount shifts a marker along the same forecast path and returns a plain-language verdict.
- **Safe example:** ₪800 → "כן, זה נכנס — גם אחרי ההתחייבויות נשארת כרית של ₪1,340."
- **Unsafe example:** ₪2,500 → "לא כדאי כרגע — הרכישה תכניס אתכם למינוס צפוי ב-28 לחודש (₪-360)."

### 4. Financial Pulse / "מה השתנה" / "מאז הפעם האחרונה"
"Since you were last here," as one glanceable horizontal strip — not stacked alert cards.

- **Rejected:** stacked alert cards (the exact pattern this checkpoint exists to escape).
- **Winning treatment:** a horizontal baseline with delta bars anchored by magnitude (Safe-to-Spend's own delta first: -₪620), each labeled with what changed.
- **Honest weakness (see Self-Review):** this is the primitive closest to "formatted text with bars attached" — flagged as needing another exploration round before being called finished.

### 5. Household Lens (שלנו / שלי / שלך)
A restrained attribution rail — a thin edge-stripe plus a one-letter avatar chip — not a colored pill on every row.

- **Rejected:** a colored pill on every row (loud, starts to feel like tagging/surveillance).
- **Winning treatment:** the rail+avatar pattern, applied identically to every list (commitments, transactions, accounts).
- **Honest weakness:** the one primitive that fails the pure-monochrome test outright — the three lenses rely on hue to distinguish at a glance. Mitigated, not solved, by the avatar-initial glyph (which still works in grayscale).
- **Hard limits respected:** no settlement math, no who-owes-whom, no per-member Safe-to-Spend, no visibility restriction (every member still sees every row, per ADR-029) — this is a presentation lens over `is_shared`/`payer_id`, which already exist.

### 6. Goal Trajectory
Where we are vs. where we need to be, over time — not a percentage. Built directly on `calculateSavingsPace`'s existing output.

- **Rejected implicitly:** the linear progress bar every competitor (YNAB, Monarch, Copilot) uses.
- **Winning treatment:** a diagonal pace-guide line from now to the target date/amount, with an actual-progress marker that sits above (ahead), on, or below (behind) the guide.
- **Three states, live in the artifact:** on track (₪7,400, guide-aligned), behind (₪5,600, below guide), ahead (₪9,100, above guide) — all using the real חופשה ביוון goal (target ₪12,000, 6 months).

---

## 2. Product personality, translated into decisions

| Trait | Rules out | Rules in |
|---|---|---|
| Calm, not empty | Sparse single-metric screens with nothing else on them | Generous space around one dominant shape per screen — never a blank canvas |
| Premium, not luxury-cosplay | Gold accents, serif wordmarks, gradient glass | Tabular numerals, consistent baseline grid, one restrained accent per surface |
| Intelligent, not pretending | Copy implying prediction/sentiment the engines don't do | Every visual encodes a real computed value; captions state the mechanism |
| Human, not chatty | Mascots, emoji-as-icons, "Hey there!" | Plain-spoken Hebrew, second-person plural, short declarative sentences |
| Financially serious, not accountant software | Dense grid tables as the primary surface | One typographic hero per screen; charts over tables wherever trend is the point |
| Household-oriented, not couples therapy | "We" language about feelings, guilt comparisons | Attribution is informational (whose activity), never evaluative |
| Proactive, not anxiety-inducing | Red badge counts, urgent push copy | Severity through shape/restrained color; every alert pairs with a next step |

---

## 3. Retention loop, built from the primitives

No streaks, no badges, no fabricated recommendations. Every trigger traces to a real deterministic state change.

| Trigger | What the user sees | Primitive used |
|---|---|---|
| Tomorrow | Pulse strip flat/quiet — itself informative | Financial Pulse |
| Next week | Pulse shows the week's net movement; Money Journey's low point has shifted | Pulse + Money Journey |
| After salary | Money Journey's "today" node jumps; Instrument's free segment widens | Money Journey + Instrument |
| After a large purchase | Pulse anchors on one large delta; tapping opens Money Journey's new low point | Pulse → Money Journey |
| After a subscription price increase | Small amber delta at the merchant; tapping explains in one sentence | Pulse |
| Near month-end | Goal Trajectory markers update; Money Journey shows the transition into next month | Goal Trajectory + Money Journey |

---

## 4. Competitive collision test

| Primitive | Common in market | What OurMoney does differently | Why it helps |
|---|---|---|---|
| Money Journey | YNAB/Monarch/Copilot all chart balance over time; none label causal events on the line | Every inflection point is named and tappable — the chart *is* the explanation | Removes the mental translation step between "the line moved" and "because of what" |
| Safe-to-Spend Instrument | PocketGuard's "In My Pocket" is the closest precedent — a single spendable number, no visible arithmetic | Shows the subtraction happening as one continuous shape, with a tap-through receipt | Trust is built by showing the work, not asking the user to believe a black-box number |
| Impact Preview | Simplifi's "Spending Plan" projects a monthly bubble but doesn't model a specific hypothetical against the forecast | Ties one hypothetical directly into the same forecast path used everywhere else | Turns a genuine research gap into a signature interaction — exactly why it needs scope sign-off rather than quiet inference |
| Financial Pulse | Every competitor uses a notification/alert-card feed (Rocket Money's is the most refined) | One horizontal, anchored, glanceable strip instead of a vertical stack | Structurally resists becoming an infinite anxiety feed |
| Household Lens | Monarch's Owners filter, Honeydue's three-way split — both use visible pills/tabs | A restrained edge-rail + single-letter avatar instead of a colored pill | Keeps attribution informational rather than loud/judgmental |
| Goal Trajectory | Every competitor researched uses a plain linear progress bar | A pace-guide diagonal with an above/below marker | Answers "will we actually make it?" at a glance, which a percentage alone cannot |

*PocketGuard's and Simplifi's specific mechanics are described from established public product knowledge, not freshly re-verified this round — flagged rather than presented as newly sourced fact.*

---

## 5. Three Home directions (S1 / S2 / S3)

Built only after the primitive exploration was complete. Same real household (משפחת כהן־לוי), same real numbers, three genuinely different compositional philosophies — not three color themes.

### S1 — Financial Instrument
Home behaves like a precision instrument. Safe-to-Spend and the trajectory dominate; everything else is secondary and quiet. Closest to a cockpit gauge.
- **Tablet:** two genuine columns (instrument + trajectory simultaneously visible) — its own composition, not inferred from mobile or desktop.
- **Desktop:** three zones (instrument / trajectory / goal), exploiting width rather than centering a card.
- **Best for:** glance speed. **Costs:** least narrative/explanation.

### S2 — Money Story
Home behaves like a story through time: now → changed → next → action.
- **Tablet:** keeps the single-column "reading" shape but widens margins and enlarges the trajectory graphic — deliberately not a second column, honoring the narrative philosophy at this width too.
- **Desktop:** a focused center column (not edge-to-edge) plus a supporting right rail — an honest exception to "use full width," disclosed as a deliberate choice in the Self-Review.
- **Best for:** explaining "why." **Costs:** a beat of extra reading time.

### S3 — Household Command Center
Home behaves like the household's shared money command center. Household attribution is structurally visible throughout, while Safe-to-Spend remains exactly one household-level number.
- **Tablet:** שלי and שלנו genuinely side by side — a two-column composition unique to this direction.
- **Desktop:** three true columns always visible simultaneously (שלך / שלנו / שלי) — the philosophy's full realization, only possible at this width.
- **Best for:** household legibility. **Costs:** least neutral for a single active user.

**All three shown at:** 390 mobile light, 390 mobile dark, 1024 tablet light (genuinely composed, not inferred in prose), 1440 desktop light, 1440 desktop dark.

---

## 6. Interaction behavior

Most interactions are **live in the published artifact** (not just storyboarded):

| Interaction | Live? | What moves | Duration class |
|---|---|---|---|
| Tap Safe-to-Spend → understand calculation | Live | Receipt reveals beneath the vessel; hero number and vessel never shift | 260ms height reveal |
| Tap a future event → see its effect | Live | Tapped node scales 1.0→1.15; caption fades in; path itself never redraws for a tap | 120ms |
| Switch שלנו/שלי/שלך | Live | List re-orders, non-matching rows dim to .35 opacity rather than disappearing | 200ms |
| Test a hypothetical purchase | Live | "After" dot slides along the line; verdict color crossfades | 260ms / 160ms |
| Inspect a goal trajectory | Live | Marker moves above/below the guide line, slight overshoot easing (a deliberate exception — showing real state change, not decoration) | 260ms |
| Expand "since last visit" | **Storyboarded only, not live in this artifact** | Would use a shared-element transform from the Pulse bar into the Money Journey view | 260ms |

---

## 7. Hostile self-review findings (run before presenting)

| Question | Honest answer |
|---|---|
| Does this still look like cards? | Mostly no. Money Journey, the Instrument, Pulse, and Goal Trajectory are shape-first. Household Lens list rows and S1/S3 commitments rows are still fundamentally rows-in-a-list — the correct choice for a list, but the weakest link against the "no cards" test. |
| Too much empty space on desktop? | S2 risks this by design — a centered narrative column at 1440px reads as more restraint than S1/S3. Worth user-testing rather than assuming restraint reads as premium universally. |
| Is desktop using width? | S1 and S3 yes (three genuine simultaneous zones). S2 is an honest, disclosed exception. |
| Is tablet its own composition? | Yes this round — each of S1/S2/S3 has a tablet layout that is neither a stretched phone screen nor a shrunk desktop screen. Not true of the prior checkpoint. |
| Is mobile dense enough without cramping? | Money Journey and the Instrument compress cleanly to 390px because they're single continuous shapes, not grids of numbers. |
| Does dark mode have designed surfaces? | Yes for the primitives (re-derived tokens, not inverted) — proven for Home-equivalent surfaces only, not every possible screen state. |
| Understand the most important thing in 3 seconds? | Yes for Safe-to-Spend. For Money Journey, the *shape* reads in ~1 second; a *specific* causal node needs a tap — an acceptable depth-on-demand trade. |
| Visualizing finance or formatting text? | Genuinely visualizing in 5 of 6 primitives. Financial Pulse is the closest to "formatted text with bars" — needs another exploration round. |
| Does every visual encode real information? | Yes, with one disclosed caveat: Money Journey's "several smaller charges" node bundles multiple real line items into one label, captioned as such. |
| Any misleading visualizations? | Money Journey's node x-spacing is even/schematic, not literally day-proportional — acceptable for a concept lab, would need to become literally time-proportional before shipping (the real engine's `dailyPoints` already supports this). |
| Any invented numbers? | No. Every figure is a verbatim fixture value or a number already established in the prior checkpoint's artifact. The Money Journey's exact intermediate running total is illustrative sequencing of real figures, disclosed in its own caption. |
| Did visual novelty hurt understanding? | Household Lens fails the pure-monochrome test — the one primitive where novelty trades against the "identity should survive monochrome" principle. Disclosed, not glossed over. |

---

## 8. Implementation requirements

| Primitive | Engine requirement | Risk |
|---|---|---|
| Money Journey | None new — `calculateCashFlowForecast`'s existing `dailyPoints`/`events` map directly to node positions | Low — primarily a React Native SVG/Skia charting effort |
| Safe-to-Spend Instrument | None new — `calculateSafeToSpend`'s existing breakdown fields feed the split-fill directly | Low |
| Impact Preview | **Collides with "no what-if simulator" hard constraint** | Blocked pending scope decision, independent of visual quality |
| Financial Pulse | Needs the "last-seen snapshot" mechanism flagged in the prior checkpoint's gap matrix | Medium — small, well-scoped, deterministic; not yet built |
| Household Lens | None new for transactions/commitments (`is_shared`/`payer_id` already exist); `owner_id` only if account grouping is pursued | Low for lists; medium for accounts (needs a UI to set the currently-dormant `owner_id`) |
| Goal Trajectory | None new — `calculateSavingsPace`'s existing output maps directly to guide-line vs. marker position | Low |

## 9. Scope approval requirements

- **Impact Preview / "אפשר לנו את זה?"** — collides with CLAUDE.md's "no what-if simulator or Financial Twin" hard MVP constraint. Flagged in both this checkpoint and the prior one. Not to be built without an explicit product-owner decision, even though it is the single most differentiated concept in this lab.

## 10. What would eventually change in production vs. what stays untouched

**Would eventually change:**
- Home's hero — from HeroPanel+Money+ProgressBar to the Safe-to-Spend Instrument.
- Cash Flow's chart — from the current solid/dashed line to Money Journey's node-labeled path (`calculateCashFlowForecast`'s output doesn't change, only its presentation).
- The dashboard's attention panel — from stacked cards to the Financial Pulse strip.
- Goal detail screens — from a linear `ProgressBar` to the Goal Trajectory treatment.
- Transactions/commitments lists — gain the Household Lens rail+avatar.

**Stays untouched:**
- Every form/entry flow (transaction, obligation, goal creation) — this lab is about presentation of computed state, not data entry.
- Settings, auth, onboarding, household/invite flows.
- The already-approved Checkpoint 6 detail screens' underlying logic and data — only the goal-progress visual component within them is a candidate for change.

---

## Final recommendation (as given, without choosing a Home direction)

All six primitives pass the logo-off test in some form; five of six pass the monochrome test outright (Household Lens is the disclosed exception). None of the three Home directions is definitively better — S1 optimizes for glance speed, S2 for explanation, S3 for household legibility. Recommended as the safest next step: **S1**, for lowest implementation risk and because every one of its primitives is already engine-backed. Flagged as the most strategically interesting if the household moat is the intended bet: **S3**. This is a genuine judgment call between different strengths — no direction was chosen on the user's behalf, per instruction.

**No production code was changed. No screen has been redesigned in production. Stopping here — no direction chosen, no implementation started, Checkpoint 8 not begun.**
