// Responsive/desktop pass: DesktopSideRail is the desktop-only replacement
// for the bottom tab bar (see _layout.tsx's own header comment for why it's
// gated behind `Platform.OS === 'web'` at the mount site rather than tested
// through the full router tree — this isolates it from that gating and from
// `_layout.test.tsx`'s real-router harness, which mocks 'expo-router'
// differently).
//
// Desktop Claude Design pass: rebuilt to match the approved
// `OurMoney - Desktop.dc.html` mockup exactly, which changed three things
// this file covers:
//   - Regrouped from 4 cadence groups (everyday / insights / obligations /
//     management) to 3 (everyday / planning / household) — the mockup has
//     no separate "insights" grouping; cash-flow sits with the rest of
//     planning.
//   - Alerts dropped from the rail entirely — the approved design never
//     puts it in primary nav (10 nav destinations now, not 11). The route
//     itself is untouched; only its rail entry is gone.
//   - The "פעולות מהירות" (Quick Actions) block is gone — not in the
//     mockup — replaced by a household identity header and a signed-in-
//     member footer row (the mockup's own sidebar chrome), covered below.
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
jest.mock('@/features/auth/hooks/useProfile', () => ({
  useProfile: () => ({ displayName: 'נועם לוי', avatarUrl: null, isLoading: false }),
}))
jest.mock('@/features/household/hooks/useHousehold', () => ({
  useHousehold: () => ({
    householdId: 'household-1',
    household: { id: 'household-1', name: 'משפחת לוי' },
    role: 'admin',
    isLoading: false,
    error: null,
  }),
}))
jest.mock('@/features/household/hooks/useHouseholdMembers', () => ({
  useHouseholdMembers: () => ({ members: [{ userId: 'user-1' }, { userId: 'user-2' }], isLoading: false, error: null }),
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
// Mobile redesign: the "עוד" tab icon asks the alerts engine whether
// anything critical is hiding behind it, which pulls the whole
// Supabase-backed alert chain into this structural test. Stubbed to an
// empty result — the badge's own behavior is covered in features/alerts,
// not here.
jest.mock('@/features/alerts/hooks/useFinancialAlerts', () => ({
  useFinancialAlerts: () => ({ alerts: [], isLoading: false, hasPartialError: false }),
}))

// Avoids a deep, environment-specific import chain
// (@expo/vector-icons -> expo-font -> expo-asset) unrelated to what this
// test verifies — same rationale as _layout.test.tsx's identical mock.
jest.mock('@expo/vector-icons', () => ({
  Ionicons: () => null,
}))

// Splits the rail's buttons into the 10 grouped nav destinations vs the
// footer member/menu row — a real structural difference already in the
// JSX (accessibilityState.selected being a boolean vs undefined), not
// anything added for the test.
// qa-adversarial-reviewer note (carried over): that split is coincidental,
// not an enforced contract — nothing in _layout.tsx guarantees "sets
// accessibilityState.selected as a boolean" means "is a nav destination."
// If DesktopSideRail ever grows another button that sets (or a nav
// destination that omits) accessibilityState, re-check this filter rather
// than assuming it still holds.
// getAllByRole's return element type isn't cleanly importable in this RNTL
// version; other screen tests in this repo (e.g. settings/index.test.tsx's
// climbToPanel) use the same `any`-typed-node convention for identical
// reasons.
function navButtons(buttons: any[]) {
  return buttons.filter((b) => typeof b.props.accessibilityState?.selected === 'boolean')
}

describe('DesktopSideRail', () => {
  beforeEach(() => {
    mockPush.mockClear()
  })

  it('renders exactly the 10 navigation destinations across the 3 cadence groups, and no alerts entry', async () => {
    const { getByText, queryByText, getAllByRole } = await render(<DesktopSideRail activeSegment="dashboard" />)

    // Everyday group (no header)
    expect(getByText(i18n.t('tabs.dashboard'))).toBeTruthy()
    expect(getByText(i18n.t('tabs.transactions'))).toBeTruthy()
    expect(getByText(i18n.t('tabs.budgets'))).toBeTruthy()

    // Planning group — cash-flow, credit & payments, recurring, obligations,
    // goals, all under one group label, matching the mockup's own order.
    expect(getByText(i18n.t('nav.groups.planning'))).toBeTruthy()
    expect(getByText(i18n.t('nav.cashFlow'))).toBeTruthy()
    expect(getByText(i18n.t('nav.creditAndPayments'))).toBeTruthy()
    expect(getByText(i18n.t('settings.financial.recurring'))).toBeTruthy()
    expect(getByText(i18n.t('settings.financial.obligations'))).toBeTruthy()
    expect(getByText(i18n.t('settings.financial.goals'))).toBeTruthy()

    // Household group
    expect(getByText(i18n.t('nav.groups.household'))).toBeTruthy()
    expect(getByText(i18n.t('settings.financial.accounts'))).toBeTruthy()
    expect(getByText(i18n.t('tabs.settings'))).toBeTruthy()

    // Never a sidebar destination in the approved design.
    expect(queryByText(i18n.t('nav.alerts'))).toBeNull()
    expect(queryByText(i18n.t('nav.groups.insights'))).toBeNull()

    expect(navButtons(getAllByRole('button'))).toHaveLength(10)
  })

  it('renders the household identity header and the signed-in member footer, not a Quick Actions block', async () => {
    const { getByText, queryByText } = await render(<DesktopSideRail activeSegment="dashboard" />)

    expect(getByText('משפחת לוי')).toBeTruthy()
    expect(getByText(i18n.t('nav.householdSubtitle', { count: 2 }))).toBeTruthy()
    expect(getByText('נועם לוי')).toBeTruthy()
    expect(getByText(i18n.t('settings.household.roleAdmin'))).toBeTruthy()

    expect(queryByText(i18n.t('nav.quickActions.title'))).toBeNull()
    expect(queryByText(i18n.t('nav.quickActions.newTransaction'))).toBeNull()
  })

  it('navigates to /settings when the footer member row is pressed', async () => {
    const { getByText } = await render(<DesktopSideRail activeSegment="dashboard" />)

    await fireEvent.press(getByText('נועם לוי'))

    expect(mockPush).toHaveBeenCalledTimes(1)
    expect(mockPush).toHaveBeenCalledWith('/settings')
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

  it('marks exactly one of the 10 nav destinations as selected, never zero or more than one', async () => {
    const { getAllByRole } = await render(<DesktopSideRail activeSegment="recurring" />)

    const selected = navButtons(getAllByRole('button')).filter((b) => b.props.accessibilityState?.selected === true)
    expect(selected).toHaveLength(1)
  })
})
