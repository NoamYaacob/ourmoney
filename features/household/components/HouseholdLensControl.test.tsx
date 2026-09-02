import { beforeEach, describe, expect, it, jest } from '@jest/globals'
import { fireEvent, render } from '@testing-library/react-native'
import i18n from '@/i18n'
import { HouseholdLensControl } from './HouseholdLensControl'
import { useHouseholdLensStore } from '@/store/householdLensStore'
import { DEFAULT_HOUSEHOLD_LENS } from '@/features/household/lib/householdLens'

interface LensTestMember {
  userId: string
  role: 'owner' | 'member'
  joinedAt: string
  displayName: string
  avatarUrl: string | null
}
const ME: LensTestMember = { userId: 'u-noam', role: 'owner', joinedAt: '2026-01-01', displayName: 'נועם לוי', avatarUrl: null }
const PARTNER: LensTestMember = { userId: 'u-dana', role: 'member', joinedAt: '2026-01-01', displayName: 'דנה לוי', avatarUrl: null }

let mockUserId: string | undefined = ME.userId
jest.mock('@/features/auth/hooks/useAuth', () => ({
  useAuth: () => ({ user: mockUserId ? { id: mockUserId } : null }),
}))

let mockMembers: LensTestMember[] = [ME, PARTNER]
jest.mock('@/features/household/hooks/useHouseholdMembers', () => ({
  useHouseholdMembers: () => ({ members: mockMembers, isLoading: false, error: null }),
}))

beforeEach(() => {
  mockUserId = ME.userId
  mockMembers = [ME, PARTNER]
  useHouseholdLensStore.setState({ lens: DEFAULT_HOUSEHOLD_LENS })
})

describe('HouseholdLensControl', () => {
  it('renders שלנו / שלי / שלך using the real household members, none hardcoded', async () => {
    const { getByText } = await render(<HouseholdLensControl householdId="h1" />)
    expect(getByText(i18n.t('household.lens.shared'))).toBeTruthy()
    expect(getByText(i18n.t('household.lens.me'))).toBeTruthy()
    expect(getByText(i18n.t('household.lens.partner'))).toBeTruthy()
  })

  it('defaults to שלנו', async () => {
    const { getByTestId } = await render(<HouseholdLensControl householdId="h1" />)
    expect(getByTestId('household-lens-shared').props.accessibilityState.selected).toBe(true)
  })

  it('switching to שלי updates the shared store, readable by any other mounted consumer', async () => {
    const { getByText } = await render(<HouseholdLensControl householdId="h1" />)
    await fireEvent.press(getByText(i18n.t('household.lens.me')))
    expect(useHouseholdLensStore.getState().lens).toBe('me')
  })

  it('switching to שלך shows the real partner name beneath the control, not a hardcoded one', async () => {
    const { getByText } = await render(<HouseholdLensControl householdId="h1" />)
    await fireEvent.press(getByText(i18n.t('household.lens.partner')))
    expect(getByText('דנה לוי')).toBeTruthy()
  })

  it('renders nothing for a single-member household — a meaningless control stays hidden', async () => {
    mockMembers = [ME]
    const { toJSON } = await render(<HouseholdLensControl householdId="h1" />)
    expect(toJSON()).toBeNull()
  })

  it('groups 3+ members truthfully under שלך rather than naming one arbitrarily', async () => {
    mockMembers = [ME, PARTNER, { ...PARTNER, userId: 'u-third', displayName: 'אביב לוי' }]
    const { getByText } = await render(<HouseholdLensControl householdId="h1" />)
    await fireEvent.press(getByText(i18n.t('household.lens.partner')))
    expect(getByText('דנה לוי, אביב לוי')).toBeTruthy()
  })
})
