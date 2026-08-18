# OurMoney — Release / Submission Checklist

**Status: draft, Milestone 12+.** This is the actionable checklist for taking OurMoney from "MVP
code-complete" to a live App Store / Google Play listing. Everything repo-checkable is continuously
validated where practical; everything that requires a human, an external account/credential, or a
physical device remains explicitly unchecked.

**No step below is marked complete unless it was actually verified.**

Legend:
- 🤖 **Repo-checkable** — an agent with repo access can verify or perform this directly.
- 👤 **Manual — you** — a product-owner/legal decision or action.
- 🔑 **External credentials/account required** — Expo/EAS, Apple Developer, Google Play, Sentry, etc.
- 📱 **Real device/simulator required** — must be verified on native hardware/runtime.

---

## 1. Repo readiness

- [x] 🤖 MVP-1 through MVP-4 feature-complete per `ROADMAP.md`
- [x] 🤖 `eas.json` exists with `development` / `preview` / `production` build profiles
- [x] 🤖 Automated full-history committed-secret scan is part of the Trust Gate (Gitleaks); the first
      scan passed on 2026-08-18
- [x] 🤖 `.env.example` documents required environment variables with no real values
- [ ] 👤 Confirm final legal entity name, business address, support/privacy email and jurisdiction

## 2. Tests / build validation

- [x] 🤖 Full Jest suite green
- [x] 🤖 TypeScript clean
- [x] 🤖 Lint clean
- [x] 🤖 Full local Supabase reset + migration/RLS/concurrency suite green
- [x] 🤖 `npx expo export` continuously validated for web, iOS and Android
- [x] 🤖 `npx expo-doctor` added as a blocking Trust Gate before platform exports; Expo SDK 57 config
      and dependency mismatches discovered by the first run were aligned with `npx expo install --fix`
- [ ] 🔑📱 A real EAS production build completes successfully and is installed on-device

## 3. EAS project / crash reporting

- [ ] 🔑 Create or connect the Expo/EAS project
- [ ] 🔑 Run `eas init` / `eas build:configure` and write the real `extra.eas.projectId` into `app.json`
- [ ] 🔑 Configure `EXPO_PUBLIC_SENTRY_DSN` in the EAS project environment
- [ ] 🔑 Configure `SENTRY_AUTH_TOKEN` (and org/project if required), or explicitly use
      `SENTRY_DISABLE_AUTO_UPLOAD` before the first Release build

## 4. Apple Developer setup

- [ ] 🔑 Apple Developer Program membership
- [ ] 🔑 App Store Connect record for `com.ourmoney.app`
- [ ] 🔑 Configure EAS-managed iOS signing credentials
- [ ] 👤 Finalize App Store age-rating answers and metadata

## 5. Google Play setup

- [ ] 🔑 Google Play Console developer account
- [ ] 🔑 App record for `com.ourmoney.app`
- [ ] 🔑 Configure Android signing/upload credentials
- [ ] 🔑 Complete Data Safety and content-rating forms

## 6. Production builds

- [ ] 🔑📱 `eas build --profile production --platform ios`
- [ ] 🔑📱 `eas build --profile production --platform android`
- [ ] 📱 Install and smoke-test both resulting binaries before submission

## 7. Real-device verification

- [ ] 📱 Cold-start splash in light and dark mode
- [ ] 📱 Native Hebrew RTL layout
- [ ] 📱 Biometric lock after 30 seconds in background
- [ ] 📱 Notification permission + local budget-threshold notification delivery
- [ ] 📱 Sentry native crash capture
- [ ] 📱 CSV file picker + Hebrew / Windows-1255 import
- [ ] 📱 Two-user household flow on two real devices
- [ ] 📱 Partner realtime transaction visibility within 2 seconds
- [ ] 📱 Internal-transfer balance/analytics behavior
- [ ] 📱 Planned obligations / cash-flow / safe-to-spend smoke test

## 8. Privacy / legal

- [x] 🤖 `docs/PRIVACY_POLICY.md` drafted and cross-checked against shipped behavior
- [ ] 👤 Legal review before treating the policy as binding
- [ ] 👤 Replace all bracketed legal/contact placeholders with real values
- [ ] 🔑 Publish the finalized privacy policy at a public URL

## 9. Store metadata and screenshots

- [x] 🤖 `docs/STORE_LISTING_DRAFT.md` drafted
- [ ] 👤 Finalize app name, category and keywords
- [ ] 📱 Create/use a sanitized demo household and capture required iPhone/iPad/Android screenshots
- [ ] 🔑 Enter metadata/assets in App Store Connect and Play Console

## 10. Submission

- [ ] 🔑 Submit iOS build
- [ ] 🔑 Submit Android build
- [ ] 👤 Respond to store review feedback/rejection

## 11. Post-submission monitoring / MVP exit

- [ ] 👤 Monitor store review status and Sentry after launch
- [ ] 👤 At least 10 real households use the app for a full month
- [ ] 👤 Zero known data-isolation defects
- [ ] 👤 Retention signal strong enough to justify POST-MVP

## 12. Version/build increments

- `expo.version` is currently `1.0.0` and bumps on user-facing releases.
- `expo.ios.buildNumber` is currently `"1"`; increment only for a build actually submitted.
- `expo.android.versionCode` is currently `1`; increment only for a build actually uploaded.

Tracking issue for all remaining external/manual/native items: #3.
