# Screenshot Manifest — Signature Experience Lab

33 PNGs, exported by rendering the review artifact's HTML locally in headless Chromium (Playwright) and screenshotting each live prototype/mockup element directly — not photos of the Claude Artifact UI. Interaction states (receipt expanded, lens switched, goal state changed, node tapped, Impact Preview recalculated) were produced by driving the artifact's own JavaScript, not by hand-editing anything. Captured at 2x device-scale-factor. Full written context lives in `SIGNATURE_LAB_REVIEW.md` in this same folder — read that first; this file matches each image to what it demonstrates.

**A capture-hygiene note, disclosed for transparency:** during scripted capture, clicking certain controls intermittently left a leftover "zoom" lightbox overlay open from an unrelated element, which would have visually contaminated later screenshots. The export script defensively force-closes that overlay immediately before every capture. This is a capture-script safeguard only — it does not alter the artifact's content, layout, or behavior, and every image below was verified against the live, correctly-composited state after this guard was added.

---

## Signature primitives

| Filename | Primitive | State | What to evaluate |
|---|---|---|---|
| `money-journey-mobile-light.png` | Money Journey | Normal, mobile, light | Whether the causal event-path (income up-nodes, outflow down-nodes, amber low-point marker) reads faster than a line chart at a glance. |
| `money-journey-mobile-dark.png` | Money Journey | Normal, mobile, dark | Whether dark mode's glowing pale-blue path reads as designed, not inverted. |
| `money-journey-desktop-light.png` | Money Journey | Normal, desktop, light | Whether the extra width earns its keep with fuller node labels (amounts + context) vs. the mobile version's shorter labels. |
| `money-journey-negative-tight-future.png` | Money Journey | Illustrative "tight month" variant | Whether a shaded negative-balance zone below the baseline communicates "going into minus" clearly, distinct from a plain red number. |
| `money-journey-tapped-node-interaction.png` | Money Journey | Interactive — mortgage node tapped, tooltip visible | Proof that tapping a node surfaces its one-sentence causal explanation without redrawing the whole path. |
| `safe-to-spend-instrument-default.png` | Safe-to-Spend Instrument | Default (collapsed) | Whether the split-fill capsule (protected vs. free) communicates the subtraction visually before any caption is read. |
| `safe-to-spend-instrument-receipt-expanded.png` | Safe-to-Spend Instrument | Interactive — receipt expanded | Proof that tapping reveals the exact line items (recurring, arnona, installments) that sum to the protected amount — "showing the work." |
| `impact-preview-safe-800.png` | Impact Preview | ₪800 hypothetical — safe verdict | **Flagged: colliding with the "no what-if simulator" MVP constraint — concept only, not approved for implementation.** Evaluate the interaction concept (marker shift + plain-language verdict), not whether it should ship. |
| `impact-preview-unsafe-2500.png` | Impact Preview | ₪2,500 hypothetical — unsafe verdict | Same flag as above. Evaluate whether the "consequence through time" framing is clearer than a plain calculator would be. |
| `financial-pulse.png` | Financial Pulse | Default | Whether the anchored horizontal delta strip is genuinely more glanceable than a stacked alert-card list — and whether it's the weakest of the six primitives, as the self-review concludes. |
| `household-lens-shelanu-ours.png` | Household Lens | שלנו (ours) active | Baseline state — all rows at full opacity, ours-tagged rows have the teal rail + ⌂ avatar. |
| `household-lens-sheli-mine.png` | Household Lens | Interactive — שלי (mine) selected | Proof the lens re-reads the same list: matching + "ours" rows stay full opacity, others dim to .35 rather than disappearing. |
| `household-lens-shelcha-yours.png` | Household Lens | Interactive — שלך (yours) selected | Same proof for the third lens state — confirms the mechanism is symmetric across all three. |
| `goal-trajectory-ontrack.png` | Goal Trajectory | On track (default) | Whether a diagonal pace-guide + marker communicates "will we make it?" faster than a percentage bar. |
| `goal-trajectory-behind.png` | Goal Trajectory | Interactive — behind selected | Marker drops below the guide line, color shifts to warning — evaluate whether position alone (monochrome test) would still communicate "behind." |
| `goal-trajectory-ahead.png` | Goal Trajectory | Interactive — ahead selected | Marker rises above the guide line — same evaluation, opposite direction. |

## Retention

