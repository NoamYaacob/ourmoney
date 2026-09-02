# Screenshot Manifest — S4 Living Money

24 PNGs, exported by rendering the S4 artifact's HTML locally in headless Chromium (Playwright) and screenshotting each component/frame element directly — not photos of the Claude Artifact UI. Interaction states (receipt expanded, Money Journey node selected, Impact Check recalculated) were produced by driving the artifact's own JavaScript. Captured at 2x device-scale-factor. Full written context lives in `S4_REVIEW.md` in this same folder.

**A structural bug was found and fixed before this export**, disclosed here and in `S4_REVIEW.md`: 13 instances of a missing closing `</div>` on gallery wrappers were corrupting the artifact's DOM (most visibly, the Safe-to-Spend and Impact Check prototype frames rendered ~4x too tall). This was a pure HTML-closure fix — no visual, copy, or data change — and the published artifact was corrected before capture. Every image below reflects the corrected, live artifact.

**Two requested states do not exist in the artifact and are not included** — see "Not captured" at the bottom of this file.

---

## NORMAL (6)

| Filename | Viewport | Theme | State | What to evaluate |
|---|---|---|---|---|
| `normal-desktop-1440-light.png` | 1440 desktop | Light | Full Home system: hero + boundary + Money Journey as one canvas, What Changed + Goal band below | Whether the top system genuinely reads as one connected object rather than three stacked widgets; whether desktop width is used well. |
| `normal-desktop-1440-dark.png` | 1440 desktop | Dark | Same composition, dark | Whether dark mode is designed (re-derived tokens) rather than inverted. |
| `normal-tablet-1024-light.png` | 1024 tablet | Light | Two-column header (instrument+pulse / journey+goal) | Whether this reads as a genuinely intentional intermediate composition, not mobile-stretched or desktop-squeezed. |
| `normal-tablet-1024-dark.png` | 1024 tablet | Dark | Same composition, dark | Dark-mode fidelity check at tablet width. |
| `normal-mobile-390-light.png` | 390 mobile | Light | First-viewport: hero, boundary, Pulse headline, 3-beat journey preview | Whether the essentials (Safe-to-Spend, direction of change, what's next) are answerable without scrolling. |
| `normal-mobile-390-dark.png` | 390 mobile | Dark | Same composition, dark | Dark-mode fidelity check at mobile width. |

## STRESS (4)

| Filename | Viewport | Theme | State | What to evaluate |
|---|---|---|---|---|
| `stress-desktop-1440-light.png` | 1440 desktop | Light | Low Safe-to-Spend (₪647), forecast crossing zero, three simultaneous obligations, goal behind pace | Whether urgency comes from hierarchy/language rather than a red-flooded screen — check the shaded (not solid-red) low-point band and the factual copy ("חודש צפוף," not "אזהרה"). |
| `stress-desktop-1440-dark.png` | 1440 desktop | Dark | Same scenario, dark | Whether the stress treatment stays restrained in dark mode too. |
| `stress-tablet-1024-light.png` | 1024 tablet | Light | Same scenario, tablet composition | Whether the tablet-specific layout holds up under a harder data scenario, not just the happy path. |
| `stress-mobile-390-light.png` | 390 mobile | Light | Same scenario, mobile first viewport | Whether stress state stays legible and calm at the smallest width. |

*Note: this scenario is an explicitly disclosed illustrative recombination of real obligation figures (ארנונה, ביטוח בריאות, and the family-vacation obligation all timed within one window) — every individual amount is real; the combination is a constructed stress test, not fabricated data. See `S4_REVIEW.md`.*

## EMPTY (4)

| Filename | Viewport | Theme | State | What to evaluate |
|---|---|---|---|---|
| `empty-desktop-1440-light.png` | 1440 desktop | Light | Zero-account onboarding: one headline, one CTA, no fake data | Whether this avoids every anti-pattern named in the brief (no ₪0 hero, no empty chart shell, no fake preview data). |
| `empty-desktop-1440-dark.png` | 1440 desktop | Dark | Same, dark | Dark-mode fidelity check. |
| `empty-tablet-1024-light.png` | 1024 tablet | Light | Same, tablet | Whether the empty state scales its typography/layout intentionally rather than just centering the mobile version. |
| `empty-mobile-390-light.png` | 390 mobile | Light | Same, mobile | Whether the payoff explanation ("connect an account, then we can calculate...") is clear at the smallest width. |

---

## PRIMITIVES / INTERACTIONS (10)

| Filename | State | Interaction | What to evaluate |
|---|---|---|---|
| `safe-to-spend-boundary-default.png` | Receipt collapsed | Baseline (pre-click) | Whether the textured-protected vs. solid-free boundary reads as a "financial boundary" rather than a progress bar before any interaction. |
| `safe-to-spend-boundary-receipt-expanded.png` | Receipt expanded | Live — receipt toggle clicked | Whether the revealed breakdown (₪9,384 / ₪1,224 / ₪2,079 → ₪12,687) matches real `calculateSafeToSpend` output fields and genuinely builds trust ("showing the work"). |
| `money-journey-default-unselected.png` | No node selected | Baseline (pre-click) | Whether the causal shape (rise to salary, decline through expenses, low point, recovery) reads in ~1 second without any interaction. |
| `money-journey-event-selected-mortgage.png` | Mortgage node selected | Live — node clicked | Whether the emphasized waterfall tick (previous→delta→new balance) explains causality without a tooltip, as claimed. |
| `money-journey-low-point-selected.png` | Low-point node selected | Live — node clicked | Whether the low point gets appropriately distinct visual treatment (amber, larger marker) versus a routine event. |
| `money-journey-mobile-native.png` | Compact 3-beat mobile view | Static (mobile has no click interaction in this prototype) | Whether this is a genuinely native mobile composition (today · low point · next salary) rather than the desktop chart shrunk down. |
| `impact-check-safe-800.png` | ₪800 hypothetical | Live — amount typed, recalculated | Whether the "consequence through time" framing (now → after purchase → future low point → verdict) is clearer than a plain calculator. Approved in principle for the roadmap, narrow scope only — see `S4_REVIEW.md` §8. |
| `impact-check-unsafe-2500.png` | ₪2,500 hypothetical (default) | Live — amount typed, recalculated | Same evaluation, unsafe-verdict case (-₪360 future low point). |
| `goal-trajectory-ontrack-extracted-from-normal.png` | On track | Not a dedicated interactive state — cropped from the Normal Home composition (`normal-desktop-1440-light.png`) | Whether "בקצב הנוכחי: תגיעו ליעד בזמן" as a headline-first sentence communicates progress better than a percentage. |
| `goal-trajectory-behind-extracted-from-stress.png` | Behind | Not a dedicated interactive state — cropped from the Stress Home composition (`stress-desktop-1440-light.png`) | Same evaluation, behind-pace case ("תאחרו את היעד בכ-2 חודשים"). |

---

## Not captured — genuinely absent from the artifact, not fabricated for this export

| Requested state | Status | Why |
|---|---|---|
| Household Lens — שלנו | **Does not exist** | No screen in the S4 artifact renders household-attribution rows or a lens switcher. Discussed only in prose (thesis, grammar, hostile review, implementation map). See `S4_REVIEW.md` §6. |
| Household Lens — שלי | **Does not exist** | Same as above. |
| Household Lens — שלך | **Does not exist** | Same as above. |
| Goal Trajectory — ahead | **Does not exist** | Only "on track" and "behind" appear anywhere in the artifact, each incidentally embedded in a Home composition (see the two extracted crops above). No "ahead" state was built. |

No image was created for these four items. Fabricating them would have violated this checkpoint's own explicit instruction ("do not fabricate states that do not exist").
