// Responsive/desktop pass: DesktopSideRail is the desktop-only replacement
// for the bottom tab bar (see _layout.tsx's own header comment for why it's
// gated behind `Platform.OS === 'web'` at the mount site rather than tested
// through the full router tree — this isolates it from that gating and from
// `_layout.test.tsx`'s real-router harness, which mocks 'expo-router'
// differently).
//
// Desktop Visual/Responsive Design pass (section H): the rail grew from 4
// flat destinations to 10, grouped by cadence so it doesn't read as one list
// of equally-weighted rows. Visual QA + Desktop Polish pass: the original
// single 5-item "planning" group (cash-flow, alerts, recurring, goals,
// obligations) was split into "insights" (cash-flow, alerts) and
// "obligations" (recurring, goals, obligations) — a real-browser screenshot
// review found the single group's label too generic to clearly signal that
// the household's ongoing financial commitments lived in there, alongside
// the analytical cash-flow/alerts screens. Four groups total now: everyday
// (no header) / insights / obligations / management. This file covers:
// every destination renders with the right label, the group headers render
// (and the primary group has none), and the active segment is marked
// selected — never a fake pixel/viewport assertion.
//
// Visual QA + Desktop Polish pass: the rail also grew a "פעולות מהירות"
// (Quick Actions) block above the grouped destinations — New Transaction,
// Import CSV, Manage Accounts. `getAllByRole('button')` now returns 13
// buttons (10 nav destinations + 3 quick actions), not 10, which broke the
// old blanket button-count assertion. Rather than just bumping the expected
// count to 13 (which would silently pass even if a quick action disappeared
// and a random extra nav destination took its place), nav destinations and
// quick actions are now asserted separately, using a structural signal
// that's already true of the real JSX rather than anything added for the
// test: every nav-destination Pressable sets an explicit
// `accessibilityState={{ selected: focused }}` (a real boolean), while
// every quick-action Pressable sets no accessibilityState at all (so RNTL
// reports `selected: undefined`). That distinction is what `navButtons`/
// `quickActionButtons` split on below.
import { beforeEach, describe, expect, it, jest } from '@jest/globals'
import { render, fireEvent } from '@testing-library/react-native'
import i18n from '@/i18n'
import { DesktopSideRail } from './_layout'

const mockPush = jest.fn()
jest.mock('expo-router', () => ({
  useRouter: () => ({ push: mockPush }),
}))

// DesktopSideRail is exported from the full authenticated layout module, so
// importing it also evaluates hooks used only by AppLayout. Keep this unit
// test focused on the rail and prevent those unrelated hooks from reaching
// the real Supabase client/configuration. These mocks are deliberately the
// same isolation boundary used by the full _layout router regression test.
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

// Avoids a deep, environment-specific import chain
// (@expo/vector-icons -> expo-font -> expo-asset) unrelated to what this
// test verifies — same rationale as _layout.test.tsx's identical mock.
jest.mock('@expo/vector-icons', () => ({
  Ionicons: () => null,
}))

// Splits the rail's buttons into the 10 grouped nav destinations vs the 3
// Quick Actions — see the file header comment for why this split is based
// on a real structural difference in the JSX (accessibilityState.selected
// being a boolean vs undefined), not an artificial test-only marker.
// qa-adversarial-reviewer note: that split is coincidental, not an enforced
// contract — nothing in _layout.tsx guarantees "sets accessibilityState.
// selected as a boolean" means "is a nav destination." If DesktopSideRail
// ever grows another button that sets (or a nav destination that omits)
// accessibilityState, re-check this filter rather than assuming it still
// holds.
// getAllByRole's return element type isn't cleanly importable in this RNTL
// version; other screen tests in this repo (e.g. settings/index.test.tsx's
// climbToPanel) use the same `any`-typed-node convention for identical
// reasons.
function navButtons(buttons: any[]) {
  return buttons.filter((b) => typeof b.props.accessibilityState?.selected === 'boolean')
}
function quickActionButtons(buttons: any[]) {
  return buttons.filter((b) => typeof b.props.accessibilityState?.selected !== 'boolean')
}

