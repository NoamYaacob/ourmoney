// Visual QA + Desktop Polish pass: DesktopSideRail's Quick Actions block
// (app/(app)/_layout.tsx) now covers "new transaction" on desktop, so the
// floating action button — a mobile-web/native pattern — is hidden there via
// `web:desktop:hidden` rather than removed outright (native/mobile-web keep
// their exact original behavior). Asserts the structural fact (the class is
// present) rather than a fake pixel/viewport assertion, the same convention
// used by this app's other desktop-only-visibility regression tests.
import { describe, expect, it, jest } from '@jest/globals'
import { fireEvent, render } from '@testing-library/react-native'
import { FAB } from './FAB'

// Avoids a deep, environment-specific import chain
// (@expo/vector-icons -> expo-font -> expo-asset) unrelated to what this
// test verifies — same rationale as every other icon-rendering test in this
// repo (e.g. app/(app)/DesktopSideRail.test.tsx's identical mock).
jest.mock('@expo/vector-icons', () => ({
  Ionicons: () => null,
}))

describe('FAB', () => {
  it('calls onPress when tapped', async () => {
    const onPress = jest.fn()
    const { getByRole } = await render(<FAB accessibilityLabel="הוספת תנועה" onPress={onPress} />)

    fireEvent.press(getByRole('button'))
    expect(onPress).toHaveBeenCalledTimes(1)
  })

  it('exposes the given accessibility label', async () => {
    const { getByLabelText } = await render(<FAB accessibilityLabel="הוספת תנועה" onPress={jest.fn()} />)
    expect(getByLabelText('הוספת תנועה')).toBeTruthy()
  })

  it('declares web:desktop:hidden, so it disappears on desktop where Quick Actions already cover the same action', async () => {
    const { getByRole } = await render(<FAB accessibilityLabel="הוספת תנועה" onPress={jest.fn()} />)
    const tokens = ((getByRole('button').props.className as string | undefined) ?? '').split(/\s+/)
    expect(tokens).toContain('web:desktop:hidden')
  })
})
