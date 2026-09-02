// See ARCHITECTURE.md § RTL Implementation. Prefer NativeWind's `rtl:`
// variant and logical properties (`ms-`/`me-`/`ps-`/`pe-`) for styling —
// this hook exists for the cases those cannot express, e.g. picking between
// two icon names or two animation directions in JS.
//
// It does NOT ask `I18nManager.isRTL`, and that is the whole point.
// react-native-web's I18nManager is a documented no-op: `isRTL` is always
// false in a browser no matter what the document's `dir` is. So every
// `flip()` call site silently returned the LTR branch on web while returning
// the RTL branch on a phone — the same component picking a different glyph
// on the two platforms, which is exactly what this hook exists to prevent.
// It showed up as settings rows whose "drill in" chevron pointed away from
// the direction of travel, and a month stepper whose "earlier" arrow pointed
// at "later".
//
// The app is Hebrew-only and RTL-first: native forces RTL at startup
// (I18nManager.forceRTL) and web sets `dir="rtl"` on the document element
// (app/_layout.tsx). There is no LTR mode to detect, so this reports the
// direction the app actually renders in rather than asking an API that
// cannot answer on one of its two platforms. If the product ever ships a
// second, LTR locale, this is the one place that has to learn about it.

export function useRTL() {
  const isRTL = true

  function flip<T>(left: T, right: T): T {
    return isRTL ? right : left
  }

  return { isRTL, flip }
}
