import { describe, expect, it, jest } from '@jest/globals'
import { fireEvent, render } from '@testing-library/react-native'
import { EmptyState } from './EmptyState'

describe('EmptyState', () => {
  it('renders the message', async () => {
    const { getByText } = await render(<EmptyState icon="📦" message="עדיין אין תנועות" />)
    expect(getByText('עדיין אין תנועות')).toBeTruthy()
  })

  it('hides the decorative icon from screen readers', async () => {
    const { getByText } = await render(<EmptyState icon="📦" message="עדיין אין תנועות" />)
    const icon = getByText('📦', { includeHiddenElements: true })
    expect(icon.props.accessibilityElementsHidden).toBe(true)
    expect(icon.props.importantForAccessibility).toBe('no-hide-descendants')
  })

  it('does not render an action button when actionLabel/onAction are omitted', async () => {
    const { queryByText } = await render(<EmptyState icon="📦" message="עדיין אין תנועות" />)
    expect(queryByText('הוסף')).toBeNull()
  })

  it('renders and fires the action button when both actionLabel and onAction are provided', async () => {
    const onAction = jest.fn()
    const { getByText } = await render(
      <EmptyState icon="📦" message="עדיין אין תנועות" actionLabel="הוסף" onAction={onAction} />
    )

    fireEvent.press(getByText('הוסף'))
    expect(onAction).toHaveBeenCalledTimes(1)
  })
})