| Filename | State | What to evaluate |
|---|---|---|
| `retention-since-last-visit-quiet.png` | "Nothing changed" state | Whether a deliberately quiet/flat Pulse is itself informative, rather than needing to always show something. |
| `retention-since-last-visit-large-purchase-unexpanded.png` | A single large delta, not yet expanded | This screen's full "tap to expand into Money Journey" transition is a **storyboarded interaction, not live in this artifact** (disclosed in `SIGNATURE_LAB_REVIEW.md` §6) — evaluate the anchor state shown here, not an expansion that doesn't exist yet. |

## Home S1 — Financial Instrument

| Filename | Viewport | Theme | What to evaluate |
|---|---|---|---|
| `s1-home-mobile-390-light.png` | 390 mobile | Light | Glance speed: hero instrument + trajectory stacked, minimal narrative. |
| `s1-home-mobile-390-dark.png` | 390 mobile | Dark | Whether the dark instrument/path treatment holds up at the smallest width. |
| `s1-home-tablet-1024-light.png` | 1024 tablet | Light | A genuinely composed two-column tablet layout (instrument + trajectory side by side) — not a stretched phone screen. |
| `s1-home-desktop-1440-light.png` | 1440 desktop | Light | Three simultaneous zones (instrument / trajectory / goal) — whether desktop width is earning its keep. |
| `s1-home-desktop-1440-dark.png` | 1440 desktop | Dark | Same composition, dark-mode fidelity check. |

## Home S2 — Money Story

| Filename | Viewport | Theme | What to evaluate |
|---|---|---|---|
| `s2-home-mobile-390-light.png` | 390 mobile | Light | The now → changed → next → action narrative flow — whether it reads faster or slower than S1's instrument-first approach. |
| `s2-home-mobile-390-dark.png` | 390 mobile | Dark | Narrative readability in dark mode. |
| `s2-home-tablet-1024-light.png` | 1024 tablet | Light | A single widened reading column (not a second column) — a deliberate, disclosed choice distinct from S1/S3's tablet compositions. |
| `s2-home-desktop-1440-light.png` | 1440 desktop | Light | A focused center column + supporting rail, deliberately not edge-to-edge — evaluate whether this reads as restraint or wasted width (flagged as an open question in the self-review). |
| `s2-home-desktop-1440-dark.png` | 1440 desktop | Dark | Same composition, dark-mode fidelity check. |

## Home S3 — Household Command Center

| Filename | Viewport | Theme | What to evaluate |
|---|---|---|---|
| `s3-home-mobile-390-light.png` | 390 mobile | Light | Household lens as permanent structure even at mobile width — שלנו tier expanded by default. |
| `s3-home-mobile-390-dark.png` | 390 mobile | Dark | Same, dark mode. |
| `s3-home-tablet-1024-light.png` | 1024 tablet | Light | שלי and שלנו genuinely side by side — a two-column composition unique to this direction. |
| `s3-home-desktop-1440-light.png` | 1440 desktop | Light | Three true columns (שלך / שלנו / שלי) always simultaneously visible — the direction's philosophy fully realized, only possible at this width. |
| `s3-home-desktop-1440-dark.png` | 1440 desktop | Dark | Same three-column composition, dark-mode fidelity check. |

---

## Cross-cutting comparison shortcuts

- **Home, mobile, light, side by side:** `s1-home-mobile-390-light.png`, `s2-home-mobile-390-light.png`, `s3-home-mobile-390-light.png`
- **Home, tablet, side by side (the genuinely-new composition this round):** `s1-home-tablet-1024-light.png`, `s2-home-tablet-1024-light.png`, `s3-home-tablet-1024-light.png`
- **Home, desktop, side by side:** `s1-home-desktop-1440-light.png`, `s2-home-desktop-1440-light.png`, `s3-home-desktop-1440-light.png`
- **The flagged "what-if" concept:** `impact-preview-safe-800.png` and `impact-preview-unsafe-2500.png` — both need explicit scope sign-off before any implementation; see `SIGNATURE_LAB_REVIEW.md` §9.
- **Household Lens's monochrome-test weakness:** compare `household-lens-shelanu-ours.png` / `-sheli-mine.png` / `-shelcha-yours.png` with color perception set aside — only the avatar-initial glyph still distinguishes them.

## Not captured / not applicable

- A full "since last visit" **expanded** state does not exist as a live interaction in this artifact — only storyboarded (see `SIGNATURE_LAB_REVIEW.md` §6). `retention-since-last-visit-large-purchase-unexpanded.png` shows the honest pre-expansion state rather than a fabricated one.
