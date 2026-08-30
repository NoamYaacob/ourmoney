# OurMoney — Living Money Finalization Review

**Status:** Finalization checkpoint on the approved S4 "Living Money" direction. Exactly three items resolved (Household Lens, Money Journey final pass, Goal Trajectory truthfulness). No production code changed, no direction implemented, no Checkpoint 8 started, no S5 created.
**Source:** Full interactive version published as a Claude Artifact ("Living Money — Finalization") at `https://claude.ai/code/artifact/4033c11b-ca79-4330-a7d9-77ce73dee2d6`. This document plus `screenshots/` and `MANIFEST.md` are a static export of that exact, unmodified artifact for independent (ChatGPT) review.
**Branch:** `design/mobile-redesign` — not merged to `main`.

**Everything outside these three items was deliberately left untouched**, per instruction: Safe-to-Spend, the protected/free boundary, Financial Pulse's model, the Impact Check product decision, S4's overall Home structure, tablet direction, dark-mode direction, and the empty/stress-state tone are all exactly as previously approved. They appear in this export only where a finalization item incidentally sits on the same canvas (e.g. Household Lens shown on the same Home composition as the boundary and Money Journey).

---

## 1. Household Lens decisions

**The problem being fixed:** the prior S4 checkpoint's own review found that "שלנו / שלי / שלך" was fully specified in prose but never actually built — no screen rendered it, live or static. This checkpoint builds it for real.

