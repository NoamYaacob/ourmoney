// Screen-level regression tests for Settings' newly-added household/profile
// management affordances (rename household, remove member, leave household,
// edit display name). Every hook this screen touches is mocked — this
// proves the screen's own gating logic (who sees which control) and wiring
// (which mutation a press calls, with what args), not the hooks' own
// Supabase behavior, which is covered by each hook's own unit test. Follows
// app/(app)/transactions/import.test.tsx's established screen-testing
// conventions: mock expo-router, mock Supabase-backed hooks, mock
// @expo/vector-icons to dodge a known expo-asset hoisting gap, `await
// render`/`await fireEvent.press` (async in this repo's
// @testing-library/react-native v14), real Hebrew strings via '@/i18n'.
import { afterEach, describe, expect, it, jest } from '@jest/globals'
import { fireEvent, render, waitFor } from '@testing-library/react-native'
import '@/i18n'
import Settings from './index'
import type { HouseholdMemberWithProfile, HouseholdRole } from '@/types/app'

jest.mock('expo-router', () => ({
  useRouter: () => ({ push: jest.fn() }),
}))
jest.mock('nativewind', () => ({
  useColorScheme: () => ({ colorScheme: 'light' }),
}))
jest.mock('@expo/vector-icons', () => ({
  Ionicons: () => null,
}))

const mockUseHousehold = jest.fn()
jest.mock('@/features/household/hooks/useHousehold', () => ({
  useHousehold: (...args: unknown[]) => mockUseHousehold(...args),
}))

const mockUseHouseholdMembers = jest.fn()
jest.mock('@/features/household/hooks/useHouseholdMembers', () => ({
  useHouseholdMembers: (...args: unknown[]) => mockUseHouseholdMembers(...args),
}))

const mockUpdateHouseholdMutate = jest.fn()
jest.mock('@/features/household/hooks/useUpdateHousehold', () => ({
  useUpdateHousehold: () => ({ mutate: mockUpdateHouseholdMutate, isPending: false, isError: false }),
}))

const mockRemoveMemberMutate = jest.fn()
jest.mock('@/features/household/hooks/useRemoveHouseholdMember', () => ({
  useRemoveHouseholdMember: () => ({ mutate: mockRemoveMemberMutate, isPending: false, isError: false }),
}))

jest.mock('@/features/household/hooks/useCreateInvitation', () => ({
  useCreateInvitation: () => ({ mutate: jest.fn(), isPending: false, isError: false }),
}))

jest.mock('@/features/auth/hooks/useAuth', () => ({
  useAuth: () => ({ user: { id: 'user-1' }, session: null, isLoading: false }),
}))

const mockUseProfile = jest.fn()
jest.mock('@/features/auth/hooks/useProfile', () => ({
  useProfile: (...args: unknown[]) => mockUseProfile(...args),
}))

const mockUpdateProfileMutate = jest.fn()
jest.mock('@/features/auth/hooks/useUpdateProfile', () => ({
  useUpdateProfile: () => ({ mutate: mockUpdateProfileMutate, isPending: false, isError: false }),
}))

jest.mock('@/features/auth/hooks/useBiometricPreference', () => ({
  useBiometricPreference: () => ({ enabled: false, setEnabled: jest.fn(), isLoading: false }),
}))
jest.mock('@/features/auth/hooks/useSignOut', () => ({
  useSignOut: () => ({ mutate: jest.fn() }),
}))
jest.mock('@/features/auth/hooks/useDeleteUserAccount', () => ({
  useDeleteUserAccount: () => ({ mutate: jest.fn(), isPending: false, isError: false }),
}))
jest.mock('@/features/settings/hooks/useTheme', () => ({
  useTheme: () => ({ preference: 'system', setPreference: jest.fn() }),
}))

function setHousehold(role: HouseholdRole | null) {
  mockUseHousehold.mockReturnValue({
    householdId: 'household-1',
    household: { id: 'household-1', name: 'Cohen', currency: 'ILS' },
    role,
    isLoading: false,
    error: null,
  })
}

function setMembers(members: HouseholdMemberWithProfile[]) {
  mockUseHouseholdMembers.mockReturnValue({ members, isLoading: false, error: null })
}

const ADMIN_MEMBER: HouseholdMemberWithProfile = {
  userId: 'user-1',
  role: 'admin',
  joinedAt: '2026-01-01',
  displayName: 'Dana Cohen',
  avatarUrl: null,
}
const OTHER_MEMBER: HouseholdMemberWithProfile = {
  userId: 'user-2',
  role: 'member',
  joinedAt: '2026-02-01',
  displayName: 'Yossi Cohen',
  avatarUrl: null,
}
// The current viewer (useAuth is mocked to user-1 for every test in this
// file) as a plain member, for the "viewer is a member" scenarios — a
// different admin (user-3) owns the household in those cases.
const SELF_AS_MEMBER: HouseholdMemberWithProfile = {
  userId: 'user-1',
  role: 'member',
  joinedAt: '2026-02-01',
  displayName: 'Yossi Cohen',
  avatarUrl: null,
}
const OTHER_ADMIN: HouseholdMemberWithProfile = {
  userId: 'user-3',
  role: 'admin',
  joinedAt: '2026-01-01',
  displayName: 'Dana Cohen',
  avatarUrl: null,
}

