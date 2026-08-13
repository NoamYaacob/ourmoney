// Regression test for the confirmed React DOM warning on web — see
// MonthlyTrendChart.test.tsx's header comment for the full mechanism and
// why this asserts the structural invariant rather than the DOM warning
// itself.
import { describe, expect, it } from '@jest/globals'
import { render } from '@testing-library/react-native'
import '@/i18n'
import { CategoryDonutChart } from './CategoryDonutChart'
import type { CategoryBreakdownEntry } from '../lib/categoryBreakdown'

const BREAKDOWN: CategoryBreakdownEntry[] = [
  { categoryId: 'groceries', spentAgorot: 400000 },
  { categoryId: 'transport', spentAgorot: 150000 },
]

describe('CategoryDonutChart', () => {
  it('puts accessibilityElementsHidden/importantForAccessibility on the wrapping View, never on Svg', async () => {
    const { getByTestId } = await render(<CategoryDonutChart breakdown={BREAKDOWN} />)

    // These elements are deliberately hidden from the accessibility tree
    // (that's the whole point of the fix), so the default queries — which
    // exclude accessibility-hidden elements — need includeHiddenElements.
    const wrapper = getByTestId('category-donut-chart-hidden-wrapper', { includeHiddenElements: true })
    expect(wrapper.props.accessibilityElementsHidden).toBe(true)
    expect(wrapper.props.importantForAccessibility).toBe('no-hide-descendants')

    const svg = getByTestId('category-donut-chart-svg', { includeHiddenElements: true })
    expect(svg.props.accessibilityElementsHidden).toBeUndefined()
    expect(svg.props.importantForAccessibility).toBeUndefined()
  })
})
