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

// Climbs from a title up to its shared desktop panel wrapper by matching
// the panel's own marker class, rather than a fixed number of `.parent`
// hops — resilient to the exact nesting (SettingsSection's own `mb-6`
// wrapper, this screen's panel) between the queried text and the panel.
function climbToPanel(textNode: any) {
  let current = textNode
  while (current && !((current.props?.className as string | undefined) ?? '').includes('web:desktop:rounded-card')) {
    current = current.parent
  }
  return current
}

// Same climb-by-marker-class approach as climbToPanel, but for the outer
// 2-column grid wrapper — the Desktop Visual/Responsive Design pass split
// each column into several sibling panels (some wrapped in their own
// `web:desktop:mt-4` spacer, some not), so a fixed `.parent.parent` hop
// count from a given panel is no longer reliable; the two columns don't
// nest their panels to the same depth.
function climbToRow(node: any) {
  let current = node
  while (current && !((current.props?.className as string | undefined) ?? '').includes('web:desktop:flex-row')) {
    current = current.parent
  }
  return current
}

const mockRouterPush = jest.fn()
jest.mock('expo-router', () => ({
  useRouter: () => ({ push: mockRouterPush }),
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

const mockLeaveHouseholdMutate = jest.fn()
jest.mock('@/features/household/hooks/useLeaveHousehold', () => ({
  useLeaveHousehold: () => ({ mutate: mockLeaveHouseholdMutate, isPending: false, isError: false }),
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
const mockUseBiometricAvailability = jest.fn(() => ({ isAvailable: true, isLoading: false }))
jest.mock('@/features/auth/hooks/useBiometricAvailability', () => ({
  useBiometricAvailability: () => mockUseBiometricAvailability(),
}))
jest.mock('@/features/auth/hooks/useSignOut', () => ({
  useSignOut: () => ({ mutate: jest.fn() }),
}))
jest.mock('@/features/auth/hooks/useDeleteUserAccount', () => ({
  useDeleteUserAccount: () => ({ mutate: jest.fn(), isPending: false, isError: false }),
}))
const mockSetPreference = jest.fn()
jest.mock('@/features/settings/hooks/useTheme', () => ({
  useTheme: () => ({ preference: 'system', setPreference: mockSetPreference }),
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

  // UX-completeness audit P2 fix: every "הסרה" button in the household
  // list shared the exact same generic accessible name — a screen reader
  // user with more than one non-admin member couldn't tell them apart.
  it('gives the remove button a per-member accessible name, not the shared generic label', async () => {
    setHousehold('admin')
    setMembers([ADMIN_MEMBER, OTHER_MEMBER])
    mockUseProfile.mockReturnValue({ displayName: 'Dana Cohen', avatarUrl: null, isLoading: false })

    const { getByRole } = await render(<Settings />)

    expect(getByRole('button', { name: 'הסרת Yossi Cohen ממשק הבית' })).toBeTruthy()
  })

  it('never shows a remove button for a member viewer (non-admin)', async () => {
    setHousehold('member')
    setMembers([OTHER_ADMIN, SELF_AS_MEMBER])
    mockUseProfile.mockReturnValue({ displayName: 'Yossi Cohen', avatarUrl: null, isLoading: false })

    const { queryByText } = await render(<Settings />)

    expect(queryByText('הסרה')).toBeNull()
  })

  it('shows the leave-household button for a member (self), and calls the safe leave_household RPC on confirm', async () => {
    setHousehold('member')
    setMembers([OTHER_ADMIN, SELF_AS_MEMBER])
    mockUseProfile.mockReturnValue({ displayName: 'Yossi Cohen', avatarUrl: null, isLoading: false })

    const { getByText } = await render(<Settings />)

    await fireEvent.press(getByText('עזיבת משק הבית'))
    await waitFor(() => expect(getByText('לאחר העזיבה לא תראו יותר את הנתונים המשותפים של משק הבית. החשבון שלכם לא יימחק.')).toBeTruthy())
    await fireEvent.press(getByText('עזיבה'))

    await waitFor(() => expect(mockLeaveHouseholdMutate).toHaveBeenCalledWith(undefined, expect.anything()))
    // Never falls back to the old admin-unsafe raw-remove path.
    expect(mockRemoveMemberMutate).not.toHaveBeenCalled()
  })

  // Migration 005 / ADR-034: an admin can now leave a multi-member household
  // safely (the RPC promotes the longest-tenured remaining member first),
  // so the button is no longer hidden for admins the way it used to be
  // under the old, succession-unaware raw-remove path.
  it('shows the leave-household button for an admin too, and calls the same safe RPC on confirm', async () => {
    setHousehold('admin')
    setMembers([ADMIN_MEMBER, OTHER_MEMBER])
    mockUseProfile.mockReturnValue({ displayName: 'Dana Cohen', avatarUrl: null, isLoading: false })

    const { getByText } = await render(<Settings />)

    await fireEvent.press(getByText('עזיבת משק הבית'))
    await waitFor(() => expect(getByText('לאחר העזיבה לא תראו יותר את הנתונים המשותפים של משק הבית. החשבון שלכם לא יימחק.')).toBeTruthy())
    await fireEvent.press(getByText('עזיבה'))

    await waitFor(() => expect(mockLeaveHouseholdMutate).toHaveBeenCalledWith(undefined, expect.anything()))
  })

  // Migration 005's sole-member branch deletes the household itself (same
  // decision as delete_own_account()'s sole-member cascade, ADR-034) — the
  // confirm dialog must say so plainly rather than showing the "others keep
  // seeing the shared data" copy, which would be misleading with no one
  // else in the household to keep seeing anything.
  it('warns about household deletion (not just the multi-member copy) when the sole member leaves', async () => {
    setHousehold('admin')
    setMembers([ADMIN_MEMBER])
    mockUseProfile.mockReturnValue({ displayName: 'Dana Cohen', avatarUrl: null, isLoading: false })

    const { getByText, queryByText } = await render(<Settings />)

    await fireEvent.press(getByText('עזיבת משק הבית'))

    await waitFor(() =>
      expect(
        getByText('אתם החבר/ה היחיד/ה במשק הבית. עזיבה תמחק את משק הבית ואת כל הנתונים שבו. החשבון שלכם לא יימחק ותוכלו ליצור או להצטרף למשק בית חדש.')
      ).toBeTruthy()
    )
    expect(queryByText('לאחר העזיבה לא תראו יותר את הנתונים המשותפים של משק הבית. החשבון שלכם לא יימחק.')).toBeNull()
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

  // Design Phase 3: Appearance moved from three separate Buttons to a
  // SegmentedControl. useTheme is mocked at 'system'; pressing the "light"
  // segment must call setPreference with the new value, not toggle some
  // local-only state — the segmented control is a controlled display of
  // whatever useTheme reports, exactly like the three-Button row it
  // replaced.
  it('calls setPreference when a different appearance option is selected', async () => {
    setHousehold('admin')
    setMembers([ADMIN_MEMBER])
    mockUseProfile.mockReturnValue({ displayName: 'Dana Cohen', avatarUrl: null, isLoading: false })

    const { getByText } = await render(<Settings />)

    await fireEvent.press(getByText('מצב בהיר'))

    expect(mockSetPreference).toHaveBeenCalledWith('light')
  })

  // Design Phase 3: the "Money management" section replaced four
  // full-width secondary Buttons with SettingsRow navigation rows — the
  // destination routes must still be wired identically.
  it('still navigates to Accounts and Categories from the Money management section', async () => {
    setHousehold('admin')
    setMembers([ADMIN_MEMBER])
    mockUseProfile.mockReturnValue({ displayName: 'Dana Cohen', avatarUrl: null, isLoading: false })

    const { getByText } = await render(<Settings />)

    await fireEvent.press(getByText('חשבונות'))
    expect(mockRouterPush).toHaveBeenCalledWith('/accounts')

    await fireEvent.press(getByText('קטגוריות וכללי סיווג'))
    expect(mockRouterPush).toHaveBeenCalledWith('/settings/categories')
  })

  // Responsive/desktop pass: profile+household form one column, money
  // management/appearance/security/account form a second — desktop only
  // (see index.tsx's own comment). RNTL can't evaluate real CSS media
  // queries, so this asserts the structural thing that matters — both
  // columns are direct children of the same `web:desktop:flex-row`
  // grid wrapper, not a fake pixel/viewport assertion.
  it('groups profile/household and money-management/appearance/security/account into the same desktop grid container', async () => {
    setHousehold('admin')
    setMembers([ADMIN_MEMBER])
    mockUseProfile.mockReturnValue({ displayName: 'Dana Cohen', avatarUrl: null, isLoading: false })

    const { getByText } = await render(<Settings />)

    // Climbs to the shared bounded-panel wrapper (DESKTOP_PANEL_CLASS, the
    // same token Dashboard/Budgets' panels use) each column now has, rather
    // than a fixed number of `.parent` hops — resilient to exactly how many
    // wrapper Views (SettingsSection's own `mb-6`, this panel) sit between
    // the queried title and the grid.
    const primaryPanel = climbToPanel(getByText('משק הבית'))
    const gridWrapper = climbToRow(primaryPanel)
    expect(gridWrapper?.props.className as string).toContain('web:desktop:flex-row')

    const secondaryPanel = climbToPanel(getByText('ניהול כספים'))
    expect(climbToRow(secondaryPanel)).toBe(gridWrapper)
  })

  // Desktop polish pass regression: a real-browser visual check found the
  // desktop nav rail rendering on the wrong side for this RTL app, caused
  // by plain `flex-row` not auto-mirroring on web — the same fix
  // (`flex-row-reverse`) was applied to every desktop 2-column grid,
  // including this one, so profile+household (source-order-first, the
  // primary column) reads on the right and money-management/etc. on the
  // left, per RTL reading order.
  // Visual QA + Desktop Polish pass: this previously matched via
  // `.toContain('web:desktop:flex-row')`, a substring satisfied by BOTH the
  // reversed and unreversed forms — so it silently kept passing through a
  // real regression where the split reverted to plain `flex-row`. Rewritten
  // to exact whitespace-token membership.
  it('uses flex-row-reverse (not plain flex-row) so profile/household reads on the right in RTL', async () => {
    setHousehold('admin')
    setMembers([ADMIN_MEMBER])
    mockUseProfile.mockReturnValue({ displayName: 'Dana Cohen', avatarUrl: null, isLoading: false })

    const { getByText } = await render(<Settings />)

    const panel = climbToPanel(getByText('משק הבית'))
    const gridWrapper = climbToRow(panel)
    const tokens = ((gridWrapper?.props.className as string | undefined) ?? '').split(/\s+/)
    expect(tokens).toContain('web:desktop:flex-row-reverse')
    expect(tokens).not.toContain('web:desktop:flex-row')
  })

  // Desktop polish pass (round 2): each column previously reflowed the same
  // unbounded mobile sections side by side with no shared boundary — a
  // real-browser visual review found this read as two independent mobile
  // columns rather than one desktop settings page. Each column now shares
  // one bounded panel treatment (the same token Dashboard/Budgets' panels
  // use), rather than each sub-section floating loose in the grid.
  it('wraps each column in a shared bounded desktop panel, not loose floating sections', async () => {
    setHousehold('admin')
    setMembers([ADMIN_MEMBER])
    mockUseProfile.mockReturnValue({ displayName: 'Dana Cohen', avatarUrl: null, isLoading: false })

    const { getByText } = await render(<Settings />)

    expect(climbToPanel(getByText('משק הבית'))?.props.className as string).toContain('web:desktop:border')
    expect(climbToPanel(getByText('ניהול כספים'))?.props.className as string).toContain('web:desktop:border')
  })

  // Desktop Visual/Responsive Design pass: splitting the two-column layout's
  // single monolithic panel per column into several smaller, independently-
  // sized panels is what distributes the natural-height mismatch between
  // columns instead of concentrating it as one large gap under the shorter
  // column. This asserts the split actually happened — each named section
  // lands in its OWN panel instance, not sharing one big box per column.
  it('splits each column into multiple distinct panels rather than one monolithic box', async () => {
    setHousehold('admin')
    setMembers([ADMIN_MEMBER])
    mockUseProfile.mockReturnValue({ displayName: 'Dana Cohen', avatarUrl: null, isLoading: false })

    const { getByText, getAllByText } = await render(<Settings />)

    // Right column: the profile panel (found via the displayed name, since
    // the Profile card has no heading of its own) must be a different panel
    // instance from the household panel. Dana Cohen is both the profile
    // owner and the sole household member here, so it appears twice — the
    // profile card renders first in source order.
    const profilePanel = climbToPanel(getAllByText('Dana Cohen')[0])
    const householdPanel = climbToPanel(getByText('משק הבית'))
    const gridRow = climbToRow(householdPanel)
    expect(profilePanel).not.toBe(householdPanel)

    // Left column: three named sections must each resolve to a distinct
    // panel instance.
    const financialPanel = climbToPanel(getByText('ניהול כספים'))
    const appearancePanel = climbToPanel(getByText('מראה'))
    const securityPanel = climbToPanel(getByText('אבטחה'))
    expect(financialPanel).not.toBe(appearancePanel)
    expect(appearancePanel).not.toBe(securityPanel)
    expect(financialPanel).not.toBe(securityPanel)

    // Security and Account share one panel by design (both short sections)
    // — confirms that grouping, rather than assuming every section got its
    // own box.
    const accountPanel = climbToPanel(getByText('חשבון'))
    expect(accountPanel).toBe(securityPanel)

    // All panels still belong to the same desktop grid row.
    expect(climbToRow(financialPanel)).toBe(gridRow)
    expect(climbToRow(appearancePanel)).toBe(gridRow)
    expect(climbToRow(securityPanel)).toBe(gridRow)
  })

  // UX-completeness audit P2 fix: the biometric Switch could be flipped on
  // even on a device with no enrolled biometric hardware — expo-local-
  // authentication would then fail at the next lock/unlock with no warning
  // ever shown at the point of turning it on.
  it('enables the biometric switch when the device has biometrics available', async () => {
    mockUseBiometricAvailability.mockReturnValue({ isAvailable: true, isLoading: false })
    setHousehold('admin')
    setMembers([ADMIN_MEMBER])
    mockUseProfile.mockReturnValue({ displayName: 'Dana Cohen', avatarUrl: null, isLoading: false })

    const { getByLabelText, queryByText } = await render(<Settings />)

    expect(getByLabelText('נעילה ביומטרית').props.disabled).toBeFalsy()
    expect(queryByText('לא זמינה במכשיר זה')).toBeNull()
  })

  it('disables the biometric switch and shows a caption when the device has no biometrics enrolled', async () => {
    mockUseBiometricAvailability.mockReturnValue({ isAvailable: false, isLoading: false })
    setHousehold('admin')
    setMembers([ADMIN_MEMBER])
    mockUseProfile.mockReturnValue({ displayName: 'Dana Cohen', avatarUrl: null, isLoading: false })

    const { getByLabelText, getByText } = await render(<Settings />)

    expect(getByLabelText('נעילה ביומטרית').props.disabled).toBe(true)
    expect(getByText('לא זמינה במכשיר זה')).toBeTruthy()
  })

  it('disables the biometric switch while availability is still resolving, without showing the unavailable caption', async () => {
    mockUseBiometricAvailability.mockReturnValue({ isAvailable: false, isLoading: true })
    setHousehold('admin')
    setMembers([ADMIN_MEMBER])
    mockUseProfile.mockReturnValue({ displayName: 'Dana Cohen', avatarUrl: null, isLoading: false })

    const { getByLabelText, queryByText } = await render(<Settings />)

    expect(getByLabelText('נעילה ביומטרית').props.disabled).toBe(true)
    expect(queryByText('לא זמינה במכשיר זה')).toBeNull()
  })
})
