# Screenshot Manifest — Product + Experience Direction

21 PNGs, exported by rendering the review artifact's HTML locally in headless Chromium (Playwright) and screenshotting each concept-mockup device frame directly — not photos of the Claude Artifact UI. Each frame was captured at 2x device-scale-factor for legibility. Filenames follow `direction-<a|b|c>-<screen>-<viewport>-<theme>.png`.

Full written context for every concept below lives in `PRODUCT_DIRECTION.md` in this same folder — read that first; this file exists so each image can be matched to what it's meant to demonstrate.

**Not exported / not applicable:** the artifact describes tablet composition in prose (see each direction's "Tablet philosophy" in `PRODUCT_DIRECTION.md`) but does not render a distinct tablet-width mockup — only mobile (390 CSS px) and desktop (1440 CSS px) frames were built as visuals in this checkpoint. This is disclosed here rather than fabricating a tablet screenshot that wasn't part of the reviewed artifact.

---

## Direction A — The Household Ledger, Sharpened (evolves the current approved Home)

| Filename | Viewport | Theme | Screen / state | What to evaluate |
|---|---|---|---|---|
| `direction-a-home-mobile-390-light.png` | 390 (mobile) | Light | Home — hero Safe-to-Spend + ranked "מה חשוב עכשיו" panel + goal summary | Whether the evolutionary approach (same skeleton as today's approved Home) reads as meaningfully sharper, not just re-skinned. Check the proportion indicator under the hero number. |
| `direction-a-home-desktop-1440-light.png` | 1440 (desktop) | Light | Home — three-zone layout (hero / attention / forecast+goals) | Whether desktop meaningfully exploits width rather than centering the mobile card; compare information density against Direction B/C desktop. |
| `direction-a-home-mobile-390-dark.png` | 390 (mobile) | Dark | Home, dark mode | Whether dark mode reads as designed (deep teal identity) rather than a simple color inversion. |
| `direction-a-what-matters-now-mobile-390-light.png` | 390 (mobile) | Light | Dedicated "מה חשוב עכשיו" screen, 3 ranked cards | Whether each card clearly answers what happened → why it matters → what to do, and whether capping at 2–3 items (vs. a full alert feed) reads as restrained rather than sparse. |
| `direction-a-household-lens-mobile-390-light.png` | 390 (mobile) | Light | Commitments list with שלי/שלך/שלנו filter chips | Whether attribution-as-a-filter (not a new screen) is legible and unobtrusive; whether the chip styling reads calm rather than judgmental. |
| `direction-a-decision-goal-pace-mobile-390-light.png` | 390 (mobile) | Light | Goal detail reframed as a decision (pace, required monthly, on-track status) | Whether reframing an existing progress bar as a decision prompt is a meaningful upgrade over a plain linear bar. |
| `direction-a-recurring-redesign-mobile-390-light.png` | 390 (mobile) | Light | Recurring list with cadence-dot rhythm + price-delta badge | Whether the cadence dots + red delta badge make a price increase legible before reading any number — the "visual grammar" concept for Recurring. |

## Direction B — Ask OurMoney, One Running Story (recommended base direction)

| Filename | Viewport | Theme | Screen / state | What to evaluate |
|---|---|---|---|---|
| `direction-b-home-mobile-390-light.png` | 390 (mobile) | Light | Home as one vertical narrative: number → why it moved → month shape → what matters → goals | Whether a single narrative flow genuinely reads as more coherent than card-grid dashboards, or as harder to scan. This is the most structurally different Home among the three. |
| `direction-b-home-desktop-1440-light.png` | 1440 (desktop) | Light | Narrative center column + persistent right rail (ranked insights) | Whether keeping the narrative column focused (not stretched edge-to-edge) with a supporting rail is a good desktop translation of a "story," or wastes width. |
| `direction-b-home-mobile-390-dark.png` | 390 (mobile) | Dark | Home, dark mode | Warm amber accent choice against near-black — deliberately calmer than a green/red financial palette; evaluate whether it still reads as trustworthy/financial. |
| `direction-b-what-matters-now-mobile-390-light.png` | 390 (mobile) | Light | Ranked "מה חשוב עכשיו" as a secondary view (reached from the story, not the front door) | Compare directly against Direction A's version of the same screen — same content, different entry point philosophy. |
| `direction-b-household-lens-mobile-390-light.png` | 390 (mobile) | Light | שלנו/שלי/שלך toggle re-narrating the same story ("₪X of ₪Y reserved is shared") | Whether re-narrating a sentence (vs. Direction A's list filter) is a more or less useful household mechanism. |
| `direction-b-decision-affordability-mobile-390-light.png` | 390 (mobile) | Light | "אפשר לנו את זה?" affordability check — ₪2,500 input, resulting Safe-to-Spend and low-point impact | **Flagged in `PRODUCT_DIRECTION.md` §5 as colliding with a hard "no what-if simulator" MVP constraint — shown as a concept only, explicitly not approved for implementation.** Evaluate the interaction concept, not whether it should ship as-is. |
| `direction-b-cashflow-redesign-mobile-390-light.png` | 390 (mobile) | Light | Cash Flow folded into the story as a "chapter" (bar-shape summary + low point) instead of a standalone tab | Whether demoting Cash Flow from a tab to a narrative chapter loses information users currently rely on. |

## Direction C — Two People, One Picture (boldest IA challenge)

| Filename | Viewport | Theme | Screen / state | What to evaluate |
|---|---|---|---|---|
| `direction-c-home-mobile-390-light.png` | 390 (mobile) | Light | Home with persistent שלנו/שלי/שלך segmented control at top, שלנו tier expanded | Whether making household attribution the primary navigation axis (not a filter) feels like the real moat or like manufactured "his and hers" framing — the central open question this direction raises. |
| `direction-c-home-desktop-1440-light.png` | 1440 (desktop) | Light | Three simultaneous columns: שלך / שלנו / שלי | The direction's philosophy fully realized — only possible at desktop width. Evaluate whether seeing both partners' pictures plus the shared picture at once is genuinely more useful than tabbing between them. |
| `direction-c-home-mobile-390-dark.png` | 390 (mobile) | Dark | Home, dark mode | Indigo/violet dual-tone identity, distinct from A's teal and B's amber — evaluate whether the color choice successfully signals "household duality" as intended. |
| `direction-c-what-matters-now-mobile-390-light.png` | 390 (mobile) | Light | Alerts lensed by person (שלנו / שלי / שלך groupings of the same underlying alert set) | Whether splitting one ranked list into three lensed groups adds clarity or just adds friction to scanning. |
| `direction-c-household-concept-mobile-390-light.png` | 390 (mobile) | Light | Transactions list with the שלנו/שלי/שלך tab structure applied (the direction's defining trait, shown outside Home) | Whether this same three-way tab structure holds up when applied to a list screen, not just the hero. |
| `direction-c-decision-affordability-mobile-390-light.png` | 390 (mobile) | Light | Lensed affordability check ("can WE afford this" vs. "can I") | **Same scope flag as the Direction B affordability screen — concept only, not approved for implementation.** Evaluate whether lensing the hypothetical amount adds real value over Direction B's single version. |
| `direction-c-accounts-redesign-mobile-390-light.png` | 390 (mobile) | Light | Accounts grouped into שלנו / שלי / שלך sections | Uses the currently-dormant `owner_id` field (flagged in the gap matrix as needing new UI to actually set it) — evaluate the grouping concept, not its current buildability.

---

## Cross-direction comparison shortcuts

- **Home, mobile, light, side by side:** `direction-a-home-mobile-390-light.png`, `direction-b-home-mobile-390-light.png`, `direction-c-home-mobile-390-light.png`
- **Home, desktop, light, side by side:** `direction-a-home-desktop-1440-light.png`, `direction-b-home-desktop-1440-light.png`, `direction-c-home-desktop-1440-light.png`
- **Dark mode identity comparison:** `direction-a-home-mobile-390-dark.png` (teal) vs. `direction-b-home-mobile-390-dark.png` (amber) vs. `direction-c-home-mobile-390-dark.png` (indigo/violet)
- **"מה חשוב עכשיו" treatment comparison:** the three `*-what-matters-now-*` files
- **The flagged "what-if" decision concept:** `direction-b-decision-affordability-mobile-390-light.png` and `direction-c-decision-affordability-mobile-390-light.png` — both need explicit scope sign-off before any implementation; see `PRODUCT_DIRECTION.md` §5.
