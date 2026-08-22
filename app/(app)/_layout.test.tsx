// Regression test for the reported bug: Expo Router auto-registers every
// route FILE under a <Tabs> navigator's directory as a tab unless it
// explicitly opts out via `options={{ href: null }}` — every non-tab
// screen (accounts, goals, recurring, settings/categories, and every
// transactions/* screen except the list) was leaking into the tab bar as
// an extra, unlabeled tab. obligations/index and obligations/[id] had the
// same bug (missed at the time obligations/ was built, found during the
// Desktop Visual/Responsive Design pass) — now covered here too.
//
// The `renderRouter()` fixture objects below stand in for the real file
// tree — every `<Tabs.Screen name="X" .../>` the real _layout.tsx renders
// needs a matching stub entry here, or expo-router logs a harmless but
// noisy "[Layout children]: No route named X exists in nested children"
// console.warn (it can't find a screen component for a name the real
// layout referenced but this fixture never declared). transfers/[id],
// cash-flow/index, and alerts/index were added to _layout.tsx's
// Tabs.Screen list in an earlier milestone but never added to this test's
// fixture — Visual QA + Desktop Polish pass: added below so the fixture
// matches every route the real layout registers.
//
// `href: null`'s exclusion is a runtime react-navigation concept, not
// something derivable from the file tree, and it isn't observable through
// component-prop inspection either: @testing-library/react-native v14
// removed all UNSAFE_* queries (its new Test Renderer only renders host
// elements, not composite components like <Tabs.Screen>). So this test
// renders the REAL _layout.tsx through expo-router's own testing-library
// and asserts on the rendered tab bar itself — confirmed via
// node_modules/expo-router/build/react-navigation/bottom-tabs/views/BottomTabItem.js
// that a route with href: null gets no rendered button at all (its
// `button` render is skipped entirely), while a visible route renders a
// button (role: 'button' on iOS, 'tab' elsewhere — Platform.OS is 'ios' in
// this jest-expo environment) whose label is exactly that screen's
// `options.title`. Hidden routes in this layout carry no title, so the
// only user-facing text this tab bar can ever produce is the 4 real tabs'
// Hebrew titles: proving exactly those 4 render, and exactly 4 tab buttons
// exist in total, proves every other registered route stayed excluded.
import { describe, expect, it, jest } from '@jest/globals'
import { renderRouter } from 'expo-router/testing-library'
import i18n from '@/i18n'

jest.mock('@/features/auth/hooks/useBiometricGuard', () => ({
  useBiometricGuard: () => ({ isLocked: false }),
}))
jest.mock('@/features/auth/hooks/useAuth', () => ({
  useAuth: () => ({ session: null, user: { id: 'user-1' }, isLoading: false }),
}))
jest.mock('@/features/household/hooks/useHousehold', () => ({
  useHousehold: () => ({ householdId: 'household-1', household: null, isLoading: false, error: null }),
}))
jest.mock('@/features/transactions/hooks/useTransactionsRealtimeSync', () => ({
  useTransactionsRealtimeSync: () => undefined,
}))
jest.mock('@/features/recurring/hooks/useGenerateRecurringTransactions', () => ({
  useGenerateRecurringTransactions: () => undefined,
}))
jest.mock('@/features/installments/hooks/useGenerateInstallmentTransactions', () => ({
  useGenerateInstallmentTransactions: () => undefined,
}))
// Avoids a deep, environment-specific import chain
// (@expo/vector-icons -> expo-font -> expo-asset) unrelated to what this
// test verifies — same rationale as mocking any other icon/asset library
// in a structural test.
jest.mock('@expo/vector-icons', () => ({
  Ionicons: () => null,
}))

const STUB_SCREEN = { default: () => null }

