// Responsive/desktop pass: DesktopSideRail is the desktop-only replacement
// for the bottom tab bar (see _layout.tsx's own header comment for why it's
// gated behind `Platform.OS === 'web'` at the mount site rather than tested
// through the full router tree — this isolates it from that gating and from
// `_layout.test.tsx`'s real-router harness, which mocks 'expo-router'
// differently).
//
// Desktop Visual/Responsive Design pass (section H): the rail grew from 4
// flat destinations to 10, grouped by cadence (everyday / planning /
// management) so it doesn't read as one list of equally-weighted rows. This
// file now covers: every destination renders with the right label, the
// group headers render (and the primary group has none), and the active
// segment is marked selected — never a fake pixel/viewport assertion.
import { describe, expect, it, jest } from '@jest/globals'
import { render } from '@testing-library/react-native'
import i18n from '@/i18n'
import { DesktopSideRail } from './_layout'

jest.mock('expo-router', () => ({
  useRouter: () => ({ push: jest.fn() }),
}))

// DesktopSideRail is exported from the full authenticated layout module, so
// importing it also evaluates hooks used only by AppLayout. Keep this unit
// test focused on the rail and prevent those unrelated hooks from reaching
// the real Supabase client/configuration.
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

describe('DesktopSideRail', () => {
  it('renders all 10 destinations across the 3 cadence groups', async () => {
    const { getByText, getAllByRole } = await render(<DesktopSideRail activeSegment="dashboard" />)

    // Everyday group (no header)
    expect(getByText(i18n.t('tabs.dashboard'))).toBeTruthy()
    expect(getByText(i18n.t('tabs.transactions'))).toBeTruthy()
    expect(getByText(i18n.t('tabs.budgets'))).toBeTruthy()

    // Planning & insights group
    expect(getByText(i18n.t('nav.groups.planning'))).toBeTruthy()
    expect(getByText(i18n.t('nav.cashFlow'))).toBeTruthy()
    expect(getByText(i18n.t('nav.alerts'))).toBeTruthy()
    expect(getByText(i18n.t('settings.financial.recurring'))).toBeTruthy()
    expect(getByText(i18n.t('settings.financial.goals'))).toBeTruthy()
    expect(getByText(i18n.t('settings.financial.obligations'))).toBeTruthy()

    // Management group
    expect(getByText(i18n.t('nav.groups.management'))).toBeTruthy()
    expect(getByText(i18n.t('settings.financial.accounts'))).toBeTruthy()
    expect(getByText(i18n.t('tabs.settings'))).toBeTruthy()

    expect(getAllByRole('button')).toHaveLength(10)
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
})
