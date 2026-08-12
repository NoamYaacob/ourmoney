# OurMoney — Release / Submission Checklist

**Status: draft, Milestone 12.** This is the actionable checklist for taking OurMoney from "MVP
code-complete" (true as of Milestone 11) to a live App Store / Google Play listing. It exists
because `ROADMAP.md`'s MVP-4 phase has exactly one remaining line item — real store submission —
and that item cannot be completed inside this repository or by a coding agent. This document is
the bridge: everything checkable here has been checked; everything that requires a human, an
account, a credential, or a physical device is marked as such and left unchecked.

**No step below is marked complete unless it was actually verified in this repository.** Steps
requiring external action are never marked done by this document — only the person performing them
can do that.

Legend, used on every item:
- 🤖 **Repo-checkable** — Claude (or any agent with repo access) can verify or perform this directly.
- 👤 **Manual — you** — a decision or action only the product owner can make, but no external account
  is strictly required.
- 🔑 **External credentials/account required** — needs an Apple Developer, Google Play Console, or
  EAS account that does not exist in this environment.
- 📱 **Real device/simulator required** — this environment has no Simulator/Emulator
  ([ADR-030](DECISIONS.md#adr-030)); needs a physical device or a machine with one.

---

## 1. Repo readiness

- [x] 🤖 MVP-1 through MVP-4 feature-complete per `ROADMAP.md` (verified: all milestones 0–11 shipped
      and merged to `main`)
- [x] 🤖 `eas.json` exists with `development`/`preview`/`production` build profiles (this milestone)
- [x] 🤖 No secrets, credentials, or DSNs committed anywhere in the repo (verified by a manual
      pattern search across the repo at the end of this milestone, and every prior milestone's
      equivalent check — there is no dedicated secret-scanning tool or CI job configured yet)
- [x] 🤖 `.env.example` documents every required environment variable with no real values
- [ ] 👤 Confirm the final legal entity name, business address, support email, and jurisdiction to
      use in `docs/PRIVACY_POLICY.md` and store listings — none of this is defined anywhere in the
      repo today, and this document cannot invent it

## 2. Tests/build validation

- [x] 🤖 `npm test` — full suite green (confirmed as part of every milestone since M8's ship-quality
      pass, most recently Milestone 11)
- [x] 🤖 `npm run typecheck` — clean
- [x] 🤖 `npm run lint` — zero errors
- [x] 🤖 `npx expo export --platform ios|android|web` — all three clean
- [ ] 🔑📱 A real EAS build (`eas build --profile production`) completes successfully — cannot be
      run without an EAS account (see §3) and cannot be fully verified without installing the
      resulting binary on a device (§8)

## 3. EAS project/account setup

- [ ] 🔑 Create (or use an existing) Expo/EAS account
- [ ] 🔑 Run `eas init` (or `eas build:configure`) from the project root to create an EAS project and
      write `extra.eas.projectId` into `app.json` — **`app.json` has no `extra` field today; this
      repo does not fabricate a project ID, since doing so would mean claiming an EAS project that
      doesn't exist**
- [ ] 🔑 Set the `EXPO_PUBLIC_SENTRY_DSN` environment variable in the EAS project's environment
      variable dashboard (`eas env:create` or the EAS web UI) — the DSN itself is not secret, but it
      does not exist anywhere in this repo or in any Milestone 11/12 commit, only in `.env.example`
      as an empty placeholder key
- [ ] 🔑 **Blocking, not optional:** set `SENTRY_AUTH_TOKEN` (and `SENTRY_ORG`/`SENTRY_PROJECT` if not
      otherwise resolvable) as an EAS secret before running the first real iOS build on any profile.
      Traced directly from `@sentry/react-native/expo`'s installed Xcode build-phase script
      (`node_modules/@sentry/react-native/scripts/sentry-xcode.sh`) during this milestone's review:
      none of `eas.json`'s three profiles set `ios.buildConfiguration`, so all three default to
      `Release`. In a `Release` configuration, that script always attempts a source-map upload via
      `sentry-cli`; without a valid `SENTRY_AUTH_TOKEN` it **fails the entire build**, it does not
      silently skip. The alternative to creating the token now is setting `SENTRY_DISABLE_AUTO_UPLOAD`
      as an EAS secret/env var to defer source-map upload to a later milestone — either way this must
      be decided *before* the first real build in §7, not discovered by a failed build. (Never in
      `eas.json`, never in `app.json` — see ADR-033's Consequences section, `docs/DECISIONS.md`.) The
      Android Gradle-plugin equivalent was not traced to the same depth during this review — verify
      the same risk before the first real Android build too.

## 4. Apple Developer setup

- [ ] 🔑 Apple Developer Program membership ($99/year)
- [ ] 🔑 App Store Connect record created for `com.ourmoney.app` (the `ios.bundleIdentifier` already
      set in `app.json` — verified unchanged since Milestone 1)
- [ ] 🔑 Distribution certificate + provisioning profile (EAS can manage these automatically via
      `eas credentials` once an Apple account is connected — no manual certificate juggling required,
      but the Apple account itself is still required first)
- [ ] 👤 Decide the App Store Connect "Age Rating" questionnaire answers (see
      `docs/STORE_LISTING_DRAFT.md` for a starting recommendation, not a final answer)

## 5. Google Play Console setup

- [ ] 🔑 Google Play Console developer account ($25 one-time)
- [ ] 🔑 App record created for `com.ourmoney.app` (the `android.package` already set in `app.json`
      — verified unchanged since Milestone 1)
- [ ] 🔑 Google Play's **Data Safety** form completed — this is a real, binding public disclosure;
      `docs/PRIVACY_POLICY.md` (this milestone) gives the accurate underlying facts (what data is
      collected, what third parties process it, what's never collected), but the Play Console form
      itself must be filled in through Google's own UI, which this environment cannot access
- [ ] 🔑 Content rating questionnaire completed via Play Console

## 6. Signing/credentials

- [ ] 🔑 iOS: EAS-managed distribution certificate + provisioning profile (via `eas credentials`,
      requires the Apple account from §4)
- [ ] 🔑 Android: EAS-managed (or self-managed) upload keystore (via `eas credentials`, requires the
      Google account from §5)
- [ ] 👤 Decide whether EAS manages signing credentials (recommended, the path this checklist
      assumes) or credentials are managed manually — a product/process decision, not a technical
      blocker

## 7. Production build

- [ ] 🔑📱 Run `eas build --profile production --platform ios` (requires §3, §4, §6)
- [ ] 🔑📱 Run `eas build --profile production --platform android` (requires §3, §5, §6)
- [ ] 📱 Install and smoke-test each resulting build on a real device before submitting (this
      environment cannot install or run a native binary)

## 8. Real-device verification

Per ADR-030, this environment has never had Simulator/Emulator access — every item below is
genuinely unverifiable here, not merely unverified. All of the following were reasoned about and
covered by unit/structural tests during Milestones 10 and 11, but none were confirmed on real
hardware:

- [ ] 📱 Splash screen: correct image scaling, correct light/dark background color switching, no
      blank-screen flash, no stuck splash on a real cold start
- [ ] 📱 RTL layout renders correctly natively (web export spot-checks only cover a browser
      approximation, per Milestone 1's own documented limitation)
- [ ] 📱 Biometric app-lock prompt fires correctly after 30s background
- [ ] 📱 Push notification permission prompt and local notification delivery (budget threshold
      alerts) behave correctly on-device
- [ ] 📱 Sentry native crash capture actually reports a real crash (requires a live DSN from §3 and a
      deliberately triggered crash on a real device or TestFlight/internal-track build)
- [ ] 📱 CSV import file picker and Hebrew/Windows-1255-encoded file handling on a real device

## 9. Privacy/data-safety review

- [x] 🤖 `docs/PRIVACY_POLICY.md` drafted (this milestone), cross-checked against
      `docs/TRUST_AND_PRIVACY.md`, ADR-032, ADR-033, and actual source code — not aspirational,
      describes only shipped behavior
- [ ] 👤 Legal review of `docs/PRIVACY_POLICY.md` before it is treated as a real, binding policy —
      this document is a draft, not legal advice, and has not been reviewed by counsel
- [ ] 👤 Fill in every bracketed placeholder (e.g. `[PRIVACY CONTACT EMAIL REQUIRED]`) in
      `docs/PRIVACY_POLICY.md` (legal entity name, contact email,
      jurisdiction, public policy URL) with real values
- [ ] 🔑 Publish the finalized privacy policy at a real, publicly reachable URL — both stores require
      this before a listing can go live, and it cannot be a file living only in this git repository

## 10. Store metadata/assets

- [x] 🤖 `docs/STORE_LISTING_DRAFT.md` drafted (this milestone) — app name, descriptions, category,
      keywords, age-rating considerations, all truthful to the shipped MVP feature set
- [ ] 👤 Finalize app name (subject to App Store/Play Store name-uniqueness checks this repo cannot
      perform)
- [ ] 👤 Finalize category selection and keywords
- [ ] 🔑 Enter all metadata into App Store Connect and Play Console directly (no API access exists in
      this environment)

## 11. Screenshots

- [ ] 📱 Capture real-device screenshots for each required size (iPhone, iPad if `supportsTablet` is
      kept, Android phone/tablet) — cannot be generated from `expo export` output, which produces a
      JS bundle, not rendered screens
- [ ] 👤 Follow the suggested screenshot sequence/captions in `docs/STORE_LISTING_DRAFT.md` §Screenshot
      plan, or revise it
- [ ] 👤 Ensure no real household's real financial data appears in any screenshot (use a demo/seed
      household)

## 12. Submission

- [ ] 🔑 Submit the iOS build via App Store Connect (either `eas submit` once §3/§4/§6 are complete,
      or manual upload)
- [ ] 🔑 Submit the Android build via Play Console (either `eas submit` or manual upload)
- [ ] 👤 Respond to any App Store / Play Store review feedback or rejection

**This repository does not perform, simulate, or fabricate the result of this step. As of
Milestone 12, submission has not happened.**

## 13. Post-submission monitoring

- [ ] 👤 Monitor App Store Connect / Play Console review status
- [ ] 🔑 Once live: monitor Sentry (per ADR-033's data-minimization configuration) for real crash
      reports
- [ ] 👤 Track the MVP exit criteria from `ROADMAP.md` (published on both stores; at least 10 real
      households using it for a full month; zero known data-isolation defects; a retention signal
      strong enough to justify POST-MVP) — none of these can be satisfied before real users exist

## 14. Version/build increments for future releases

Per the versioning convention documented in Milestone 11 (`docs/DECISIONS.md`, "Release versioning
convention"):

- `expo.version` (currently `1.0.0`) bumps on every user-facing release, following semver.
- `expo.ios.buildNumber` (currently `"1"`) increments by exactly 1 on every build actually submitted
  to App Store Connect — never speculatively, never reused.
- `expo.android.versionCode` (currently `1`) increments by exactly 1 on every build actually
  uploaded to Play Console — same rule.

**As of this milestone, none of these three values have changed**, because no build has yet been
submitted to either store — bumping them now would violate the convention's own "only when an
actual build is being submitted" rule. The first real bump of `buildNumber`/`versionCode` should
happen immediately before the first production build in §7 above, not before.
