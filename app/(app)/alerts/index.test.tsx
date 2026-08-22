import { beforeEach, describe, expect, it, jest } from '@jest/globals'
import { fireEvent, render } from '@testing-library/react-native'
import i18n from '@/i18n'
import Alerts from './index'
import type { FinancialAlert } from '@/types/app'

const mockPush = jest.fn()
jest.mock('expo-router', () => ({
  useRouter: () => ({ push: mockPush }),
}))
jest.mock('@expo/vector-icons', () => ({
  Ionicons: () => null,
}))
jest.mock('nativewind', () => ({
  useColorScheme: () => ({ colorScheme: 'light' }),
}))
jest.mock('@/features/auth/hooks/useAuth', () => ({
  useAuth: () => ({ user: { id: 'user-1' } }),
}))
jest.mock('@/features/household/hooks/useHousehold', () => ({
  useHousehold: () => ({ householdId: 'household-1', isLoading: false }),
}))

const mockUseFinancialAlerts = jest.fn<
  () => { alerts: FinancialAlert[]; isLoading: boolean; hasPartialError: boolean }
>()
jest.mock('@/features/alerts/hooks/useFinancialAlerts', () => ({
  useFinancialAlerts: () => mockUseFinancialAlerts(),
}))

function alert(overrides: Partial<FinancialAlert> = {}): FinancialAlert {
  return {
    id: 'upcoming_obligation:ob-1',
    type: 'upcoming_obligation',
    severity: 'warning',
    title: 'ארנונה בעוד 3 ימים',
    description: '₪475.00 צפויים לרדת ב-2026-08-19',
    date: '2026-08-19',
    amountAgorot: 47500,
    source: 'planned_obligation',
    sourceId: 'ob-1',
    actionRoute: '/obligations/ob-1',
    ...overrides,
  }
}

const FORECAST_ALERT = alert({
  id: 'forecast_shortfall:2026-08-18',
  type: 'forecast_shortfall',
  severity: 'critical',
  title: 'צפוי חוסר בכיסוי',
  description: 'בהתאם ליתרה ולהתחייבויות הידועות כרגע, היתרה צפויה לרדת מתחת לאפס ב-2026-08-18. חוסר צפוי של ₪124.00.',
  date: '2026-08-18',
  amountAgorot: 12400,
  source: 'cash_flow',
  sourceId: null,
  actionRoute: '/cash-flow',
})
const PRICE_INCREASE_ALERT = alert({
  id: 'recurring_price_increase:recurring:rec-1',
  type: 'recurring_price_increase',
  severity: 'warning',
  title: 'המחיר עלה',
  description: 'החיוב של אינטרנט עלה מ-₪99.00 ל-₪119.00',
  date: '2026-08-01',
  amountAgorot: 2000,
  source: 'recurring',
  sourceId: 'recurring:rec-1',
  actionRoute: '/recurring/rec-1',
})
const BUDGET_ALERT = alert({
  id: 'budget_risk:cat-1',
  type: 'budget_risk',
  severity: 'info',
  title: 'תקציב בסיכון',
  description: 'מכולת: נוצלו 85% מהתקציב',
  date: null,
  amountAgorot: null,
  source: 'budget',
  sourceId: 'cat-1',
  actionRoute: '/budgets',
})