describe('DesktopSideRail', () => {
  beforeEach(() => {
    mockPush.mockClear()
  })

  it('renders exactly the 11 navigation destinations across the 4 cadence groups', async () => {
    const { getByText, getAllByRole } = await render(<DesktopSideRail activeSegment="dashboard" />)

    // Everyday group (no header)
    expect(getByText(i18n.t('tabs.dashboard'))).toBeTruthy()
    expect(getByText(i18n.t('tabs.transactions'))).toBeTruthy()
    expect(getByText(i18n.t('tabs.budgets'))).toBeTruthy()

    // Insights group
    expect(getByText(i18n.t('nav.groups.insights'))).toBeTruthy()
    expect(getByText(i18n.t('nav.cashFlow'))).toBeTruthy()
    expect(getByText(i18n.t('nav.alerts'))).toBeTruthy()

    // Planning & obligations group
    expect(getByText(i18n.t('nav.groups.obligations'))).toBeTruthy()
    expect(getByText(i18n.t('settings.financial.recurring'))).toBeTruthy()
    expect(getByText(i18n.t('settings.financial.goals'))).toBeTruthy()
    expect(getByText(i18n.t('settings.financial.obligations'))).toBeTruthy()
    expect(getByText(i18n.t('settings.financial.installments'))).toBeTruthy()

    // Management group
    expect(getByText(i18n.t('nav.groups.management'))).toBeTruthy()
    expect(getByText(i18n.t('settings.financial.accounts'))).toBeTruthy()
    expect(getByText(i18n.t('tabs.settings'))).toBeTruthy()

    expect(navButtons(getAllByRole('button'))).toHaveLength(11)
  })

  // Quick Actions are tested separately from nav destinations per the file
  // header comment. The rail's own "פעולות מהירות" block now goes through
  // i18n (nav.quickActions.* in i18n/locales/he.json) rather than hardcoded
  // Hebrew literals — asserted here via i18n.t(...), the same convention
  // every other label in this file already uses, so a future wording
  // change updates one place, not both the component and this test.
  it('renders exactly 3 Quick Actions, distinct from the 10 nav destinations', async () => {
    const { getAllByRole, getByText } = await render(<DesktopSideRail activeSegment="dashboard" />)

    const buttons = getAllByRole('button')
    expect(quickActionButtons(buttons)).toHaveLength(3)
    expect(navButtons(buttons)).toHaveLength(11)
    expect(buttons).toHaveLength(14)

    expect(getByText(i18n.t('nav.quickActions.title'))).toBeTruthy()
    expect(getByText(i18n.t('nav.quickActions.newTransaction'))).toBeTruthy()
    expect(getByText(i18n.t('nav.quickActions.importCsv'))).toBeTruthy()
    expect(getByText(i18n.t('nav.quickActions.manageAccounts'))).toBeTruthy()
  })

  it('navigates to /transactions/new when the "New Transaction" quick action is pressed', async () => {
    const { getByText } = await render(<DesktopSideRail activeSegment="dashboard" />)

    await fireEvent.press(getByText(i18n.t('nav.quickActions.newTransaction')))

    expect(mockPush).toHaveBeenCalledTimes(1)
    expect(mockPush).toHaveBeenCalledWith('/transactions/new')
  })

  it('navigates to /transactions/import when the "Import CSV" quick action is pressed', async () => {
    const { getByText } = await render(<DesktopSideRail activeSegment="dashboard" />)

    await fireEvent.press(getByText(i18n.t('nav.quickActions.importCsv')))

    expect(mockPush).toHaveBeenCalledTimes(1)
    expect(mockPush).toHaveBeenCalledWith('/transactions/import')
  })

  it('navigates to /accounts when the "Manage Accounts" quick action is pressed', async () => {
    const { getByText } = await render(<DesktopSideRail activeSegment="dashboard" />)

    await fireEvent.press(getByText(i18n.t('nav.quickActions.manageAccounts')))

    expect(mockPush).toHaveBeenCalledTimes(1)
    expect(mockPush).toHaveBeenCalledWith('/accounts')
  })

  it('marks the destination matching the current segment as selected, and no other', async () => {
    const { getByText } = await render(<DesktopSideRail activeSegment="budgets" />)

    expect(getByText(i18n.t('tabs.budgets')).parent?.props.accessibilityState).toEqual({ selected: true })
    expect(getByText(i18n.t('tabs.dashboard')).parent?.props.accessibilityState).toEqual({ selected: false })
  })

  it('marks a planning-group destination (e.g. cash flow) as selected when it is the active segment', async () => {
    const { getByText } = await render(<DesktopSideRail activeSegment="cash-flow" />)

    expect(getByText(i18n.t('nav.cashFlow')).parent?.props.accessibilityState).toEqual({ selected: true })
    expect(getByText(i18n.t('tabs.dashboard')).parent?.props.accessibilityState).toEqual({ selected: false })
  })

  // Exactly one nav destination is ever marked selected at a time, even
  // though the rail now renders 14 total buttons — the Quick Actions never
  // participate in "selected" semantics (they're actions, not destinations
  // that can be "current"), so this counts only within navButtons().
  it('marks exactly one of the 11 nav destinations as selected, never zero or more than one', async () => {
    const { getAllByRole } = await render(<DesktopSideRail activeSegment="recurring" />)

    const selected = navButtons(getAllByRole('button')).filter((b) => b.props.accessibilityState?.selected === true)
    expect(selected).toHaveLength(1)
  })
})