describe('app/(app)/_layout — tab bar route exclusions', () => {
  it('shows only the 4 product tabs in the tab bar, and no button for any other registered route', async () => {
    // @testing-library/react-native v14 made `render` async; expo-router's
    // `renderRouter` (built against the older sync API) doesn't await it
    // internally, so it hands back the in-flight render Promise rather
    // than the resolved query object — awaiting it here gets the real
    // result the same way `render()` callers elsewhere in this repo do.
    const result = await renderRouter(
      {
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        _layout: { default: require('./_layout').default },
        'dashboard/index': STUB_SCREEN,
        'transactions/index': STUB_SCREEN,
        'transactions/new': STUB_SCREEN,
        'transactions/[id]': STUB_SCREEN,
        'transactions/import': STUB_SCREEN,
        'budgets/index': STUB_SCREEN,
        'settings/index': STUB_SCREEN,
        'settings/categories': STUB_SCREEN,
        'accounts/index': STUB_SCREEN,
        'accounts/[id]': STUB_SCREEN,
        'goals/index': STUB_SCREEN,
        'goals/[id]': STUB_SCREEN,
        'recurring/index': STUB_SCREEN,
        'recurring/[id]': STUB_SCREEN,
        'obligations/index': STUB_SCREEN,
        'obligations/[id]': STUB_SCREEN,
        'installments/index': STUB_SCREEN,
        'installments/[id]': STUB_SCREEN,
        'transfers/[id]': STUB_SCREEN,
        'cash-flow/index': STUB_SCREEN,
        'alerts/index': STUB_SCREEN,
      },
      { initialUrl: '/dashboard' }
    )

    expect(result.getByText(i18n.t('tabs.dashboard'))).toBeTruthy()
    expect(result.getByText(i18n.t('tabs.transactions'))).toBeTruthy()
    expect(result.getByText(i18n.t('tabs.budgets'))).toBeTruthy()
    expect(result.getByText(i18n.t('tabs.settings'))).toBeTruthy()

    // Every stub screen renders null and the biometric overlay is not
    // shown (isLocked: false mocked above), so the only buttons that can
    // possibly render anywhere in this tree are the tab bar's own — one
    // per tab-bar-visible route. If a hidden route regressed back into
    // visibility, its route name would render as an untitled 5th button.
    expect(result.getAllByRole('button')).toHaveLength(4)
  })

  // Desktop polish pass regression: a real-browser visual check found the
  // desktop side rail rendering on the LEFT of an RTL (Hebrew) app — wrong.
  // Root cause: plain `flex-row` doesn't auto-mirror on web the way native
  // Yoga does (see DesktopSideRail's own header comment), so the fix is an
  // explicit `flex-row-reverse` on the wrapper. This can't be exercised
  // end-to-end here (Platform.OS is 'ios' in jest-expo, so the rail itself
  // never mounts — see the test above), but the wrapper's className is
  // static JSX and renders regardless of platform, so this asserts the
  // structural fact that actually matters: the source declares the
  // reversed direction, not a fake pixel/viewport assertion.
  //
  // Visual QA + Desktop Polish pass: this test previously matched
  // `className.includes('web:flex-row')`, which is satisfied by BOTH
  // `web:flex-row` and `web:flex-row-reverse` (the former is a literal
  // substring of the latter) — so it silently kept passing through a real
  // regression where the wrapper reverted to plain `web:flex-row` (rail
  // rendered on the wrong side again). Rewritten to tokenize each
  // className on whitespace and check for exact token membership, so it
  // can actually distinguish the two and fail if the wrong one reappears.
  it('declares the desktop rail wrapper as flex-row-reverse, not flex-row, for correct RTL placement', async () => {
    const result = await renderRouter(
      {
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        _layout: { default: require('./_layout').default },
        'dashboard/index': STUB_SCREEN,
        'transactions/index': STUB_SCREEN,
        'transactions/new': STUB_SCREEN,
        'transactions/[id]': STUB_SCREEN,
        'transactions/import': STUB_SCREEN,
        'budgets/index': STUB_SCREEN,
        'settings/index': STUB_SCREEN,
        'settings/categories': STUB_SCREEN,
        'accounts/index': STUB_SCREEN,
        'accounts/[id]': STUB_SCREEN,
        'goals/index': STUB_SCREEN,
        'goals/[id]': STUB_SCREEN,
        'recurring/index': STUB_SCREEN,
        'recurring/[id]': STUB_SCREEN,
        'obligations/index': STUB_SCREEN,
        'obligations/[id]': STUB_SCREEN,
        'installments/index': STUB_SCREEN,
        'installments/[id]': STUB_SCREEN,
        'transfers/[id]': STUB_SCREEN,
        'cash-flow/index': STUB_SCREEN,
        'alerts/index': STUB_SCREEN,
      },
      { initialUrl: '/dashboard' }
    )

    // Exact whitespace-token membership, not a substring match — see the
    // test's own header comment above for why a substring check can't tell
    // `web:flex-row` and `web:flex-row-reverse` apart.
    function hasExactClassToken(node: unknown, token: string): boolean {
      if (!node || typeof node !== 'object') return false
      if (Array.isArray(node)) return node.some((n) => hasExactClassToken(n, token))
      // react-test-renderer's toJSON() shape is {type, props, children} —
      // `children` is a sibling of `props`, not nested inside it.
      const asRecord = node as { props?: { className?: unknown }; children?: unknown }
      if (typeof asRecord.props?.className === 'string' && asRecord.props.className.split(/\s+/).includes(token)) {
        return true
      }
      return hasExactClassToken(asRecord.children, token)
    }

    const tree = result.toJSON()
    expect(hasExactClassToken(tree, 'web:flex-row-reverse')).toBe(true)
    // The regression this test exists to catch: the wrapper reverting to
    // the bare (non-reversed) form. Asserted as a separate node, not just
    // "not exactly one match," so this fails clearly if the wrapper is ever
    // rendered with BOTH classes at once (which would be a different bug).
    expect(hasExactClassToken(tree, 'web:flex-row')).toBe(false)
  })
})
