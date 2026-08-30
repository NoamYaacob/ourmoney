# OurMoney — S4 "Living Money" Review

**Status:** One chosen, highly resolved product prototype. No production code changed, no direction implemented, no Checkpoint 8 started.
**Source:** Full interactive version published as a Claude Artifact ("S4 — Living Money"). This document plus `screenshots/` and `MANIFEST.md` are a static export for independent (ChatGPT) review.
**Branch:** `design/mobile-redesign` — not merged to `main`.

**A correction from the prior checkpoint's summary, disclosed up front:** while preparing this export, a real bug was found in the published artifact — 13 instances of a missing closing `</div>` on gallery wrappers were silently corrupting the document's structure (most visibly, two prototype frames were rendering roughly 4x too tall, absorbing unrelated downstream content into their own box). This was a pure HTML-closure bug, not a design or content issue — fixed by adding the missing tags only, zero visual/copy/data changes — and the live artifact was republished with the fix before this export was captured. Separately, the prior checkpoint's summary overstated what was actually built: it claimed "Household Lens ×3, Goal Trajectory ×3" as distinct interactive states. In fact, **Household Lens has no rendered instance anywhere in the S4 artifact** (only prose descriptions), and **Goal Trajectory exists in only two states** (on track, embedded in the Normal Home composition; behind, embedded in the Stress composition) — "ahead" was never built. Both gaps are documented honestly below and in `MANIFEST.md`, per this checkpoint's own instruction not to fabricate states that don't exist.

---

## 1. S4 product thesis

S4 is not a fourth alternative direction — it combines S1's glanceability, S2's causal storytelling, and a restrained version of S3's household lens into one system, built from the Signature Experience Lab's six primitives, each redesigned against a specific weakness the Lab's own hostile review found.

Home must answer, in order of visual weight:
1. What is truly safe to spend? — the boundary instrument, not a progress bar.
2. Why is that the number? — the boundary itself, plus a one-tap deterministic receipt.
3. What changed since I last checked? — one dominant headline change with its cause.
4. What's going to happen next? — Money Journey as the central causal canvas.
5. What deserves attention? — appears only when real, no permanent empty-alert space.
6. Are we progressing toward what matters? — Goal Trajectory, an arrival-date sentence first.
7. Whose activity is this? — a screen-state lens (שלנו/שלי/שלך), not a permanent color system.

