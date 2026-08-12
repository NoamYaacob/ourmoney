import { describe, expect, it } from '@jest/globals'
import { render } from '@testing-library/react-native'
import { SkeletonList } from './SkeletonList'

describe('SkeletonList', () => {
  it('exposes a single progressbar role and a non-empty label to screen readers', async () => {
    const { getByRole } = await render(<SkeletonList />)
    const wrapper = getByRole('progressbar')
    expect(wrapper.props.accessibilityLabel).toBeTruthy()
  })

  it('renders the default number of skeleton rows', async () => {
    // Rows are decorative (hidden from screen readers), so query with includeHiddenElements.
    const { getAllByTestId } = await render(<SkeletonList />)
    expect(getAllByTestId('skeleton-row', { includeHiddenElements: true })).toHaveLength(3)
  })

  it('accepts a custom row count', async () => {
    const { getAllByTestId } = await render(<SkeletonList rows={5} />)
    expect(getAllByTestId('skeleton-row', { includeHiddenElements: true })).toHaveLength(5)
  })

  it('accepts a custom row shape for chart-shaped sections', async () => {
    const { getAllByTestId } = await render(<SkeletonList rows={1} rowClassName="h-40 w-full rounded-xl" />)
    const [row] = getAllByTestId('skeleton-row', { includeHiddenElements: true })
    expect(row?.props.className).toBe('h-40 w-full rounded-xl')
  })
})
