# Milestone 0 — Styling Compatibility Gate

**Date:** 9 August 2026
**Verdict:** ✅ **PASS.** NativeWind v4 (4.2.6) confirmed on Expo SDK 57. ADR-011 recorded Accepted.

This report is the evidence trail for [ADR-011](DECISIONS.md#adr-011). It ran entirely in a
throwaway scratch project outside this repository. **No files in this repository were touched. No
hosted resources were created. No Supabase project, real or local, was used.**

---

## Method

```bash
npx create-expo-app@latest nw-gate --template blank-typescript
cd nw-gate && npm install
npm install nativewind@4.2.6 tailwindcss@^3.4.0
```

Configured `tailwind.config.js`, `global.css`, `babel.config.js`, `metro.config.js`, and
`nativewind-env.d.ts` per NativeWind's own setup docs, then wrote a single `App.tsx` exercising
every dimension in the approval brief simultaneously: Hebrew text, `he-IL` currency formatting via
`Intl.NumberFormat`, a `flex-row` list that must reverse under RTL, `rtl:` variants, logical
properties (`ms-`/`me-`/`ps-`/`pe-`), `dark:` variants (including stacked `dark:rtl:`), and an
arbitrary-value opacity modifier (`bg-rose-500/10`).

Then: typechecked, bundled for iOS and Android via `expo export` (exercises the full Metro + Babel +
NativeWind transform pipeline without needing a simulator or emulator), bundled for web, and
inspected the rendered output both by parsing the compiled CSS and by visual verification in a
browser with `dir="rtl"` and `colorScheme.set('dark')` toggled live.

**Local toolchain gap, discovered before this run started:** this machine has no Xcode
(`xcode-select` points at Command Line Tools only) and no Android Studio/SDK. Simulator and emulator
builds were therefore not possible this session. `expo export --platform ios/android` was used
instead — it runs the identical Metro/Babel/NativeWind transform each platform build depends on and
is where a real Reanimated or transform-pipeline conflict would surface. Actual on-device rendering
remains to be confirmed once Xcode/Android Studio are available; this is called out explicitly
rather than implied as complete.

---

## 1. Pass / fail

| Check | Result |
|---|---|
| Expo SDK 57 scaffold | ✅ Pass |
| NativeWind v4 stable track (not preview) | ✅ Pass |
| iOS build (Metro/Babel transform) | ✅ Pass |
| Android build (Metro/Babel transform) | ✅ Pass |
| Hebrew RTL rendering | ✅ Pass |
| Dark mode | ✅ Pass |
| RTL variants (`rtl:`) | ✅ Pass |
| Logical properties (`ms-`/`me-`/`ps-`/`pe-`) | ✅ Pass |
| Stacked variant (`dark:rtl:`) | ✅ Pass |
| No blocking Reanimated/peer conflict | ✅ Pass — **conflict does not reproduce on this version pair** |
| No preview/nightly dependency | ✅ Pass |
| `tsc --noEmit --strict` | ✅ Pass (after one fix) |
| On-device Simulator/Emulator rendering | ⏸️ Not run — no Xcode/Android Studio on this machine |

**Overall: PASS.** Two minor setup-doc gaps found and fixed; neither is a NativeWind defect and both
are one-line, permanent fixes folded into Milestone 1.

---

## 2. Exact dependency versions

```
expo                       57.0.11
react                      19.2.3
react-native               0.86.2
nativewind                 4.2.6
tailwindcss                3.4.19
react-native-css-interop   0.2.6   (nativewind's internal engine)
react-native-reanimated    4.5.3   (transitive — see §7)
react-native-worklets      0.10.3  (transitive)
babel-preset-expo          57.0.6
typescript                 6.0.3
react-dom                  19.2.3  (web-only, not part of the app)
react-native-web           0.21.2  (web-only, not part of the app)
expo-status-bar            57.0.1
```

**Recommended pin:** `nativewind: "^4.2.0"`, `tailwindcss: "^3.4.0"`.

---

## 3. iOS result

```
npx expo export --platform ios --output-dir /tmp/nwgate-ios --clear

iOS Bundled 8103ms index.ts (971 modules)
› ios bundles (1):
_expo/static/js/ios/index-26bc42c340973beaf879fd078b0c4c28.hbc (2.5MB)
Exported: /tmp/nwgate-ios
```

Clean. No transform errors, no peer-dependency warnings.

---

## 4. Android result

```
npx expo export --platform android --output-dir /tmp/nwgate-android --clear

Android Bundled 6866ms index.ts (969 modules)
› android bundles (1):
_expo/static/js/android/index-1dbdbba891e320ba933b0e1225738ffe.hbc (2.5MB)
Exported: /tmp/nwgate-android
```

Clean.

---

## 5. RTL result

Verified two ways.

**Compiled CSS inspection** — the production stylesheet contains correctly generated logical
properties and a `[dir=rtl]`-scoped selector:

```css
.rtl\:bg-amber-100:where([dir=rtl],[dir=rtl] *){ background-color: rgb(254 243 199) }
margin-inline-start / margin-inline-end / padding-inline-start / padding-inline-end  ← all present
```

**Visual verification** (web build, `document.documentElement.setAttribute('dir','rtl')` injected
to simulate the OS-level effect of `I18nManager.forceRTL()`):

| LTR (default) | RTL (`dir="rtl"` set) |
|---|---|
| Probe box sky-blue (`rtl:` not applied) | Probe box **amber** (`rtl:` applied) |
| Wide logical margin (`ms-4 me-16`) sits on the right | Gap correctly **flips to the left** |
| Transaction row: description right, amount left | Row **reverses**: description left, amount right |

Hebrew text rendered crisply throughout. `he-IL` currency formatting via
`Intl.NumberFormat('he-IL', { style: 'currency', currency: 'ILS' })` produced correct output —
`₪18,045.80`, `-₪327.50` — with correct symbol placement and thousands separators.

**Caveat:** this exercises the same CSS variant logic NativeWind uses on native (`rtl:` compiles
identically for RN and RN-Web), but a browser `dir` attribute is not the native
`I18nManager.forceRTL()` module. Native-side RTL layout (mirrored `flex-direction`, mirrored
absolute positioning) should be spot-checked once a simulator is available. This is a low-risk gap:
NativeWind's `rtl:` variant is documented to read `I18nManager.isRTL` on native, which is the same
mechanism this test simulated at the DOM level.

---

## 6. Dark-mode result

Verified visually by calling NativeWind's own `colorScheme.set('dark')` API (the same call a real
theme toggle would make) and screenshotting before/after.