describe('Alerts screen', () => {
  beforeEach(() => {
    mockPush.mockClear()
    mockUseFinancialAlerts.mockReset()
    mockUseFinancialAlerts.mockReturnValue({ alerts: [], isLoading: false, hasPartialError: false })
  })

  it('groups alerts by severity under the correct Hebrew headings', async () => {
    mockUseFinancialAlerts.mockReturnValue({
      alerts: [FORECAST_ALERT, alert(), BUDGET_ALERT],
      isLoading: false,
      hasPartialError: false,
    })

    const { getByText } = await render(<Alerts />)

    expect(getByText(i18n.t('alerts.groups.critical'))).toBeTruthy()
    expect(getByText(i18n.t('alerts.groups.warning'))).toBeTruthy()
    expect(getByText(i18n.t('alerts.groups.info'))).toBeTruthy()
  })

  it('does not render a severity group heading with zero alerts in it', async () => {
    mockUseFinancialAlerts.mockReturnValue({ alerts: [alert()], isLoading: false, hasPartialError: false })

    const { queryByText } = await render(<Alerts />)

    expect(queryByText(i18n.t('alerts.groups.critical'))).toBeNull()
    expect(queryByText(i18n.t('alerts.groups.info'))).toBeNull()
  })

  it('renders a forecast_shortfall alert with its date and amount in the description', async () => {
    mockUseFinancialAlerts.mockReturnValue({ alerts: [FORECAST_ALERT], isLoading: false, hasPartialError: false })

    const { getByText } = await render(<Alerts />)

    expect(getByText('צפוי חוסר בכיסוי')).toBeTruthy()
    expect(getByText(/2026-08-18/)).toBeTruthy()
    expect(getByText(/124/)).toBeTruthy()
  })

  it('renders an upcoming_obligation alert', async () => {
    mockUseFinancialAlerts.mockReturnValue({ alerts: [alert()], isLoading: false, hasPartialError: false })

    const { getByText } = await render(<Alerts />)

    expect(getByText('ארנונה בעוד 3 ימים')).toBeTruthy()
    expect(getByText(/475/)).toBeTruthy()
  })

  it('renders a recurring_price_increase alert with the exact before/after amounts', async () => {
    mockUseFinancialAlerts.mockReturnValue({
      alerts: [PRICE_INCREASE_ALERT],
      isLoading: false,
      hasPartialError: false,
    })

    const { getByText } = await render(<Alerts />)

    expect(getByText('המחיר עלה')).toBeTruthy()
    expect(getByText(/99.*119/)).toBeTruthy()
  })

  it('renders a budget_risk alert with the category name and percent', async () => {
    mockUseFinancialAlerts.mockReturnValue({ alerts: [BUDGET_ALERT], isLoading: false, hasPartialError: false })

    const { getByText } = await render(<Alerts />)

    expect(getByText(/מכולת.*85%/)).toBeTruthy()
  })

  it('navigates to the alert-specific actionRoute when a row is tapped', async () => {
    mockUseFinancialAlerts.mockReturnValue({
      alerts: [PRICE_INCREASE_ALERT],
      isLoading: false,
      hasPartialError: false,
    })

    const { getByText } = await render(<Alerts />)

    await fireEvent.press(getByText('המחיר עלה'))

    expect(mockPush).toHaveBeenCalledWith('/recurring/rec-1')
  })

  it('shows a non-blocking note when a source partially failed, while still showing the alerts that succeeded', async () => {
    mockUseFinancialAlerts.mockReturnValue({ alerts: [alert()], isLoading: false, hasPartialError: true })

    const { getByText } = await render(<Alerts />)

    expect(getByText(i18n.t('alerts.errors.partial'))).toBeTruthy()
    expect(getByText('ארנונה בעוד 3 ימים')).toBeTruthy()
  })

  // Visual QA + Desktop Polish pass: the empty state now renders twice
  // (compact mobile + full desktop, same dual-render pattern Budgets/
  // Transactions already use for their true-empty states) — getAllByText,
  // not getByText, so this doesn't assume how many of those two elements
  // render in this test's non-web render environment.
  it('shows the empty state when there are zero alerts', async () => {
    mockUseFinancialAlerts.mockReturnValue({ alerts: [], isLoading: false, hasPartialError: false })

    const { getAllByText } = await render(<Alerts />)

    expect(getAllByText(i18n.t('alerts.empty')).length).toBeGreaterThan(0)
  })

  it('shows a loading state while alerts are being gathered', async () => {
    mockUseFinancialAlerts.mockReturnValue({ alerts: [], isLoading: true, hasPartialError: false })

    const { queryByText } = await render(<Alerts />)

    expect(queryByText(i18n.t('alerts.empty'))).toBeNull()
  })
})
