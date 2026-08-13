// Responsive/desktop pass: DesktopSideRail is the desktop-only replacement
// for the bottom tab bar (see _layout.tsx's own header comment for why it's
// gated behind `Platform.OS === 'web'` at the mount site rather than tested
// through the full router tree — this isolates it from that gating and from
// `_layout.test.tsx`'s real-router harness, which mocks 'expo-router'
// differently). Covers: exactly the same 4 primary destinations as the
// mobile tab bar, no hidden route ever leaks in, and the active segment is
// marked selected — never a fake pixel/viewport assertion.
import { describe, expect, it, jest } from '@jest/globals'
import { render } from '@testing-library/react-native'
import i18n from '@/i18n'
import { DesktopSideRail } from './_layout'

jest.mock('expo-router', () => ({
  useRouter: () => ({ push: jest.fn() }),
}))
// Avoids a deep, environment-specific import chain
// (@expo/vector-icons -> expo-font -> expo-asset) unrelated to what this
// test verifies — same rationale as _layout.test.tsx's identical mock.
jest.mock('@expo/vector-icons', () => ({
  Ionicons: () => null,
}))

describe('DesktopSideRail', () => {
  it('renders exactly the 4 primary destinations, matching the mobile tab bar, and no hidden route', async () => {
    const { getByText, queryByText, getAllByRole } = await render(<DesktopSideRail activeSegment="dashboard" />)

    expect(getByText(i18n.t('tabs.dashboard'))).toBeTruthy()
    expect(getByText(i18n.t('tabs.transactions'))).toBeTruthy()
    expect(getByText(i18n.t('tabs.budgets'))).toBeTruthy()
    expect(getByText(i18n.t('tabs.settings'))).toBeTruthy()
    expect(getAllByRole('button')).toHaveLength(4)

    // None of the hidden routes (reached via Settings/a list row, never a
    // primary destination) has any label this rail could render.
    expect(queryByText('accounts')).toBeNull()
    expect(queryByText('goals')).toBeNull()
    expect(queryByText('recurring')).toBeNull()
  })

  it('marks the destination matching the current segment as selected, and no other', async () => {
    const { getByText } = await render(<DesktopSideRail activeSegment="budgets" />)

    expect(getByText(i18n.t('tabs.budgets')).parent?.props.accessibilityState).toEqual({ selected: true })
    expect(getByText(i18n.t('tabs.dashboard')).parent?.props.accessibilityState).toEqual({ selected: false })
  })
})
