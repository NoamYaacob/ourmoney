# Trust and Privacy — Principles and Positioning

**Research date:** 9 August 2026

Household financial data is among the most sensitive data a person holds. It reveals income,
health (via pharmacy and clinic spending), religion (via donations and holiday patterns), politics,
relationships, addiction, and — in a household product — **what one partner is doing that the other
does not know about**.

This document sets principles. Several are already binding architectural rules; the rest are
positions that should become ADRs before the features they govern are built.

---

## What the Israeli incumbents do — the trust vacuum

This is the most actionable finding in the research, and it is specific.

### FamilyBiz — marketing contradicts its own privacy policy [VERIFIED]

Its marketing cites ISO 27001/27018 and states *"המידע נשמר רק אצלנו ולא יועבר לאף גורם חיצוני"*
(the information is kept only with us and will not be transferred to any external party).

**Its terms and privacy policy say the opposite:** data shared with third-party insurance brokers;
**third-party advertising served on user data**; anonymised data shareable *"בתמורה או שלא בתמורה"*
(for payment or without payment); biometrics and GPS collected; hosting possibly outside Israel.
**Google Play's data-safety disclosure confirms the harder version.**

This is the single most attackable point in the largest-scope Israeli competitor's positioning.

### RiseUp — the disclosure is real but placed where nobody reads it [VERIFIED]

Its terms state verbatim that it receives payment from the managing company for the savings
service. But the savings page calls that provider a *"שותף טכנולוגי"* and says nothing about
payment. **The vouchers page and the mortgage page carry no disclosure at all.**

The disclosure exists — one legal document away, in general terms, with no rates and no per-product
breakdown.

### MyFinanda — the clean counter-example [VERIFIED]

**No advertising, no referral marketplace.** Its Play data-safety declaration states no third-party
data sharing. Its revenue is B2C subscriptions plus B2B white-label work. It also holds **the
highest Play rating of any Israeli budgeting app (4.7)**.

### What this means

[INFERENCE] The two largest Israeli competitors have each created a gap between what they say in
marketing and what they do in their legal documents. **Neither can close it without changing their
business model**, because both earn provider commissions.

A product that takes no commissions, sells no data, serves no advertising, and discloses inline is
making a claim its two largest competitors structurally cannot match. That is a defensible
position — and the reason [BUSINESS_MODEL.md](BUSINESS_MODEL.md) treats referral revenue as
strategically dangerous rather than merely optional.

**One caution against smugness:** this advantage is only real while it is true, and it is exactly
the kind of commitment a future management team under revenue pressure would quietly revisit.
Principle T6 exists to make that revision visible rather than quiet.

---

## What the international market does

### Privacy as a product feature is a real, underserved segment

[VERIFIED] **ProjectionLab markets the absence of bank linking as a privacy feature** — it is a
deliberate positioning choice, not a technical limitation. That a planning product can compete on
"we never touch your accounts" indicates a meaningful segment that will trade convenience for
control.

**Lunch Money** is bootstrapped with no investors [VERIFIED], and its users cite that as a trust
signal — no investor pressure toward data monetization.

[INFERENCE] Most mainstream products treat privacy as a compliance page rather than a product
surface. The pattern is: a security page listing encryption standards and read-only access, and a
privacy policy that is long and permissive. The gap between "we are secure" and "here is exactly
what we do with your data, in plain language" is largely unfilled.

### Where couples-product privacy actually fails