describe('Settings screen — household/profile management', () => {
  afterEach(() => {
    jest.clearAllMocks()
  })

  it('shows the household rename affordance for an admin, and can save a new name', async () => {
    setHousehold('admin')
    setMembers([ADMIN_MEMBER])
    mockUseProfile.mockReturnValue({ displayName: 'Dana Cohen', avatarUrl: null, isLoading: false })

    const { getByText, getByLabelText } = await render(<Settings />)

    await fireEvent.press(getByText('עריכת שם משק הבית'))
    const input = getByLabelText('שם משק הבית')
    await fireEvent.changeText(input, 'Cohen-Levi')
    await fireEvent.press(getByText('שמירה'))

    await waitFor(() => expect(mockUpdateHouseholdMutate).toHaveBeenCalledWith('Cohen-Levi', expect.anything()))
  })

  it('does not show the household rename affordance for a member', async () => {
    setHousehold('member')
    setMembers([OTHER_ADMIN, SELF_AS_MEMBER])
    mockUseProfile.mockReturnValue({ displayName: 'Yossi Cohen', avatarUrl: null, isLoading: false })

    const { queryByText } = await render(<Settings />)

    expect(queryByText('עריכת שם משק הבית')).toBeNull()
  })

  it('shows a remove button next to a non-admin member for an admin viewer, and calls the remove mutation on confirm', async () => {
    setHousehold('admin')
    setMembers([ADMIN_MEMBER, OTHER_MEMBER])
    mockUseProfile.mockReturnValue({ displayName: 'Dana Cohen', avatarUrl: null, isLoading: false })

    const { getByText, getAllByText } = await render(<Settings />)

    // Exactly one remove button — the non-admin member's row, never the
    // admin's own row.
    expect(getAllByText('הסרה')).toHaveLength(1)

    await fireEvent.press(getAllByText('הסרה')[0]!)
    await waitFor(() => expect(getByText('הסרת חבר/ה ממשק הבית')).toBeTruthy())

    // The confirm dialog's own confirm button shares the same Hebrew label
    // ("הסרה") as the row's trigger button, which is still mounted behind
    // the modal — press the last match, the dialog's own button.
    const removeButtons = getAllByText('הסרה')
    await fireEvent.press(removeButtons[removeButtons.length - 1]!)

    await waitFor(() =>
      expect(mockRemoveMemberMutate).toHaveBeenCalledWith(
        { householdId: 'household-1', userId: 'user-2' },
        expect.anything()
      )
    )
  })

  it('never shows a remove button for a member viewer (non-admin)', async () => {
    setHousehold('member')
    setMembers([OTHER_ADMIN, SELF_AS_MEMBER])
    mockUseProfile.mockReturnValue({ displayName: 'Yossi Cohen', avatarUrl: null, isLoading: false })

    const { queryByText } = await render(<Settings />)

    expect(queryByText('הסרה')).toBeNull()
  })

  it('shows the leave-household button for a member (self), and calls the remove mutation self-targeted on confirm', async () => {
    setHousehold('member')
    setMembers([OTHER_ADMIN, SELF_AS_MEMBER])
    mockUseProfile.mockReturnValue({ displayName: 'Yossi Cohen', avatarUrl: null, isLoading: false })

    const { getByText } = await render(<Settings />)

    await fireEvent.press(getByText('עזיבת משק הבית'))
    await waitFor(() => expect(getByText('עזיבה')).toBeTruthy())
    await fireEvent.press(getByText('עזיבה'))

    await waitFor(() =>
      expect(mockRemoveMemberMutate).toHaveBeenCalledWith(
        { householdId: 'household-1', userId: 'user-1' },
        expect.anything()
      )
    )
  })

  it('never shows the leave-household button for an admin', async () => {
    setHousehold('admin')
    setMembers([ADMIN_MEMBER, OTHER_MEMBER])
    mockUseProfile.mockReturnValue({ displayName: 'Dana Cohen', avatarUrl: null, isLoading: false })

    const { queryByText } = await render(<Settings />)

    expect(queryByText('עזיבת משק הבית')).toBeNull()
  })

  it('edits and saves the display name', async () => {
    setHousehold('admin')
    setMembers([ADMIN_MEMBER])
    mockUseProfile.mockReturnValue({ displayName: 'Dana Cohen', avatarUrl: null, isLoading: false })

    const { getByText, getByLabelText } = await render(<Settings />)

    await fireEvent.press(getByText('עריכת שם תצוגה'))
    const input = getByLabelText('שם תצוגה')
    await fireEvent.changeText(input, 'Dana Levi')
    await fireEvent.press(getByText('שמירה'))

    await waitFor(() => expect(mockUpdateProfileMutate).toHaveBeenCalledWith('Dana Levi', expect.anything()))
  })
})