**The one-system rule:** Safe-to-Spend, the boundary, and Money Journey share one unbroken canvas, one navy accent, and no card border between them. (An earlier draft of this checkpoint's own caption overclaimed a specific pixel alignment between the boundary's "free" edge and the journey's "today" node — caught and corrected before publishing; the true, defensible claim is the shared canvas/accent/no-seam property, not a specific alignment.)

---

## 2. Visual grammar

Deliberately narrower palette than the Lab: ledger navy for identity, amber for change/attention, no third hue system for מי/שלך/שלי at all. Identity now comes from geometry — the boundary's texture (hatch vs. solid), the Money Journey waterfall ticks' up/down direction, and the headline-first Pulse/Goal treatment — verified to survive both a logo-off read and a monochrome test, including Household Lens, the one primitive the Lab's own review found failed monochrome.

---

## 3. Safe-to-Spend design

**Lab weakness fixed:** the split-fill capsule still read as a progress bar. The boundary now uses a textured "protected" zone (diagonal hatch — reads as "claimed," not "unfilled") against a solid "free" zone, with both labels ("מוגן ₪12,687" / "פנוי ₪4,298") always visible, not revealed only on hover. Tapping opens a deterministic receipt using `calculateSafeToSpend`'s real breakdown fields — recurring commitments ₪9,384, ארנונה ₪1,224, open installments ₪2,079, summing to ₪12,687 protected. See `safe-to-spend-boundary-default.png` and `safe-to-spend-boundary-receipt-expanded.png`.

**Residual risk (from the hostile review):** under fast, careless scanning a first-time viewer could still misread the boundary as "percent of a budget used" until they notice the hatch texture — worth user-testing.

---

## 4. Money Journey design

**Lab weakness fixed:** causality required a tap-to-read tooltip. Every node now carries its event name, signed delta, and resulting balance directly in the geometry — a waterfall tick beneath the path shows previous→delta→new as one connected mark, readable without touching anything. Clicking a node emphasizes its tick and dims the rest (see `money-journey-default-unselected.png`, `money-journey-event-selected-mortgage.png`, `money-journey-low-point-selected.png`).

**Desktop/tablet:** the journey is the central canvas, using the full 1440px width — not a small widget among several.

**Mobile:** not the desktop chart shrunk down. The first viewport shows only the three strongest beats (today · low point · next salary); the full event-by-event breakdown, using vertical waterfall ticks read top-to-bottom like a receipt, is one scroll away (`money-journey-mobile-native.png`).

**Disclosed limitation, unresolved from the Lab:** the desktop journey's node x-spacing is schematic/even, not literally day-proportional. The production engine's `dailyPoints` already supports true proportionality — this is a prototype simplification, not a design decision to keep.

---

## 5. Financial Pulse design

**Lab weakness fixed:** the Lab's mini-metric/mini-bar treatment looked like analytics. S4 shows one dominant headline change ("₪620 פחות פנויים מאז הפעם האחרונה") with its one causal sentence ("הסיבה העיקרית: חיוב אשראי של ₪1,840") directly beneath, then two quiet secondary lines in smaller type. No metrics grid. Visible embedded in the Normal and Stress Home compositions (e.g. `normal-desktop-1440-light.png`).

**Not built as a standalone, dedicated primitive showcase** — unlike Safe-to-Spend and Money Journey, Financial Pulse has no isolated prototype frame of its own in this artifact; it only appears as part of the Home compositions. No "Pulse expanded" interaction exists to capture.

**Engine requirement, unchanged from two prior checkpoints:** the "since last visit" delta needs a persisted "last-seen snapshot" mechanism that does not exist in production today.

---

## 6. Household Lens

**What the artifact actually contains: prose only.** The thesis, visual grammar, hostile review, and implementation map all discuss the textual-attribution redesign ("משכנתא / חשבון משותף · שלנו" instead of colored rails) — but **no screen in the S4 artifact renders a household-attribution row, and no שלנו/שלי/שלך switcher was built**, live or static. This is a real gap between the checkpoint's brief and what was actually built, not an export limitation — there is nothing to capture. **No Household Lens screenshots are included in this package.** If this primitive is wanted for the next iteration, it needs to actually be built as a visual/interactive element, not just specified in prose.

---

## 7. Goal Trajectory

**Lab weakness fixed:** replaced percentage-complete as the main story with an arrival-date sentence first, a pace-guide chart second.

**What actually exists:** two states, both *embedded within Home compositions*, not from a dedicated interactive Goal Trajectory prototype:
- **On track** — "בקצב הנוכחי: תגיעו ליעד בזמן" — appears in the Normal Home composition. Extracted as `goal-trajectory-ontrack-extracted-from-normal.png`.
- **Behind** — "בקצב הנוכחי: תאחרו את היעד בכ-2 חודשים" — appears in the Stress Home composition. Extracted as `goal-trajectory-behind-extracted-from-stress.png`.
- **Ahead — does not exist anywhere in the artifact.** No image is included for it; documented here as absent, not fabricated.

**Engine requirement — an honest, important gap:** `calculateSavingsPace` does not track historical actual savings *rate* today; "on track" currently means only that the deadline hasn't passed and the required-monthly math still works, not a trend judgment. Projecting "a month early/late" at the household's *actual* recent pace needs a new, small, deterministic derived calculation that does not exist in production. This must be resolved — or the headline copy softened to match what's actually computable — before implementation.

---

## 8. Single Purchase Impact Check

**Approved in principle for the roadmap, narrow scope only** — one purchase amount, temporary recompute, nothing persisted. Not a Financial Twin, not multi-scenario. Live and fully interactive in the artifact: type an amount, see the resulting Safe-to-Spend, the projected future low point, and a plain-language verdict. Captured at `impact-check-safe-800.png` (₪800 → "כן, זה נכנס", cushion ₪1,340) and `impact-check-unsafe-2500.png` (₪2,500 default → "לא כדאי כרגע", -₪360).

**Calculation is near-free technically:** a pure re-invocation of `calculateSafeToSpend`/`calculateCashFlowForecast` with one synthetic, non-persisted line item — both are already pure functions accepting explicit inputs.

**What still needs product work, not engine work:** the exact verdict thresholds ("cushion" language, what counts as "not worth it") need explicit definition before implementation, not inference from this prototype's illustrative copy.

**Misleading-simplification risk, flagged in the hostile review:** the "future low point" figure assumes the purchase's cash impact carries through one-for-one — reasonable for a single immediate outflow, but doesn't model a purchase that itself recurs or is financed in installments. The current copy doesn't disclose this assumption clearly enough.

---

## 9. Hostile review findings (full table in the artifact's own Hostile Review tab; key items below)

- **Did we just create prettier charts?** No — the boundary and journey both changed in kind (texture encodes claimed-vs-liquid; the journey mark encodes delta+balance), not just style.
- **Is Home still secretly six cards?** No for the top system (hero+boundary+journey, one continuous canvas, no internal borders). The bottom band (Pulse + Goal) is two zones separated only by a column gap — still, honestly, two things next to each other, the limit of "connected, not merged."
- **Is desktop genuinely using 1440px?** Yes — the journey spans the full canvas with room for real event labels.
- **Is tablet actually designed?** Yes — a genuine two-column header composition distinct from mobile's stack and desktop's continuous canvas.
- **Is stress calm?** Yes — no red flood; factual copy ("חודש צפוף," not "אזהרה"); the low-point crossing zero is shown as a shaded band, not a color change to the whole screen.
- **Does removing brand color destroy the identity?** No — verified: boundary texture, waterfall tick direction, and headline-first Pulse/Goal treatment all survive grayscale.
- **Is anything misleading?** The Impact Check's one-for-one cash-impact assumption (see §8) — flagged, not hidden.

---

## 10. Implementation map

| Element | Class | Notes |
|---|---|---|
| Safe-to-Spend receipt | A · presentation only | `calculateSafeToSpend`'s existing breakdown fields map directly to the receipt rows. |
| Safe-to-Spend boundary instrument | A · presentation only | Same engine output, new visual only. |
| Money Journey (desktop/tablet, full causal path) | B · existing engine, new composition | `calculateCashFlowForecast`'s `dailyPoints`/`events` supply every value; the waterfall-tick chart component itself is new. |
| Money Journey (mobile 3-beat preview) | B · existing engine, new composition | Same data source, a second purpose-built compact renderer. |
| Financial Pulse — "since last visit" delta | D · needs persisted state | Requires a stored "last-seen" snapshot to diff against. Does not exist in production. Unchanged finding across three checkpoints now. |
| Financial Pulse — causal drill-down | C · needs small new derived state | Once a snapshot exists, attributing a delta to specific transactions is a small new derivation, not a new engine. |
| Household Lens | — · not built this round | No visual/interactive element exists to classify. Prose-only in this checkpoint. |
| Goal Trajectory — pace-guide vs. required pace | A · presentation only | `calculateSavingsPace`'s existing `requiredMonthlyAgorot`/`isOnTrack` maps directly to the guide line and position. |
| Goal Trajectory — "arrive a month early/late" headline | C · needs small new derived state | Honest gap: the engine doesn't track actual historical pace today. See §7. |
| Single Purchase Impact Check — recompute | B · existing engine, new composition | Pure re-invocation of existing pure functions with one synthetic input. |
| Single Purchase Impact Check — product surface | E · needs product work | Verdict thresholds and copy need explicit definition, separate from visual design. |

---

## 11. Engine/state requirements — the two real pieces of new work, named plainly

1. **A "last-seen snapshot" mechanism** for Financial Pulse — small, deterministic, no AI, needed regardless of which Home direction is chosen; flagged in three consecutive checkpoints now, still not built.
2. **An actual-savings-pace derivation** for Goal Trajectory's arrival-date headline — a new small pure function reading recent transaction history for a goal's linked contributions. Does not exist today; "on track" currently means something narrower than what S4's headline copy implies. Must be resolved, or the copy softened, before implementation.

Everything else classified A or B requires no new engine work — only new UI composition over data the engines already produce.

---

## 12. Remaining concerns (in priority order)

1. **Household Lens was specified but never built** in this checkpoint — the biggest gap between the brief and the artifact. Needs to actually be designed and prototyped before it can be evaluated, not just described in prose.
2. **Goal Trajectory "ahead" was never built** — only 2 of 3 requested states exist, and both exist only incidentally (embedded in Home, not from a dedicated interactive demo).
3. **Goal Trajectory's arrival-date headline overclaims what the engine can compute today** (§7, §11) — a real product-vs-engine mismatch that needs resolving before implementation, not just before shipping copy.
4. **The Impact Check's one-for-one cash-impact assumption** is under-disclosed in its current copy (§8).
5. **Money Journey's node spacing is schematic, not day-proportional** — a known, disclosed prototype simplification.
6. **This checkpoint found and fixed a structural HTML bug** in the published artifact (13 missing closing tags) that had gone undetected through the prior checkpoint's own review — a reminder that even careful prior verification (console-error checks, interaction smoke tests) can miss whole-document structural defects that only surface under close visual inspection or automated DOM balance-checking.

---

## 13. What was NOT done, per explicit instruction

- No production code was modified.
- No direction was implemented.
- Checkpoint 8 was not started.
- No S5 was created.
- No state was fabricated to round out a requested count — where a requested state (Household Lens ×3, Goal Trajectory "ahead") does not exist in the artifact, it is documented as absent here and in `MANIFEST.md`, not invented for this export.

**Total real, distinct states exported: 24** (not 26 — see the correction at the top of this document for exactly which two requested states do not exist and why).
