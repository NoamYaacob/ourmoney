> ## ⚠️ DRAFT — NOT YET PUBLISHED
>
> This is a working draft prepared during Milestone 12 ("Release / Submission Readiness"). It has
> **not** been reviewed by legal counsel, has **not** been published to any website or app store
> listing, and is **not** a binding legal document in its current form. Every bracketed placeholder
> below (e.g. `[PRIVACY CONTACT EMAIL REQUIRED]`) marks a real detail this repository does not
> define and cannot invent. Do not link to, screenshot, or distribute this file as if it were a live
> policy. See `docs/RELEASE_CHECKLIST.md` §9 for what remains before this can be published.
>
> Every factual claim below describes **only what OurMoney actually does as of Milestone 11**
> (commit `76f15fbdf39e14b7f1db1f01e853c703b221f939` on `main`). Nothing here describes a planned or
> future capability. If a future capability changes what this app does, this policy must be updated
> before that change ships, not after.

# OurMoney Privacy Policy (Draft)

**Last updated:** [DATE OF PUBLICATION REQUIRED]

OurMoney is a household budgeting app. It helps couples and households track shared and personal
spending together, in Hebrew, on their own phones.

This policy explains what information OurMoney collects, how it is used, who can see it, how long
it is kept, and how to have it deleted.

---

## 1. Who we are

[LEGAL ENTITY NAME REQUIRED], operating OurMoney (the "App", "we", "us").

Contact: [PRIVACY CONTACT EMAIL REQUIRED]
Address: [BUSINESS ADDRESS REQUIRED, IF APPLICABLE]
This policy is governed by the laws of [JURISDICTION REQUIRED].

Public URL for this policy: [PUBLIC POLICY URL REQUIRED]

---

## 2. Account and authentication data

To use OurMoney you create an account with an email address and password, handled by our backend
provider, Supabase (see §9). We store:

- Your email address
- Your password — handled by our authentication provider, Supabase Auth, which stores it hashed;
  OurMoney's own application code never sees or stores your plain-text password
- A display name
- Your session token, stored securely on your device using the operating system's secure storage
  (`expo-secure-store`) — never in a location shared with other apps

As of this version, OurMoney does not offer profile picture / avatar upload — this is not yet a
built feature, so no image or photo is collected as part of your account.

Your display name is visible to every other user with an account on OurMoney, not only members of
your own household — there is currently no per-household restriction on this specific field. Your
financial data (§4) is scoped to your household only, as described in §3.

If your device supports biometric authentication (Face ID, fingerprint) and you enable it, OurMoney
uses it only to re-lock the app after it has been in the background — this authentication happens
on your device via Apple's/Google's own biometric APIs and financial account data is never sent to
a biometric verification service.

## 3. The household and shared-finance model

OurMoney organizes financial data around a **household** — you and, if you choose, one or more
partners you invite. Key facts about how this works today:

- **Every household member can see every account and every transaction belonging to that
  household**, regardless of whether a transaction is marked "shared" or "personal." The
  shared/personal toggle controls how a transaction counts toward the household budget total — it
  is **not** a privacy or visibility control, and does not hide a transaction from other household
  members. If you need to keep spending private from other household members, do not add it to a
  shared household, or use a separate personal account outside OurMoney.
- One member of a household is its admin, who can rename the household and remove members. An admin
  cannot see anything other members cannot also see — admin status does not grant additional
  visibility into other members' data beyond what any member already sees.
- Inviting a partner is done via a one-time link shared through your device's native share sheet
  (e.g. WhatsApp, Messages, email) — OurMoney does not send the invitation itself, and does not read
  or access your contacts or messaging apps to do so.
- A household is limited to a single household membership per user in this version — you cannot
  belong to more than one household at a time.

## 4. Financial data you enter or import

You control every financial figure in OurMoney. We do not connect to your bank, card issuer, or any
financial institution, automatically or otherwise, as of this version — every account balance,
transaction, budget, and savings goal is either:

- **Entered manually** by you or another household member, or
- **Imported from a CSV file you select** from your own device.

### CSV import

When you import a CSV file:

- The file is selected using your device's own file picker and read directly from your device — it
  is never uploaded to, or processed by, any third-party file-conversion or OCR service.
- The file is parsed on your device. The resulting transactions are then saved to your household's
  data in the same way a manually-entered transaction is.
- We check the imported rows against your household's existing transactions to flag likely
  duplicates (matching account, date, amount, and description) before they are saved, so you can
  choose whether to import them anyway.

### What we never do with your financial data

- We do not sell, share, rent, or license your household's financial data — individually,
  aggregated, or "anonymized" — to any third party, for any purpose, ever.
- We do not show advertising, and we do not run a referral or commission-based marketplace inside
  the app.
- No advertising network, data broker, or analytics-for-monetization service has access to your
  financial data.

## 5. Notifications

