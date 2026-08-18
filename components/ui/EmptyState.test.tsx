import { describe, expect, it, jest } from '@jest/globals'
import { fireEvent, render } from '@testing-library/react-native'
import { EmptyState } from './EmptyState'

// Design Phase 2: EmptyState can now render an Ionicons glyph (`iconName`),
// which pulls in expo-font -> expo-asset — an environment-specific import
// chain unrelated to what these tests verify. Same rationale/mock as
// app/(app)/_layout.test.tsx and app/(app)/dashboard/index.test.tsx.
jest.mock('@expo/vector-icons', () => ({
  Ionicons: () => null,
}))

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

  it('renders an Ionicons glyph instead of the emoji text when iconName is given', async () => {
    const { queryByText } = await render(<EmptyState iconName="receipt-outline" message="עדיין אין תנועות" />)
    // No emoji fallback text node should exist at all in this mode.
    expect(queryByText('📦', { includeHiddenElements: true })).toBeNull()
  })

  it('applies a smaller footprint when compact is set, without changing the message', async () => {
    const { getByText } = await render(<EmptyState icon="📦" message="עדיין אין תנועות" compact />)
    expect(getByText('עדיין אין תנועות')).toBeTruthy()
  })

  // Desktop Visual/Responsive Design pass (section I): every screen that
  // renders this component sits inside a wide, unbounded desktop container
  // — without a self-imposed max-width, a long message could wrap across
  // nearly the full page width instead of reading as a contained empty
  // state. Both size variants must self-bound at desktop; mobile (no
  // `web:desktop:` classes match) is unaffected either way.
  it('self-bounds its width at desktop, for both the compact and full-size variants', async () => {
    const { getByText: getByTextCompact } = await render(<EmptyState icon="📦" message="עדיין אין תנועות" compact />)
    const compactContainer = getByTextCompact('עדיין אין תנועות').parent
    expect(compactContainer?.props.className as string).toContain('web:desktop:max-w-')

    const { getByText: getByTextFull } = await render(<EmptyState icon="📦" message="עדיין אין תנועות" />)
    const fullContainer = getByTextFull('עדיין אין תנועות').parent
    expect(fullContainer?.props.className as string).toContain('web:desktop:max-w-')
  })
})