**Design decisions:**
- **שלנו is the default and the only lens with a genuinely shared story** — the hero Safe-to-Spend number (₪4,298) and the Money Journey's shape are identical across all three lens states. This isn't an implementation shortcut; it's the deliberate extension of "Safe-to-Spend is one household number" to the trajectory that produces it — a pooled-cash concept can't honestly have a personal version.
- **The lens is screen state, not row decoration.** Switching it changes: a heading line ("פעילות משותפת" → "הפעילות שלך (נועם)" → "הפעילות של דנה"), which rows are bold/primary vs. dimmed, row order (matching-lens rows float to the top), and which item appears in the attention/insight slot. It does **not** change the hero number, does **not** filter anything out of the DOM (dimmed rows stay visible, matching ADR-029's current "every member sees every row" reality), and does **not** repaint rows with member colors.
- **Attribution copy is two lines of plain text**, not a colored pill or rail: a title line, then a muted "who" line — "משכנתא / חשבון משותף · שלנו", "חדר כושר / נועם", "ביטוח בריאות / דנה" — exactly the restrained pattern specified.
- **Shown on four real surfaces**, not just Home: the Home/Money Journey composite (hero + boundary + journey + commitments + attention, all on one canvas), a dedicated mobile three-up, a live transactions list, and the attention slot embedded in the desktop composite.
- **Explicitly not built:** any settlement/who-owes-whom calculation, any second Safe-to-Spend, any implied visibility restriction. None of these appear anywhere in the artifact.

---

## 2. Money Journey before/after rationale

**Before (S4, approved as a concept, criticized on execution):** a thin uniform line with small circular nodes; event name, delta, and resulting balance were three separate floating text lines positioned above or below each dot. The line carried the trajectory; the text separately explained it next to it — two visually distinct systems side by side, which is what read as "line chart + annotations" under close review.

**After (this pass):** each inter-node segment is now drawn as a thick ribbon whose color (green = inflow, maroon = outflow) and **thickness** (proportional to the delta's own magnitude) *is* the event — a large salary or a large charge visibly widens the path itself, not just a label near it. The delta value is printed **along the ribbon**, not floating beside a dot. Each node carries a solid balance **chip** — a small rounded tag that reads as threaded onto the path, not free text positioned in space nearby. The low point breaks the pattern with a distinctly larger amber chip.

**Why this is more causal / less chart-like:** in the "before" version, understanding "this event caused this balance" required visually associating three separately-positioned text elements with one dot. In the "after" version, the ribbon segment *is* the event (its own geometry encodes direction and magnitude before any text is read), and its two endpoint chips *are* the before/after balance — the causal relationship is now expressed through connected shape, not through proximity between a mark and nearby labels.

**What stayed the same, per the "keep locked" instruction:** the causal concept itself, the calm negative-future treatment (a shaded band, not a red flood — see the stress capture), the low point's distinct-but-not-alarming treatment, and the click-to-emphasize interaction model (dim everything except the selected event's ribbon and both its chips).

**Honestly disclosed rendering note:** in the captured stress-state screenshot, the "חופשה משפחתית -₪8,500" label chip and the "נקודה נמוכה -₪1,890" chip sit close enough to visually overlap at their edges. This is a real characteristic of the published artifact as captured, not a screenshot artifact — it was not corrected during this export, per the explicit instruction not to change, improve, or regenerate anything while exporting. Worth a minor spacing fix in a future pass.

---

## 3. Goal Trajectory engine truthfulness findings

`lib/engines/savings/calculateSavingsPace.ts` was read directly (read-only; not modified) to check every copy string against what it can actually prove.

**Exact `calculateSavingsPace` limitations, read from source:**
- `isOnTrack` is **not** a comparison against a historical savings rate. The engine's own header comment states this explicitly: this app has no time-series of "how much was saved when" — a manual goal's `current_agorot` is a single live value with no history, and reconstructing a linked-account goal's balance history from its transaction log is a materially larger feature this function deliberately does not attempt.
- `isOnTrack` means only: the deadline (`targetDate`) has not yet passed, **and** the remaining amount is still mathematically reachable by saving `requiredMonthlyAgorot`/month starting now. It is a feasibility check, not a trend judgment.
- `isOverdue` is a hard, already-known fact: `today > targetDate` and the goal is still incomplete. It is **not** a projection of a new arrival date — the function returns no such date, by design.
- `requiredMonthlyAgorot` is computed as `Math.ceil(remainingAgorot / monthsRemaining)`, always rounded up — deliberately, so the suggested monthly figure is never silently insufficient.
- When `remainingAgorot === 0` (the goal is already funded), the function returns `isOnTrack: true` regardless of the date — this is a plain fact, not a rate-based inference, and is honestly usable to represent "goal complete before the deadline."

**The overclaiming string that was found and removed:** "בקצב הנוכחי: תאחרו את היעד בכ-2 חודשים" — this asserts a specific projected new arrival date, which the engine has no way to compute. It has been replaced throughout with copy that states only what `isOverdue`/`isOnTrack` actually assert.

**Approach chosen: A (presentation-only safe copy), not B (a derived calculation).** A sound "expected arrival date" derivation would require either a persisted contribution-history snapshot (new state, out of scope) or an assumption the engine's own documentation already rejects as unsound (e.g., "linear progress since goal creation" — arbitrary, and could be badly wrong for a lump-sum deposit in month one). No small derived calculation is honestly available from today's inputs without inventing state.

**The three states shown, with the exact copy used:**
1. **On track** — "אתם בקצב הנדרש להגיע ליעד בזמן" — directly restates `isOnTrack === true`. Required monthly pace (₪767) shown, computed as `ceil((12,000−7,400)/6)`, matching the real fixture goal (חופשה ביוון) exactly.
2. **Overdue** (the only truthful "behind" signal) — "התאריך היעד עבר והיעד עדיין לא הושלם" plus an explicit "לא ניתן לקבוע תאריך הגעה חדש מהנתונים הקיימים" (a new arrival date cannot be determined from existing data) — stating the fact the engine knows and explicitly declining to project what it doesn't.
3. **"Ahead" → shown as "goal complete before the deadline"** — "השגתם את היעד — נשאר זמן עד התאריך שקבעתם" — using `remainingAgorot === 0` while `today < targetDate`, both facts the engine already returns. A true "saving faster than the required pace" signal was **not** built — see below.

**Why a true "ahead of pace" state was not built:** it would require the same historical contribution-rate data that `isOnTrack` already explicitly disclaims not having. Showing it anyway — even as a visually distinct third state — would have violated this checkpoint's own truthfulness rule. The "goal already complete" state shown instead is a genuine, different, engine-honest positive signal that hadn't been demonstrated before this checkpoint.

---

## 4. Implementation classification

| Element | Class | Notes |
|---|---|---|
| Household Lens — hero number, journey shape (unchanged across lenses) | A · presentation only | No new computation — the same already-bound values are read three times. |
| Household Lens — row emphasis/reorder by lens | B · existing engine + composition | Uses existing `is_shared`/`payer_id`; the emphasis/reorder logic is new but trivial presentation code. |
| Household Lens — attention item varies by lens | B · existing engine + composition | Filters the existing alert list by the same attribution fields — no new alert logic. |
| Money Journey — ribbon/chip rendering | B · existing engine + composition | `calculateCashFlowForecast`'s existing `dailyPoints`/`events` supply every value; only the chart component itself is new (thickness mapped from each event's own delta magnitude). |
| Money Journey — selected-event emphasis | A · presentation only | Pure client-side interaction state, no data dependency. |
| Goal Trajectory — "on track" copy + required-monthly pace guide | A · presentation only | `isOnTrack`/`requiredMonthlyAgorot` used exactly as returned. |
| Goal Trajectory — "overdue" copy | A · presentation only | `isOverdue` used exactly as returned; no new date projected. |
| Goal Trajectory — "goal complete before deadline" copy | A · presentation only | `remainingAgorot === 0` plus `today < targetDate`, both already-known facts. |
| Goal Trajectory — true "ahead of actual pace" signal | E · not pursued | Would require a persisted contribution-history feature, explicitly out of scope; correctly not built rather than faked. |
| Financial Pulse "since last visit" (carried over, unchanged status) | D · needs persisted state | Still needs the persisted last-seen snapshot flagged across four consecutive checkpoints now. Not part of this checkpoint's three-item scope. |

