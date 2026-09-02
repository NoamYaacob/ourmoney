# Screenshot Manifest — Living Money Finalization

16 PNGs, exported by rendering the exact published artifact's HTML/CSS/JS locally in headless Chromium (Playwright) and screenshotting each frame element directly — not photos of the Claude Artifact UI. All Household Lens and Money Journey selected-event states shown here were produced by driving the artifact's own live JavaScript (clicking the same controls a reviewer would click), not by hand-editing anything. Captured at 2x device-scale-factor. A bounding-box sanity check (rejecting anything taller than 750px, since every frame in this artifact is fixed-height) ran before every capture to catch any mis-selection — none triggered; all 16 captures are confirmed correctly bounded. Full written context lives in `FINALIZATION_REVIEW.md` in this same folder.

Nothing was changed, improved, regenerated, or redesigned during this export. One pre-existing minor visual detail in the artifact (a chip-label overlap in the Money Journey stress state) is disclosed below and in `FINALIZATION_REVIEW.md` rather than corrected.

---

## HOUSEHOLD LENS (9)

| Filename | Surface | Lens state | Interaction | What to evaluate |
|---|---|---|---|---|
| `household-lens-desktop-shelanu.png` | Home composite (hero + boundary + Money Journey + commitments + attention) | שלנו (default) | Live — baseline, no click needed | Whether "shared household activity is primary" reads clearly; note the bold/emphasized commitment rows and the shared-relevant attention item (Netflix price increase). |
| `household-lens-desktop-sheli.png` | Same composite | שלי | Live — שלי clicked | Whether Noam-attributed activity (חדר כושר) becomes visually primary while shared items (משכנתא, ארנונה) recede but stay visible, and Dana's item (ביטוח בריאות) dims further. Check the heading text change and the attention item switching to Noam's gym renewal. |
| `household-lens-desktop-shelcha.png` | Same composite | שלך | Live — שלך clicked | Same evaluation, mirrored for Dana. |
| `household-lens-mobile-shelanu.png` | Mobile Home (compact) | שלנו | Static — a dedicated frame per state, not a live toggle | Whether the same emphasis logic holds at mobile width with less space. |
| `household-lens-mobile-sheli.png` | Mobile Home (compact) | שלי | Static | Same evaluation, שלי. |
| `household-lens-mobile-shelcha.png` | Mobile Home (compact) | שלך | Static | Same evaluation, שלך. |
| `household-lens-transactions-shelanu.png` | Transactions list (real fixture merchants: שופרסל דיל, מחשב נייד תשלומים, ויקטורי, סופר פארם) | שלנו | Live — baseline | Whether the same lens mechanism, applied to a different real list, stays consistent. |
| `household-lens-transactions-sheli.png` | Transactions list | שלי | Live — שלי clicked | Whether Noam's installment transaction (מחשב נייד) becomes primary. |
| `household-lens-transactions-shelcha.png` | Transactions list | שלך | Live — שלך clicked | Whether Dana's transaction (סופר פארם) becomes primary. |

**On all nine images:** confirm the Safe-to-Spend hero number (₪4,298, where shown) is identical regardless of lens — this is the single most important invariant this checkpoint was built to prove.

## MONEY JOURNEY (4)

| Filename | State | What to evaluate |
|---|---|---|
| `money-journey-desktop-normal.png` | Normal, no event selected (baseline) | Whether the ribbon-and-chip treatment reads as one connected causal shape rather than a line-plus-annotations chart; whether ribbon thickness visibly varies with each event's delta size. |
| `money-journey-desktop-stress.png` | Stress scenario (₪14,400 available, low point -₪1,890) | Whether the negative zone stays a calm shaded band with the same amber chip treatment, not a red flood. **Note:** the "חופשה משפחתית -₪8,500" and "נקודה נמוכה -₪1,890" chips visually overlap at their edges in this capture — a real, disclosed characteristic of the published artifact, not corrected during export (see `FINALIZATION_REVIEW.md` §2). |
| `money-journey-mobile-normal.png` | Mobile, compact | Whether the ribbon grammar compresses to mobile width without becoming a squeezed desktop chart. |
| `money-journey-selected-event.png` | A dedicated frame showing the mortgage event selected (not a live click on the normal-state frame — a separate static demonstration built for this purpose) | Whether the selected ribbon and both its endpoint balance chips stay full-strength while everything else recedes to ~30% opacity, and whether the previous→delta→new relationship reads as one geometric unit. |

## GOAL TRAJECTORY (3)

| Filename | State | Copy shown | What to evaluate |
|---|---|---|---|
| `goal-trajectory-ontrack.png` | On track (`isOnTrack: true`, `isOverdue: false`) | "אתם בקצב הנדרש להגיע ליעד בזמן" + required monthly ₪767 | Whether this states only what the engine can prove (deadline feasibility), never a rate judgment. Verify ₪767 = ceil((12,000−7,400)/6). |
| `goal-trajectory-behind-overdue.png` | Overdue (`isOverdue: true`) | "התאריך היעד עבר והיעד עדיין לא הושלם" + explicit "לא ניתן לקבוע תאריך הגעה חדש מהנתונים הקיימים" | Whether this correctly avoids projecting a new arrival date — the exact overclaim this checkpoint was built to eliminate. |
| `goal-trajectory-ahead-complete.png` | Goal complete before deadline (`remainingAgorot === 0`, target date still future) | "השגתם את היעד — נשאר זמן עד התאריך שקבעתם" | Whether this is honestly distinct from "on track" (a completed fact, not a pace claim) — and whether its absence of a true "saving faster than needed" state is an acceptable substitute, per the reasoning in `FINALIZATION_REVIEW.md` §3. |

---

## Nothing else was requested or fabricated

Every state explicitly listed in the export request is included above. No additional interactive variant (e.g. a live-clicked version of `money-journey-desktop-normal.png`) was created beyond what the artifact already provides as a dedicated demonstration, per the instruction not to fabricate anything that doesn't exist in the published artifact.