Every dark surface inverted correctly in one pass: page background, card background, card borders,
primary/secondary text color, the toggle button itself (inverted from black-bg/white-text to
white-bg/black-text, including its icon), and all five colored probe boxes switched to their
`dark:` variant shade. Confirmed the **stacked `dark:rtl:` variant** compiles and applies correctly
by toggling both simultaneously — the probe box rendered as dark amber/brown, distinct from both the
plain `dark:` and plain `rtl:` states.

---

## 7. Warnings and issues

**Real issues found and fixed (both now folded into Milestone 1 setup):**

1. **`babel-preset-expo` is not a top-level dependency of the `blank-typescript` SDK 57 template.**
   NativeWind's babel config (`['babel-preset-expo', ...]`) assumes it resolves. It exists only
   nested under `expo`'s own `node_modules`. Metro's transformer needs it top-level.
   **Fix:** `npx expo install babel-preset-expo` — one command.
2. **TypeScript 6 rejects `import './global.css'` with `TS2882`** (untyped side-effect import).
   NativeWind's setup instructions specify this import but ship no ambient `.css` module
   declaration to satisfy strict mode.
   **Fix:** one line in `nativewind-env.d.ts`: `declare module '*.css' {}`.

**Corrected assumption from the original ADR-011 research:** the documented NativeWind v4 ×
Reanimated v4 peer conflict **does not reproduce** on Expo SDK 57 + NativeWind 4.2.6. Direct
inspection of `peerDependencies` across 4.1.23 → 4.2.6 shows NativeWind has only ever declared
`tailwindcss` as a peer on the v4 line; Reanimated is pulled in transitively by NativeWind's own
`react-native-css-interop` dependency, not required of the consumer. `npm install
--strict-peer-deps` and `npx expo install --check` both pass without any override or resolution
hack.

**Non-blocking residual noise:**

- `npm audit`: 21 vulnerabilities (7 moderate, 14 high), **18 of which are already present in the
  bare `create-expo-app` scaffold before NativeWind is installed** — they live in
  `@expo/config-plugins`, `metro`, `xcode`, `uuid`, standard Expo/Metro CLI tooling. NativeWind's own
  addition (`react-native-reanimated`) contributes 3 more findings that trace to the same
  `react-native`/`metro` dependency chain. This is the ordinary state of a freshly scaffolded Expo
  SDK 57 project, not a NativeWind-specific finding, and none of it is runtime app code.
- No preview, RC, beta, or nightly package was installed at any point (verified: `nativewind@latest`
  resolves to `4.2.6`; the `preview` dist-tag `5.0.0-preview.4` was inspected but never installed).

---

## 8. Recommended styling choice

**NativeWind v4, pinned `^4.2.0`, is the recommendation. ADR-011 is recorded Accepted.**

The fallback to `StyleSheet` + a typed theme is not needed. Both required fixes are one line each,
permanent, and fold into the standard Milestone 1 dependency install — they do not recur per-feature
and do not leak into `components/ui/` API design either way, so no time was lost keeping the fallback
option open.

**Carried into Milestone 1:**
```bash
npx expo install babel-preset-expo
```
and one line added to `nativewind-env.d.ts`:
```ts
declare module '*.css' {}
```

**Still to confirm once local tooling exists** (Xcode / Android Studio — see
[recovery note below](#note-on-local-tooling)): actual Simulator and Emulator rendering, and native
`I18nManager.forceRTL()` behavior specifically (as opposed to the `dir` attribute simulation used
here).

---

## Note on local tooling

This machine currently has **no Xcode** (only Command Line Tools) and **no Android Studio/SDK**.
`expo export --platform ios/android` was used as the closest available substitute — it runs the
identical Metro + Babel + NativeWind transform pipeline that a real build depends on, which is where
a genuine Reanimated or dependency conflict would appear — but it does not launch a Simulator or
Emulator and does not confirm on-device visual rendering.

**This is disclosed here rather than glossed over.** Before Milestone 1's exit criteria
(`npx expo start --ios` / `--android` rendering correctly) can be met, one of the following is
needed:
- Xcode installed from the App Store (free, ~40GB, requires this Mac's owner to accept its licence
  interactively — not something this session can do unattended), or
- Android Studio installed with an AVD configured.

Neither was required for Milestone 0's scope as specified, and neither was installed this session.
