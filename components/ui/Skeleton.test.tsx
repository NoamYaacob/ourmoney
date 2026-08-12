import { describe, expect, it } from '@jest/globals'
import { render } from '@testing-library/react-native'
import { Skeleton } from './Skeleton'

describe('Skeleton', () => {
  it('is hidden from screen readers — a placeholder shape carries no information', async () => {
    const { getByTestId } = await render(<Skeleton testID="skeleton" />)
    const node = getByTestId('skeleton', { includeHiddenElements: true })
    expect(node.props.accessibilityElementsHidden).toBe(true)
    expect(node.props.importantForAccessibility).toBe('no-hide-descendants')
  })

  it('accepts a custom className to control its shape', async () => {
    const { getByTestId } = await render(<Skeleton testID="skeleton" className="h-10 w-10 rounded-full" />)
    const node = getByTestId('skeleton', { includeHiddenElements: true })
    expect(node.props.className).toBe('h-10 w-10 rounded-full')
  })
})