OurMoney can show you a notification when your household's spending in a budgeted category crosses
a threshold. As of this version, this notification is generated and shown **only on the device that
triggers it** — it does not yet reliably reach a partner's separate device. This is a known,
documented limitation of the current version, not a privacy control: the notification content never
leaves your device to any third party, it simply does not yet fan out across your household's other
devices automatically.

## 6. Crash reporting

OurMoney uses Sentry, a third-party error-monitoring service, to help us find and fix bugs. This is
configured deliberately narrowly:

- **Errors only.** Sentry is used exclusively to capture unexpected app errors and crashes. It is
  never used for product analytics, usage tracking, or behavioral profiling of any kind.
- **No session replay.** OurMoney does not record or transmit a video or replay of your screen.
- **No user identification.** OurMoney never links a crash report to your account, email, name, or
  user ID within Sentry.
- **Financial and identifying data is stripped before anything is sent.** Before an error report
  leaves your device, OurMoney automatically removes anything that looks like a monetary amount,
  account or transaction identifier, household identifier, email address, or similar sensitive
  value — from the error message, the technical details, and any contextual data attached to it.
  This is enforced by automated tests on every change to this logic.
- **Only active outside of local development.** Crash reporting is disabled entirely while the app
  is being developed or tested locally on a developer's machine; it is active in any build
  distributed for testing or release, including versions installed from the App Store or Google
  Play.
- What Sentry can receive, when an error genuinely occurs: the type of error, a sanitized technical
  message, a technical stack trace, your app version, your device's operating system and model, and
  similar technical diagnostic information — never your financial data or personal identifiers.

## 7. What we do not do, as of this version

To be specific about capabilities OurMoney does **not** currently have, so this policy is not
mistaken for a description of a broader product:

- **No bank or card connection of any kind.** OurMoney does not use Open Banking, screen-scraping,
  or any bank integration. Every figure in the app is either typed in by a household member or
  imported from a file you choose.
- **No WhatsApp integration.** OurMoney does not send or receive any message via WhatsApp.
- **No AI or language-model feature.** No part of OurMoney sends your financial data to an AI
  service, and no figure shown in the app is generated or estimated by an AI — every number is
  computed by ordinary, deterministic application code from the data you entered.
- **No location tracking, no contact list access, no advertising identifier collection.**

## 8. Deleting your account and your data

You can delete your account at any time from Settings, in the app. When you do:

- Your login and profile are removed, and your session is ended.
- If you are the only member of your household, your entire household — including its accounts,
  transactions, categories, budgets, and everything else belonging to it — is deleted along with
  your account.
- If other members remain in your household after you leave, the household and its shared financial
  records continue to exist for them (this is what a **shared household** means — data you and your
  partner built together does not vanish when one of you leaves). If you were the household's admin,
  the longest-tenured remaining member automatically becomes the new admin. Records that used to be
  attributed to you (e.g. "created by you," "paid by you") have that attribution removed, but the
  underlying financial record — which belongs to the household, not to you personally — is kept for
  the remaining members.
- If you had any personal (non-household-owned) account, it becomes household-owned rather than
  being deleted, so the remaining members' historical totals stay accurate.

This deletion is performed by a single, audited operation and is not reversible.

## 9. Third parties that process your data

We use exactly two service providers to operate OurMoney, and no others:

- **Supabase** — our database, authentication, and real-time sync provider. Supabase hosts your
  account, your household's financial data, and manages authentication. [SUPABASE DATA-RESIDENCY /
  SUB-PROCESSOR DETAILS REQUIRED — confirm hosting region and Supabase's own sub-processor list
  before publishing]
- **Sentry** — our error-monitoring provider, used exactly as described in §6, with financial and
  identifying data stripped before anything is sent.

We do not use any advertising network, analytics platform (beyond the error-only use of Sentry
described above), data broker, or any other third-party processor.

## 10. Security

- All financial data access is protected by row-level security enforced by our database, not merely
  by application logic — a household member can only ever read or write data belonging to their own
  household.
- Your session token is stored using your device's secure storage, never in plain, shared storage.
- We do not embed the ability to bypass these protections in the app you install — the client app
  only ever holds a restricted, non-privileged key to our database.

## 11. Your rights

Depending on where you live, you may have rights to access, correct, export, or delete your
personal data. You can delete your account and its associated data directly in the app at any time
(§8). For any other request, contact us at [PRIVACY CONTACT EMAIL REQUIRED].

[JURISDICTION-SPECIFIC RIGHTS LANGUAGE REQUIRED — e.g. GDPR/Israeli Privacy Protection Law language,
once the legal entity and jurisdiction in §1 are finalized]

## 12. Changes to this policy

If we change what data we collect or how we use it, we will update this policy and, where required,
notify you before the change takes effect. [NOTIFICATION MECHANISM REQUIRED — e.g. in-app notice,
email]

---

*This document was drafted from, and must remain consistent with, `docs/TRUST_AND_PRIVACY.md`,
[ADR-032](DECISIONS.md#adr-032) (account deletion), and [ADR-033](DECISIONS.md#adr-033) (crash
reporting). If any of those change, this policy must be re-reviewed against the change before
publication.*