Covered in detail in
[USER_PAIN_POINTS.md § P2](USER_PAIN_POINTS.md#p2-couples-cannot-get-transparency-on-shared-money-and-privacy-on-personal-money).
The critical finding, restated because it drives a principle below:

**Monarch — the best-realized shared-finance experience in the market — has no way to hide any
account or transaction from a partner once they are in the household.** [VERIFIED] Shared Views
organizes information; it does not restrict it.

Honeydue's three-way per-account toggle (share everything / share balance only / hide entirely)
[VERIFIED] remains the most granular control found anywhere — in the least-maintained product in
the category.

**Why this matters beyond convenience.** The user who most needs the ability to hide an account is
not the one buying a surprise gift. It is the person building financial independence from a
controlling or abusive partner. A household finance product that cannot express *hidden* — only
*unshared* — is unsafe for that user, and that user cannot tell you they need it.

---

## Principles

### T1. Household visibility must be able to express "hidden", not merely "unshared"

**Status: architectural requirement.** [ADR-019](DECISIONS.md#adr-019) already forbids logic that
assumes every member sees everything in a way that could not later be narrowed.

This principle sharpens it: the eventual visibility model must support a state where a member's
account or transaction is **invisible to other members, including admins**, and where its existence
is not inferable from totals, counts, or reconciliation gaps.

MVP does not implement per-member visibility. MVP **must not** implement anything that makes it
impossible — in particular, no aggregate that would be arithmetically impossible to reconcile if a
row later became hidden.

### T2. The household admin is not a surveillance role

`admin` grants the ability to manage the household — rename it, remove members, delete shared
records. It must never become "the member who can see everything."

[INFERENCE] This is a real risk in family products as they add children and dependents. The natural
implementation of "parent sees child's spending" quietly becomes "admin sees everything," which is
the same structure as a controlling partner. Age-appropriate parental visibility and
partner-to-partner visibility are **different features** and must not share an implementation.

### T3. Read-only by default; execution is a separate, explicit grant

When Open Banking arrives, the default and strongly preferred posture is **read-only access**.
Israel's regime distinguishes information services from payment initiation — the ISA's advanced
payment-initiation provisions take effect 6 December 2026 [VERIFIED via secondary sources; confirm
against primary before relying on the date].

Any capability to *move money* must be a separate, separately-consented, separately-revocable grant,
and must never be bundled into the connection flow that grants read access.

### T4. Consent is granular, visible, and revocable — and revocation actually deletes

Already specified in [OPEN_BANKING.md](OPEN_BANKING.md#consent-and-compliance): per-bank consent,
90-day expiry, user-initiated revocation, audit trail.

This principle adds: **revocation must delete, not merely disconnect.** The user-facing promise is
that revoking a bank connection removes the derived data, not just the token. If some data must be
retained for legal reasons, that exception is stated in plain language at the point of revocation.

### T5. AI never sees more than it needs, and never originates a number

[ADR-012](DECISIONS.md#adr-012) already forbids AI from originating financial figures. The privacy
dimension is separate and equally binding:

- The AI layer receives **structured insight objects**, not raw transaction histories, wherever the
  task allows it.
- Household financial data must never become training data. This must be contractually guaranteed
  with whichever provider is chosen ([Q6](DECISIONS.md#open-questions)), not assumed.
- Whether household financial data leaves Israel is an open question with both privacy and possible
  regulatory implications, and must be answered before any AI feature ships.

### T6. No data monetization. Ever.

Aggregated household spending data is commercially valuable and its sale is common in adjacent
industries. **OurMoney does not sell, share, or license household financial data — aggregated,
anonymized, or otherwise.**

The "anonymized and aggregated" qualifier deserves specific skepticism: transaction-level data is
notoriously re-identifiable, and the phrase has done a great deal of work in privacy policies that
later proved misleading.

This is a permanent constraint and belongs in the eventual privacy policy in exactly these terms.

### T7. Plain-language disclosure, at the point of decision

A privacy policy nobody reads is not consent. Where a decision has a privacy consequence —
connecting a bank, enabling WhatsApp, inviting a member, turning on AI — the consequence is stated
in plain Hebrew **at that moment**, in one or two sentences.

### T8. Deletion is real and complete

Account deletion removes household financial data within a stated period. A household with multiple
members needs a defined behaviour for what happens to shared records when one member leaves — this
is unresolved and blocks nothing in MVP, but must be decided before any real user data exists.
Recorded as an open question below.

### T9. Notification channels carry privacy weight proportional to their intimacy

WhatsApp is the clearest case. A message reading
`💳 חיוב חדש — Wolt ₪126.70` on a phone that a partner, child, or colleague may glance at is a
**disclosure**, not a notification.

Requirements before any WhatsApp feature ships:
- Explicit opt-in per member, never inherited from household settings
- Per-member, per-event-type granularity
- Content-minimal message options (e.g. "you have a new transaction" without amount or merchant)
- Trivially easy opt-out from within the channel itself

### T10. Security posture already binding in MVP

From [CLAUDE.md](../CLAUDE.md) and [ARCHITECTURE.md](ARCHITECTURE.md):
- Tokens in `expo-secure-store`, never AsyncStorage
- Biometric gate on app resume
- RLS on every table, enforced at the database, with structural guards
  ([ADR-023](DECISIONS.md#adr-023))
- **Never log tokens, user IDs, or monetary values** — including to crash reporting
  (resolved by [ADR-033](DECISIONS.md#adr-033): Sentry, errors only, three-layer scrub enforcement)
- No service role key in client code

---

## Positioning: privacy as competitive advantage

[INFERENCE] Three claims OurMoney could make credibly and early, which most competitors cannot:

1. **"We never sell your data — and we have no investors who need us to."** Contingent on remaining
   independent. It is a real differentiator while true, and it must be retired the moment it isn't.

2. **"Your partner sees what you choose to share."** Directly addresses the gap Monarch cannot
   close without re-architecting. Requires T1 to be real.

3. **"Our numbers are computed, not generated."** The deterministic-engine rule
   ([ADR-012](DECISIONS.md#adr-012)) is a genuine safety property at a moment when competitors are
   adding LLM features to financial products. It is also *verifiable* — the same inputs always
   produce the same outputs — which makes it a stronger claim than a marketing promise.

The third is the most durable, because it is architectural rather than a policy that a future
management team could quietly change.

---

## Open questions

| # | Question | Blocks |
|---|---|---|
| ~~T-Q1~~ | ~~What happens to shared household data when one member leaves or a household dissolves?~~ | ✅ **RESOLVED (Milestone 9):** admin succession to the longest-tenured remaining member; a sole remaining member's departure deletes the whole household and its data (no permanently orphaned household); shared/financial data is preserved for remaining members, with attribution-only columns nulled rather than the data deleted. See [ADR-032](DECISIONS.md#adr-032) |
| T-Q2 | Does household financial data leave Israel for AI processing? | AI layer ([Q6](DECISIONS.md#open-questions)) |
| T-Q3 | Israeli Privacy Protection Law obligations for a licensed financial information service | Open Banking phase |
| T-Q4 | Retention period for derived data after connection revocation | Open Banking phase |
| T-Q5 | Do Israeli couples culturally expect full transparency, making granular privacy a non-feature — or a quiet necessity? | Visibility model design; **needs user research, not desk research** |
