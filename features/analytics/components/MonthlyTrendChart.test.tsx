// Regression test for the confirmed React DOM warning on web: "does not
// recognize the `accessibilityElementsHidden`/`importantForAccessibility`
// prop on a DOM element." react-native-svg's web shape forwards every prop
// straight to the DOM with no allowlist (unlike react-native-web's View,
// which silently drops RN-only props it doesn't recognize), so those two
// accessibility props must live on a wrapping View, never on <Svg> itself.
// This can't be reproduced as an actual DOM warning here — this project's
// jest-expo config resolves the native (non-.web) module graph, so
// react-native-svg's web shape never loads under `npm test` — so this
// asserts the structural invariant that prevents it instead: the props are
// present on the wrapping View and absent from <Svg>, on every platform.
import { describe, expect, it } from '@jest/globals'
import { render } from '@testing-library/react-native'
import '@/i18n'
import { MonthlyTrendChart } from './MonthlyTrendChart'
import type { MonthlyTrendPoint } from '../lib/monthlyTrend'

const POINTS: MonthlyTrendPoint[] = [
  { periodStart: '2026-06-01', incomeAgorot: 500000, expenseAgorot: 300000 },
  { periodStart: '2026-07-01', incomeAgorot: 520000, expenseAgorot: 310000 },
]

describe('MonthlyTrendChart', () => {
  it('puts accessibilityElementsHidden/importantForAccessibility on the wrapping View, never on Svg', async () => {
    const { getByTestId } = await render(<MonthlyTrendChart points={POINTS} />)

    // These elements are deliberately hidden from the accessibility tree
    // (that's the whole point of the fix), so the default queries — which
    // exclude accessibility-hidden elements — need includeHiddenElements.
    const wrapper = getByTestId('monthly-trend-chart-hidden-wrapper', { includeHiddenElements: true })
    expect(wrapper.props.accessibilityElementsHidden).toBe(true)
    expect(wrapper.props.importantForAccessibility).toBe('no-hide-descendants')

    const svg = getByTestId('monthly-trend-chart-svg', { includeHiddenElements: true })
    expect(svg.props.accessibilityElementsHidden).toBeUndefined()
    expect(svg.props.importantForAccessibility).toBeUndefined()
  })
})
