// RRR §16 P1-8 regression coverage: when Share.share() fails — routine on
// desktop web, where the Web Share API is frequently unavailable — the
// screen previously showed only a generic error with no way to actually
// get the already-created invitation to a second person. These tests
// reproduce that failure directly (Share.share rejecting) and prove a real
// recovery path now renders and works.
import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals'
import { fireEvent, render, waitFor } from '@testing-library/react-native'
import { Share } from 'react-native'
import * as Linking from 'expo-linking'
import '@/i18n'
import InvitePartner from './invite-partner'
import { useHouseholdStore } from '@/store/householdStore'

const mockPush = jest.fn()
const mockReplace = jest.fn()
jest.mock('expo-router', () => ({
  useRouter: () => ({ push: mockPush, replace: mockReplace }),
}))

// expo-linking's real createURL needs the expo-constants manifest (app.json)
// to resolve a scheme, unavailable under jest — same reason
// useRecoverySession.test.tsx already auto-mocks this module. The fallback
// link only needs to actually contain the token for these tests to prove
// what they're testing (a real, non-empty recovery link renders and is
// copyable) — the exact URL shape is Linking.createURL's own concern, not
// this screen's.
jest.mock('expo-linking')
// The clipboard fallback is explicitly web-only (copyToClipboard's own
// Platform.OS guard) — this suite's whole subject is the desktop-web
// failure path, so Platform.OS is fixed to 'web' for every test here, same
// technique Select.test.tsx already uses to exercise its own web-only
// branch under jest's RN preset (which otherwise resolves to 'ios').
jest.mock('react-native/Libraries/Utilities/Platform', () => ({
  __esModule: true,
  default: { OS: 'web', select: (obj: Record<string, unknown>) => obj.web ?? obj.default },
}))

let mockMutateResult: 'success' | 'error' = 'success'
const mockToken = 'tok-abc123'
const mockCreateInvitationMutate = jest.fn(
  (_variables: unknown, callbacks?: { onSuccess?: (token: string) => void; onError?: (error: unknown) => void }) => {
    if (mockMutateResult === 'success') callbacks?.onSuccess?.(mockToken)
    else callbacks?.onError?.(new Error('insert failed'))
  }
)
jest.mock('@/features/household/hooks/useCreateInvitation', () => ({
  useCreateInvitation: () => ({ mutate: mockCreateInvitationMutate, isPending: false, isError: mockMutateResult === 'error' }),
}))

describe('InvitePartner — share failure recovery (P1-8)', () => {
  beforeEach(() => {
    mockPush.mockClear()
    mockReplace.mockClear()
    mockCreateInvitationMutate.mockClear()
    mockMutateResult = 'success'
    useHouseholdStore.getState().setHouseholdId('household-1')
    jest.mocked(Linking.createURL).mockImplementation((path: string) => `ourmoney://${path.replace(/^\//, '')}`)
  })

  afterEach(() => {
    jest.restoreAllMocks()
  })

  it('shows only the generic error, no recovery link, when share succeeds', async () => {
    jest.spyOn(Share, 'share').mockResolvedValue({ action: 'sharedAction' } as never)
    const { getByText, queryByText } = await render(<InvitePartner />)

    await fireEvent.press(getByText('שליחת הזמנה'))
    await waitFor(() => expect(Share.share).toHaveBeenCalled())

    expect(queryByText('שיתוף ההזמנה נכשל. אפשר לנסות שוב, או להעתיק את הקישור ולשלוח אותו בעצמכם:')).toBeNull()
    expect(queryByText('העתקת קישור ההזמנה')).toBeNull()
  })

  it('surfaces a real, copyable invite link and a working copy button when Share.share fails', async () => {
    jest.spyOn(Share, 'share').mockRejectedValue(new Error('no share target'))
    const { getByText } = await render(<InvitePartner />)

    await fireEvent.press(getByText('שליחת הזמנה'))
    await waitFor(() => expect(Share.share).toHaveBeenCalled())

    // The already-created invitation's token must actually appear in the
    // fallback link — not just a generic error with nothing actionable.
    await waitFor(() => expect(getByText(new RegExp(mockToken))).toBeTruthy())
    expect(getByText('העתקת קישור ההזמנה')).toBeTruthy()
  })

  it('copying the fallback link on web calls the clipboard and confirms success', async () => {
    jest.spyOn(Share, 'share').mockRejectedValue(new Error('no share target'))
    const writeText = jest.fn<(text: string) => Promise<void>>().mockResolvedValue(undefined)
    Object.defineProperty(global, 'navigator', {
      value: { clipboard: { writeText } },
      configurable: true,
    })

    const { getByText } = await render(<InvitePartner />)
    await fireEvent.press(getByText('שליחת הזמנה'))
    await waitFor(() => expect(Share.share).toHaveBeenCalled())

    await fireEvent.press(getByText('העתקת קישור ההזמנה'))

    expect(writeText).toHaveBeenCalledTimes(1)
    expect(writeText.mock.calls[0]?.[0]).toEqual(expect.stringContaining(mockToken))
    await waitFor(() => expect(getByText('הקישור הועתק')).toBeTruthy())
  })

  // Hostile re-review finding (P1-8 correction): navigator.clipboard.writeText
  // can reject — e.g. the clipboard permission is denied, or the page lost
  // focus — not just resolve. The original fix fired the write with `void`
  // and reported success synchronously regardless of the outcome, so a
  // household could tap "copy," be told "הקישור הועתק" (copied!), and have
  // nothing on their clipboard at all — the exact class of false-success
  // claim this whole remediation pass exists to eliminate (see finding #2's
  // and #4's identical truthfulness discipline).
  it('never claims "copied" when the clipboard write actually fails', async () => {
    jest.spyOn(Share, 'share').mockRejectedValue(new Error('no share target'))
    const writeText = jest.fn<(text: string) => Promise<void>>().mockRejectedValue(new Error('clipboard permission denied'))
    Object.defineProperty(global, 'navigator', {
      value: { clipboard: { writeText } },
      configurable: true,
    })

    const { getByText, queryByText } = await render(<InvitePartner />)
    await fireEvent.press(getByText('שליחת הזמנה'))
    await waitFor(() => expect(Share.share).toHaveBeenCalled())

    await fireEvent.press(getByText('העתקת קישור ההזמנה'))
    await waitFor(() => expect(writeText).toHaveBeenCalledTimes(1))

    expect(queryByText('הקישור הועתק')).toBeNull()
    expect(getByText('העתקת קישור ההזמנה')).toBeTruthy()
  })
})
