// See ARCHITECTURE.md § RTL Implementation. Prefer NativeWind's `rtl:`
// variant and logical properties (`ms-`/`me-`/`ps-`/`pe-`) for styling —
// this hook exists for the cases those cannot express, e.g. picking between
// two icon names or two animation directions in JS.

import { I18nManager } from 'react-native'

export function useRTL() {
  const isRTL = I18nManager.isRTL

  function flip<T>(left: T, right: T): T {
    return isRTL ? right : left
  }

  return { isRTL, flip }
}
