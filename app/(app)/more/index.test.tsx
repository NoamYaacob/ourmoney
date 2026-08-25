// Part 24 of the product-quality audit: More is the mobile-only "fifth
// tab" — every row on it already has its own permanent desktop sidebar
// link, so a desktop visitor (only reachable via a direct URL, since the
// sidebar itself never links here) should be sent to Dashboard instead of
// seeing a second, differently-styled copy of navigation they already had.
// Covers only the width-branch itself; MoreContent's own rows are mobile-
// only rendering already covered by this screen's normal usage elsewhere.
import { beforeEach, describe, expect, it, jest } from '@jest/globals'
import { render } from '@testing-library/react-native'
import More from './index'

jest.mock('@expo/vector-icons', () => ({
  Ionicons: () => null,
}))

let mockWidth = 390
jest.mock('react-native/Libraries/Utilities/useWindowDimensions', () => ({
  __esModule: true,
  default: () => ({ width: mockWidth, height: 800, scale: 1, fontScale: 1 }),
}))

let mockPlatformOS: 'web' | 'ios' = 'ios'
jest.mock('react-native/Libraries/Utilities/Platform', () => ({
  __esModule: true,
  default: {
    get OS() {
      return mockPlatformOS
    },
    select: (obj: Record<string, unknown>) => obj[mockPlatformOS] ?? obj.default,
  },
}))

const mockRedirect = jest.fn((_props: { href: string }) => null)
jest.mock('expo-router', () => ({
  useRouter: () => ({ push: jest.fn() }),
  Redirect: (props: { href: string }) => mockRedirect(props),
}))

jest.mock('@/features/auth/hooks/useAuth', () => ({ useAuth: () => ({ user: { id: 'user-1' } }) }))
jest.mock('@/features/auth/hooks/useProfile', () => ({ useProfile: () => ({ displayName: 'נועם', avatarUrl: null }) }))
jest.mock('@/features/household/hooks/useHousehold', () => ({
  useHousehold: () => ({ householdId: 'household-1', household: { name: 'משפחת לוי' } }),
}))
jest.mock('@/features/household/hooks/useHouseholdMembers', () => ({ useHouseholdMembers: () => ({ members: [] }) }))
jest.mock('@/features/alerts/hooks/useFinancialAlerts', () => ({ useFinancialAlerts: () => ({ alerts: [] }) }))
jest.mock('@/features/savings/hooks/useSavingsGoals', () => ({ useSavingsGoals: () => ({ goals: [] }) }))
jest.mock('@/features/cashflow/hooks/useUpcomingCommitments', () => ({ useUpcomingCommitments: () => ({ commitments: [] }) }))
jest.mock('@/features/cashflow/hooks/useSafeToSpend', () => ({
  useSafeToSpend: () => ({ result: { availableCashAgorot: 0 } }),
}))

describe('More', () => {
  beforeEach(() => {
    mockRedirect.mockClear()
  })

  it('renders its own mobile-only navigation index on a phone', async () => {
    mockPlatformOS = 'ios'
    mockWidth = 390

    const { getByText } = await render(<More />)

    expect(getByText('נועם')).toBeTruthy()
    expect(mockRedirect).not.toHaveBeenCalled()
  })

  it('redirects to Dashboard on desktop web, where every row here already has a sidebar link', async () => {
    mockPlatformOS = 'web'
    mockWidth = 1440

    await render(<More />)

    expect(mockRedirect).toHaveBeenCalledWith({ href: '/dashboard' })
  })

  it('does not redirect at a merely wide mobile-web width below the desktop breakpoint', async () => {
    mockPlatformOS = 'web'
    mockWidth = 1024

    const { getByText } = await render(<More />)

    expect(getByText('נועם')).toBeTruthy()
    expect(mockRedirect).not.toHaveBeenCalled()
  })
})
