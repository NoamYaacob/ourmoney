// Moved here from DesktopDashboard.test.tsx when the header stopped being a
// row inside one screen and became the shell band the mockup draws on every
// desktop screen. Same coverage, now pointed at the component that owns it —
// plus the two things only a shell-level bar can be asked: that it titles
// itself from the active route, and that it offers a month stepper only
// where a month is actually the screen's context.

import { beforeEach, describe, expect, it, jest } from '@jest/globals'
import { fireEvent, render } from '@testing-library/react-native'
import i18n from '@/i18n'
import { DesktopTopBar } from './DesktopTopBar'
import { formatMonthLabel, getCurrentMonthPeriodStart } from '@/features/budgets/lib/budgetPeriod'
import { useCashFlowStore } from '@/store/cashFlowStore'

const mockPush = jest.fn()
jest.mock('expo-router', () => ({
  useRouter: () => ({ push: mockPush }),
}))

beforeEach(() => {
  mockPush.mockClear()
  useCashFlowStore.setState({ horizonDays: '30' })
})

describe('DesktopTopBar', () => {
  it('titles itself from the active route segment', async () => {
    const { getByText } = await render(<DesktopTopBar activeSegment="transactions" />)
    expect(getByText(i18n.t('tabs.transactions'))).toBeTruthy()
  })

  it('shows the month stepper on a month-scoped screen', async () => {
    const { getByText, getByLabelText } = await render(<DesktopTopBar activeSegment="dashboard" />)

    expect(getByText(formatMonthLabel(getCurrentMonthPeriodStart()))).toBeTruthy()
    expect(getByLabelText(i18n.t('dashboard.previousMonth'))).toBeTruthy()
    expect(getByLabelText(i18n.t('dashboard.nextMonth'))).toBeTruthy()
  })

  it('omits the month stepper where a month is not the screen context', async () => {
    // Transactions spans whatever range its own filters select, and Accounts
    // is not month-scoped at all — a month control there would be a lie.
    const { queryByLabelText } = await render(<DesktopTopBar activeSegment="accounts" />)
    expect(queryByLabelText(i18n.t('dashboard.previousMonth'))).toBeNull()
  })

  it('is a real text field, not a disguised navigation button — typing and submitting carries the query to Transactions', async () => {
    // Regression: this used to be a Pressable with static placeholder text
    // that navigated to /transactions untouched on press, no matter what
    // (if anything) a household typed — it looked like search but had no
    // query state at all. It now hands off to Transactions' own real
    // search field via the exact same `q` route param that field itself
    // writes (features/transactions/lib/transactionFilters.ts).
    const { getByPlaceholderText } = await render(<DesktopTopBar activeSegment="dashboard" />)

    const field = getByPlaceholderText(i18n.t('dashboard.searchPlaceholder'))
    await fireEvent.changeText(field, 'שופרסל')
    await fireEvent(field, 'submitEditing')

    expect(mockPush).toHaveBeenCalledWith({ pathname: '/transactions', params: { q: 'שופרסל' } })
  })

  it('navigates to plain /transactions when submitted empty', async () => {
    const { getByPlaceholderText } = await render(<DesktopTopBar activeSegment="dashboard" />)

    await fireEvent(getByPlaceholderText(i18n.t('dashboard.searchPlaceholder')), 'submitEditing')

    expect(mockPush).toHaveBeenCalledWith('/transactions')
  })

  it('clears a typed query via the clear button', async () => {
    const { getByPlaceholderText, getByLabelText, queryByLabelText } = await render(
      <DesktopTopBar activeSegment="dashboard" />
    )

    const field = getByPlaceholderText(i18n.t('dashboard.searchPlaceholder'))
    expect(queryByLabelText(i18n.t('dashboard.searchClear'))).toBeNull()

    await fireEvent.changeText(field, 'שופרסל')
    await fireEvent.press(getByLabelText(i18n.t('dashboard.searchClear')))

    expect(field.props.value).toBe('')
  })

  it('navigates to /transactions/new when the primary action is pressed', async () => {
    const { getByText } = await render(<DesktopTopBar activeSegment="dashboard" />)

    fireEvent.press(getByText(i18n.t('transactions.addButton')))

    expect(mockPush).toHaveBeenCalledWith('/transactions/new')
  })

  it('carries no actions on a screen the mockup gives none', async () => {
    // Only the two frames the mockup draws in full carry header actions.
    // Everything else gets the title alone and keeps its own controls in
    // the screen body, which is where those frames put them.
    const { queryByText, queryByPlaceholderText } = await render(<DesktopTopBar activeSegment="accounts" />)
    expect(queryByText(i18n.t('transactions.addButton'))).toBeNull()
    expect(queryByPlaceholderText(i18n.t('dashboard.searchPlaceholder'))).toBeNull()
  })

  it('offers CSV import on Transactions, and only there', async () => {
    const onTransactions = await render(<DesktopTopBar activeSegment="transactions" />)
    expect(onTransactions.getByText(i18n.t('more.import'))).toBeTruthy()
    expect(onTransactions.queryByPlaceholderText(i18n.t('dashboard.searchPlaceholder'))).toBeNull()

    const onDashboard = await render(<DesktopTopBar activeSegment="dashboard" />)
    expect(onDashboard.queryByText(i18n.t('more.import'))).toBeNull()
  })

  it('carries the forecast horizon on Cash Flow, and writes it where the screen reads it', async () => {
    // The mockup's Cash Flow frame puts 30/60/90 in the header band rather
    // than the screen body, so the control and the screen that obeys it are
    // in different trees — the store is the join between them.
    const { getByText } = await render(<DesktopTopBar activeSegment="cash-flow" />)

    fireEvent.press(getByText(i18n.t('cashFlow.forecast.horizon.days90')))

    expect(useCashFlowStore.getState().horizonDays).toBe('90')
  })

  it('titles Cash Flow the way its header does, not the way the rail does', async () => {
    const { getByText, queryByText } = await render(<DesktopTopBar activeSegment="cash-flow" />)

    expect(getByText(i18n.t('nav.cashFlow'))).toBeTruthy()
    expect(queryByText(i18n.t('tabs.cashFlow'))).toBeNull()
  })

  it('offers the horizon selector nowhere else', async () => {
    const { queryByText } = await render(<DesktopTopBar activeSegment="dashboard" />)
    expect(queryByText(i18n.t('cashFlow.forecast.horizon.days30'))).toBeNull()
  })

  // Checkpoint 4: Home and Transactions mount their rich component starting
  // at tabletLg (1024) instead of desktop (1200) — this bar has to show
  // that early too on exactly those two routes, or the 1024-1199 range would
  // have no title at all. Every other route is unchanged (still 1200-only).
  describe('tabletLg visibility (Checkpoint 4)', () => {
    it('shows from web:tabletLg: on dashboard and transactions', async () => {
      const dashboard = await render(<DesktopTopBar activeSegment="dashboard" />)
      const dashboardBar = dashboard.getByText(i18n.t('tabs.dashboard')).parent
      expect((dashboardBar?.props.className as string) ?? '').toContain('web:tabletLg:flex')

      const transactions = await render(<DesktopTopBar activeSegment="transactions" />)
      const transactionsBar = transactions.getByText(i18n.t('tabs.transactions')).parent
      expect((transactionsBar?.props.className as string) ?? '').toContain('web:tabletLg:flex')
    })

    it('stays web:desktop:-only everywhere else', async () => {
      const { getByText } = await render(<DesktopTopBar activeSegment="accounts" />)
      const bar = getByText(i18n.t('settings.financial.accounts')).parent
      const className = (bar?.props.className as string) ?? ''
      expect(className).toContain('web:desktop:flex')
      expect(className).not.toContain('web:tabletLg:flex')
    })
  })
})