---

## 5. Migration-readiness verdict

**Yes — Living Money is ready for production migration planning**, with one honestly-named, unchanged exception carried forward rather than hidden.

- **What remains prototype-only (visual/composition work, no data dependency):** the ribbon/chip Money Journey chart component; the Household Lens emphasis/reorder UI; all Goal Trajectory copy strings, now finalized as engine-honest text.
- **What requires new state:** only Financial Pulse's "since last visit" snapshot (class D) — unchanged from three prior checkpoints, not part of this round's three items, still the single biggest remaining engine gap in the whole Living Money direction.
- **What requires engine work:** none of the three finalization items require new engine logic. The one thing that would (a true actual-pace-derived "ahead" signal) was deliberately not pursued rather than faked, and is not required for migration — the shipped Goal Trajectory copy is fully truthful without it.
- **What requires no backend change at all:** Household Lens (existing `is_shared`/`payer_id`), Money Journey (existing `calculateCashFlowForecast` output), and two of Goal Trajectory's three states (on track, overdue) — all class A/B, pure composition over data the engines already produce.

---

## 6. Remaining production requirements

1. **Financial Pulse's persisted "last-seen snapshot"** — small, deterministic, no AI, still not built. This is the one genuine engine/state gap in the entire Living Money direction as it stands today.
2. **Money Journey's node/ribbon spacing is schematic, not day-proportional** in this prototype — the production engine's `dailyPoints` already supports true date-proportionality; the real chart component should use it rather than the prototype's even spacing.
3. **The Money Journey stress-state chip overlap** noted in §2 — a minor spacing fix, not a structural issue.
4. **Goal Trajectory's copy softening is final and should ship as-is** — no further engine work is a precondition for migrating this specific piece; the "ahead of actual pace" gap is a permanently deferred feature, not a blocker.
