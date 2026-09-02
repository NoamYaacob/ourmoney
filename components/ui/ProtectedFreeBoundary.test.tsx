// RRR §16 P0-5 regression test: heroBorder measured 1.47:1 (light hero) /
// 1.26:1 (dark hero) — nowhere near WCAG 1.4.11's 3:1 floor for meaningful
// non-text UI — which made the protected/free split (this component's whole
// purpose) nearly invisible. This asserts the actual style/fill/stroke props
// the component renders resolve to the passing heroInkMuted token (7.14:1 /
// 6.11:1, verified live against the real rendered DOM — see the P0
// remediation evidence artifact), not back to the failing heroBorder one.
import { describe, expect, it } from '@jest/globals'
import { render } from '@testing-library/react-native'
import { ProtectedFreeBoundary } from './ProtectedFreeBoundary'
import { colors } from '@/constants/colors'

interface TestInstanceLike {
  type: string
  props: Record<string, unknown>
}
type Container = { queryAll: (predicate: (i: TestInstanceLike) => boolean) => TestInstanceLike[] }

// react-native-svg's host props resolve a `#rrggbb` string to a parsed
// `{ payload: <uint32 ARGB>, type }` object before this test's queryAll can
// see it — never the raw hex — so fill/stroke props are compared against
// this same ARGB packing rather than string equality. Verified to match
// react-native's own internal processColor() output for both tokens
// (confirmed via a scratch script) before relying on it here, rather than
// importing that internal, untyped module directly into a jest file.
function toArgbPayload(hex: string): number {
  const h = hex.replace('#', '')
  const r = parseInt(h.slice(0, 2), 16)
  const g = parseInt(h.slice(2, 4), 16)
  const b = parseInt(h.slice(4, 6), 16)
  return ((0xff << 24) | (r << 16) | (g << 8) | b) >>> 0
}
const heroInkMutedPayload = toArgbPayload(colors.heroInkMuted.light)
const heroBorderPayload = toArgbPayload(colors.heroBorder.light)

describe('ProtectedFreeBoundary', () => {
  it('renders the track and hatch base fill with the passing heroInkMuted token, not the failing heroBorder token', async () => {
    const { container } = (await render(
      <ProtectedFreeBoundary protectedAgorot={3000} freeAgorot={7000} totalAgorot={10000} />,
    )) as { container: Container }

    const track = container.queryAll((i) => i.props.accessibilityElementsHidden === true)[0]
    expect(track).toBeDefined()
    expect(track!.props.style).toMatchObject({ backgroundColor: colors.heroInkMuted.light })
    expect((track!.props.style as { backgroundColor: string }).backgroundColor).not.toBe(colors.heroBorder.light)

    const hatchRect = container.queryAll(
      (i) => i.type === 'RNSVGRect' && (i.props.fill as { payload?: number })?.payload === heroInkMutedPayload,
    )
    expect(hatchRect.length).toBeGreaterThan(0)
  })

  it('keeps the hatch line stroke at heroBorder as a minority-area texture accent, not the same color as its own base fill', async () => {
    const { container } = (await render(
      <ProtectedFreeBoundary protectedAgorot={3000} freeAgorot={7000} totalAgorot={10000} />,
    )) as { container: Container }

    const hatchLine = container.queryAll((i) => i.type === 'RNSVGLine')[0]
    expect(hatchLine).toBeDefined()
    const strokePayload = (hatchLine!.props.stroke as { payload?: number })?.payload
    expect(strokePayload).toBe(heroBorderPayload)
    expect(strokePayload).not.toBe(heroInkMutedPayload)
  })
})
