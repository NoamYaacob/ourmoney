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

const mockPush = jest.fn()
jest.mock('expo-router', () => ({
  useRouter: () => ({ push: mockPush }),
}))

beforeEach(() => {
  mockPush.mockClear()
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

  it('navigates to /transactions when the search affordance is pressed', async () => {
    const { getByText } = await render(<DesktopTopBar activeSegment="dashboard" />)

    fireEvent.press(getByText(i18n.t('dashboard.searchPlaceholder')))

    expect(mockPush).toHaveBeenCalledWith('/transactions')
  })

  it('navigates to /transactions/new when the primary action is pressed', async () => {
    const { getByText } = await render(<DesktopTopBar activeSegment="dashboard" />)

    fireEvent.press(getByText(i18n.t('transactions.addButton')))

    expect(mockPush).toHaveBeenCalledWith('/transactions/new')
  })

  it('renders nothing recognisable for an unknown segment rather than crashing', async () => {
    // A route with no title mapping (a detail screen, say) still gets the
    // bar's actions — it just has no title of its own.
    const { getByText } = await render(<DesktopTopBar activeSegment="not-a-real-segment" />)
    expect(getByText(i18n.t('transactions.addButton'))).toBeTruthy()
  })
})
