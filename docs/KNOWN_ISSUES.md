# Known issues

Found and root-caused, not fixed — each needs a decision or a change with a
blast radius bigger than this pass's scope. Documented per the standing
rule: don't fake a fix, don't leave a finding unrecorded either.

## Inactive tab screens stay mounted and interactive on web

**Found while:** driving the app with real Playwright mouse clicks through a
realistic navigation flow (Home → search → Transactions → detail → back →
Budget → Cash Flow → …), not isolated `page.goto()` loads per screen — the
QA method every earlier pass in this session actually used, which cannot
surface this class of bug at all.

**Symptom:** after navigating from one tab-hosted screen to another via
any in-app control (sidebar link, tab bar, `router.push`), the previous
screen's entire component tree — hooks, queries, rendered rows — stays
mounted underneath the new one. Confirmed directly: after Home → Transactions,
`document.querySelectorAll` found two live copies of the same transaction
row's text in the DOM at once, in two different on-screen positions, both
with `pointer-events: auto`.

**Root cause, traced to source (not inferred):**
`node_modules/expo-router/build/react-navigation/bottom-tabs/views/
ScreenFallback.js`. Expo Router's web tab renderer wraps each scene in a
`MaybeScreen` component that uses `react-native-screens`' native `Screen`
(which handles focus/blur, pointer-events, and unmounting correctly) *when
available*. When `Screens?.screensEnabled?.()` is false — which it is on
web in this project — it falls back to a plain `View`:

```js
function MaybeScreen({ enabled, active, ...rest }) {
  if (Screens?.screensEnabled?.()) {
    return <Screens.Screen enabled={enabled} activityState={active} {...rest} />
  }
  return <View {...rest} />   // enabled/active silently dropped here
}
```

The fallback `View` still gets `style: [StyleSheet.absoluteFill, { zIndex:
isFocused ? 0 : -1 }]` from `BottomTabView.js` (so it visually sits behind
the active screen), but nothing sets `pointerEvents: 'none'` on it. A `View`
with `zIndex: -1` is invisible in normal use because something else paints
over it — it is not the same as being removed from hit-testing.

**Actual impact, verified rather than assumed:**
- A real mouse click at the coordinates of the genuinely on-screen,
  top-most element works correctly every time this was tested (Cash Flow
  horizon, Obligations → detail, Accounts → detail, and a raw
  `page.mouse.click()` at the visible row's exact bounding box all
  navigated correctly).
- The failure mode is specific to two different screens' content
  overlapping at the *same screen coordinates* with an *ambiguous* target
  — which happened repeatedly in this session's own QA scripts because
  Home's "recent transactions" widget and the Transactions list both show
  the same transaction descriptions, and naive selectors (`.first()`,
  plain `getByText(...).click()`) resolve to whichever DOM node comes
  first rather than whichever one is actually on top. That is a real risk
  for anyone else's future test automation on this app, not just this
  session's.
- Every mounted-but-inactive screen keeps its own queries "live" (their
  `useQuery` subscriptions don't unmount), which means more background
  work and memory than a single active screen needs — a real but
  low-severity cost that compounds the longer a session runs and the more
  distinct screens get visited.
- No user-visible breakage was found in this pass beyond what's described
  above. This is a latent correctness/performance issue, not a confirmed
  "clicking does nothing" bug for a real user under normal use.

**Minimum change that would fix it, without touching `node_modules`:**
investigate why `react-native-screens` isn't enabled for web in this
project (`Screens?.screensEnabled?.()` returning false) — either it's
never installed/configured for the web target, or something disables it
intentionally. If enabling it for web is safe (needs its own scoped
verification — it changes real navigation behavior app-wide), that's the
actual fix upstream expects. Failing that, a narrow, deliberate mitigation
would be adding `pointerEvents="none"` to the specific inactive-scene
wrapper — but that requires either patching the vendored copy (fragile,
lost on every `expo-router` upgrade) or a shim around `<Tabs>` in
`app/(app)/_layout.tsx`, which is a real design decision about how much
control to take over expo-router's own rendering, not a one-line fix.
Neither was attempted in this pass — this is exactly the class of finding
that needs a decision, not a guess.

## No back/cancel control from a full-page form on desktop

`transactions/new.tsx` (and every other nested screen) renders its
`Screen`-level back chevron only on mobile (`web:desktop:hidden`) — correct
per this app's existing pattern of relying on the always-visible desktop
side rail instead. But the side rail has no "you have an unsaved form open"
awareness, so a household on desktop who opens "תנועה חדשה" and decides not
to submit has no explicit close/cancel affordance on that screen itself —
only navigating to a different sidebar destination, which abandons the form
implicitly rather than by a deliberate control. This matches the rest of
the app's desktop navigation model exactly (no screen has a back button on
desktop), so it isn't a regression or an inconsistency — it's a systemic
property of the current shell, flagged here because the design files don't
show a full desktop frame for this specific screen to confirm the shell's
sidebar-only model was actually the intended answer for a screen instead of a sheet/modal.
