// The bug this hook now exists to prevent: `I18nManager.isRTL` is a
// documented no-op on react-native-web — always false in a browser, whatever
// the document's `dir` is — so every `flip()` returned the LTR branch on web
// and the RTL branch on a phone. The same component picked a different glyph
// on each platform, which is the opposite of what a direction helper is for.

import { describe, expect, it } from '@jest/globals'
import { renderHook } from '@testing-library/react-native'
import { useRTL } from './useRTL'

describe('useRTL', () => {
  it('reports the direction the app actually renders in', async () => {
    // Hebrew-only product: native forces RTL at startup, web sets dir="rtl"
    // on the document element. There is no LTR mode to detect.
    const { result } = await renderHook(() => useRTL())
    expect(result.current.isRTL).toBe(true)
  })

  it('flip() picks the second argument, on every platform', async () => {
    const { result } = await renderHook(() => useRTL())
    expect(result.current.flip('chevron-forward', 'chevron-back')).toBe('chevron-back')
    expect(result.current.flip('left', 'right')).toBe('right')
  })
})
