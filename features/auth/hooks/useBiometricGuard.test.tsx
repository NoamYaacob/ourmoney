import { beforeEach, describe, expect, it, jest } from '@jest/globals'
import { renderHook, waitFor } from '@testing-library/react-native'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { AppState, Platform } from 'react-native'
import * as LocalAuthentication from 'expo-local-authentication'
import * as SecureStore from 'expo-secure-store'
import type { ReactNode } from 'react'
import { supabase } from '@/lib/supabase/client'
import { useBiometricGuard } from './useBiometricGuard'
import { useAuthStore } from '@/store/authStore'

jest.mock('@/lib/supabase/client')
jest.mock('expo-local-authentication')
jest.mock('expo-secure-store')
// A STABLE reference for `t`, not a fresh arrow function per call — the
// mid-session preference-toggle test below specifically proves
// isBiometricEnabled is in the AppState effect's dependency array (an
// architecture-review requirement). If `t` gets a new identity on every
// render (as it would from an inline factory), it stays in that same
// dependency array and re-subscribes the listener on every render
// regardless of isBiometricEnabled, which would let that test pass even if
// isBiometricEnabled were silently dropped from the array (adversarial
// review finding — confirmed by reverting the dependency-array entry alone
// and observing the test still passed).
function mockT(key: string): string {
  return key
}
jest.mock('react-i18next', () => ({
  useTranslation: () => ({ t: mockT }),
}))

function wrapper({ children }: { children: ReactNode }) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
}

function fireAppState(nextState: 'background' | 'active') {
  const mockCalls = jest.mocked(AppState.addEventListener).mock.calls
  const listener = mockCalls[mockCalls.length - 1]?.[1]
  listener?.(nextState)
}

describe('useBiometricGuard', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    jest.spyOn(AppState, 'addEventListener').mockReturnValue({ remove: jest.fn() })
    jest.mocked(supabase.auth.signOut).mockResolvedValue({
      error: null,
    } as Awaited<ReturnType<typeof supabase.auth.signOut>>)
    jest.mocked(SecureStore.getItemAsync).mockResolvedValue(null)
    jest.mocked(SecureStore.setItemAsync).mockResolvedValue(undefined)
    Object.defineProperty(Platform, 'OS', { value: 'ios', configurable: true })
    useAuthStore.setState({ isBiometricLocked: false })
  })

  it('does not prompt when backgrounded for less than 30 seconds', async () => {
    const now = jest.spyOn(Date, 'now')
    now.mockReturnValue(1_000)

    const { result } = await renderHook(() => useBiometricGuard(), { wrapper })
    fireAppState('background')
    now.mockReturnValue(1_000 + 29_000)
    fireAppState('active')

    await Promise.resolve()
    expect(LocalAuthentication.hasHardwareAsync).not.toHaveBeenCalled()
    expect(result.current.isLocked).toBe(false)
  })

  it('locks and prompts after 30+ seconds backgrounded, unlocks on success', async () => {
    const now = jest.spyOn(Date, 'now')
    now.mockReturnValue(1_000)
    jest.mocked(LocalAuthentication.hasHardwareAsync).mockResolvedValue(true)
    jest.mocked(LocalAuthentication.isEnrolledAsync).mockResolvedValue(true)
    jest
      .mocked(LocalAuthentication.authenticateAsync)
      .mockResolvedValue({ success: true } as Awaited<ReturnType<typeof LocalAuthentication.authenticateAsync>>)

    const { result } = await renderHook(() => useBiometricGuard(), { wrapper })
    fireAppState('background')
    now.mockReturnValue(1_000 + 31_000)
    fireAppState('active')

    await waitFor(() => expect(result.current.isLocked).toBe(false))
    expect(LocalAuthentication.authenticateAsync).toHaveBeenCalled()
    expect(supabase.auth.signOut).not.toHaveBeenCalled()
  })

  it('signs out when the biometric check fails (including a cancel), and stays locked (fail closed) while sign-out is in flight', async () => {
    const now = jest.spyOn(Date, 'now')
    now.mockReturnValue(1_000)
    jest.mocked(LocalAuthentication.hasHardwareAsync).mockResolvedValue(true)
    jest.mocked(LocalAuthentication.isEnrolledAsync).mockResolvedValue(true)
    jest.mocked(LocalAuthentication.authenticateAsync).mockResolvedValue({
      success: false,
    } as Awaited<ReturnType<typeof LocalAuthentication.authenticateAsync>>)

    const { result } = await renderHook(() => useBiometricGuard(), { wrapper })
    fireAppState('background')
    now.mockReturnValue(1_000 + 31_000)
    fireAppState('active')

    await waitFor(() => expect(supabase.auth.signOut).toHaveBeenCalled())
    // The overlay must not be cleared just because signOut was called — only
    // once the session is actually gone (which app/(app)/_layout.tsx unmounting
    // handles, not this hook clearing its own flag).
    expect(result.current.isLocked).toBe(true)
  })

  it('never locks when there is no biometric hardware or nothing enrolled (safe fallback)', async () => {
    const now = jest.spyOn(Date, 'now')
    now.mockReturnValue(1_000)
    jest.mocked(LocalAuthentication.hasHardwareAsync).mockResolvedValue(false)
    jest.mocked(LocalAuthentication.isEnrolledAsync).mockResolvedValue(false)

    const { result } = await renderHook(() => useBiometricGuard(), { wrapper })
    fireAppState('background')
    now.mockReturnValue(1_000 + 31_000)
    fireAppState('active')

    await Promise.resolve()
    expect(LocalAuthentication.authenticateAsync).not.toHaveBeenCalled()
    expect(result.current.isLocked).toBe(false)
  })

  it('never touches the biometric APIs on web', async () => {
    Object.defineProperty(Platform, 'OS', { value: 'web', configurable: true })

    await renderHook(() => useBiometricGuard(), { wrapper })
    expect(AppState.addEventListener).not.toHaveBeenCalled()
    expect(LocalAuthentication.hasHardwareAsync).not.toHaveBeenCalled()
  })

  // Regression: adversarial review found isBiometricLocked never got reset
  // after a failed check signed the user out, so a fresh sign-in inherited
  // the stale `true` and showed a permanent, undismissable lock overlay.
  it('does not remain locked on a fresh mount after a failed check signed the user out', async () => {
    const now = jest.spyOn(Date, 'now')
    now.mockReturnValue(1_000)
    jest.mocked(LocalAuthentication.hasHardwareAsync).mockResolvedValue(true)
    jest.mocked(LocalAuthentication.isEnrolledAsync).mockResolvedValue(true)
    jest.mocked(LocalAuthentication.authenticateAsync).mockResolvedValue({
      success: false,
    } as Awaited<ReturnType<typeof LocalAuthentication.authenticateAsync>>)

    // First mount: app backgrounded 31s, biometric check fails -> signs out.
    const first = await renderHook(() => useBiometricGuard(), { wrapper })
    fireAppState('background')
    now.mockReturnValue(1_000 + 31_000)
    fireAppState('active')
    await waitFor(() => expect(supabase.auth.signOut).toHaveBeenCalled())
    await first.unmount()

    // User signs back in — app/(app)/_layout.tsx (and useBiometricGuard)
    // mount fresh, as they would after the auth guard routes them into (app).
    const second = await renderHook(() => useBiometricGuard(), { wrapper })
    expect(second.result.current.isLocked).toBe(false)
  })

  // Regression: adversarial review found no re-entrancy guard — crossing the
  // 30s threshold a second time while the first authenticateAsync() call was
  // still pending started a second, concurrent biometric check.
  it('does not start a second authenticateAsync call while the first is still pending', async () => {
    const now = jest.spyOn(Date, 'now')
    jest.mocked(LocalAuthentication.hasHardwareAsync).mockResolvedValue(true)
    jest.mocked(LocalAuthentication.isEnrolledAsync).mockResolvedValue(true)
    // Never resolves during this test — models the prompt still being shown.
    jest.mocked(LocalAuthentication.authenticateAsync).mockImplementation(() => new Promise(() => {}))

    await renderHook(() => useBiometricGuard(), { wrapper })

    now.mockReturnValue(1_000)
    fireAppState('background')
    now.mockReturnValue(1_000 + 31_000)
    fireAppState('active')
    await Promise.resolve()
    await Promise.resolve()
    expect(LocalAuthentication.authenticateAsync).toHaveBeenCalledTimes(1)

    now.mockReturnValue(1_000 + 31_000 + 1_000)
    fireAppState('background')
    now.mockReturnValue(1_000 + 31_000 + 1_000 + 31_000)
    fireAppState('active')
    await Promise.resolve()
    await Promise.resolve()
    expect(LocalAuthentication.authenticateAsync).toHaveBeenCalledTimes(1)
  })

  // Regression: adversarial review found no try/catch — a rejection from any
  // of the native calls (e.g. a native-module error) left isLocked stuck
  // `true` forever with no sign-out and no recovery path. Fixed by treating
  // a thrown error the same as a failed check: attempt sign-out, but (per
  // the fail-closed regression below) do not clear the lock ourselves.
  it('treats a thrown error the same as a failed check: attempts sign-out, does not self-clear the lock', async () => {
    const now = jest.spyOn(Date, 'now')
    now.mockReturnValue(1_000)
    jest.mocked(LocalAuthentication.hasHardwareAsync).mockResolvedValue(true)
    jest.mocked(LocalAuthentication.isEnrolledAsync).mockResolvedValue(true)
    jest.mocked(LocalAuthentication.authenticateAsync).mockRejectedValue(new Error('native module error'))

    const { result } = await renderHook(() => useBiometricGuard(), { wrapper })
    fireAppState('background')
    now.mockReturnValue(1_000 + 31_000)
    fireAppState('active')

    await waitFor(() => expect(supabase.auth.signOut).toHaveBeenCalled())
    expect(result.current.isLocked).toBe(true)
  })

  // Regression (mobile/Expo re-review): an earlier fix cleared isBiometricLocked
  // unconditionally in a `finally` block regardless of whether sign-out had
  // actually completed. Because supabase.auth.signOut() is a real network
  // call with no built-in timeout, a slow or hung connection — plausible
  // right after a background/foreground transition — left the app briefly
  // "unlocked" and showing protected screens with a session the UI still
  // treated as valid, before the sign-out had actually cleared anything.
  // The fix must never clear the lock on a failed check; only the success
  // path (or the screen being unmounted once sign-out truly completes) may.
  it('does not become visible/unlocked while a failed check\'s sign-out is still pending', async () => {
    const now = jest.spyOn(Date, 'now')
    now.mockReturnValue(1_000)
    jest.mocked(LocalAuthentication.hasHardwareAsync).mockResolvedValue(true)
    jest.mocked(LocalAuthentication.isEnrolledAsync).mockResolvedValue(true)
    jest.mocked(LocalAuthentication.authenticateAsync).mockResolvedValue({
      success: false,
    } as Awaited<ReturnType<typeof LocalAuthentication.authenticateAsync>>)
    // Models a hung/slow network call — signOut never resolves during this test.
    jest.mocked(supabase.auth.signOut).mockImplementation(() => new Promise(() => {}))

    const { result } = await renderHook(() => useBiometricGuard(), { wrapper })
    fireAppState('background')
    now.mockReturnValue(1_000 + 31_000)
    fireAppState('active')

    await waitFor(() => expect(supabase.auth.signOut).toHaveBeenCalled())
    // Give any (incorrect) optimistic-clear microtask a chance to run.
    await Promise.resolve()
    await Promise.resolve()
    expect(result.current.isLocked).toBe(true)
  })

  // Milestone 5: the Settings biometric toggle. Fail-closed by construction
  // (useBiometricPreference defaults to enabled=true until the stored value
  // resolves), so this test explicitly waits for the disabled preference to
  // actually take effect (a second AppState re-subscription, since
  // isBiometricEnabled is in the effect's dependency array) before firing
  // the background/foreground cycle.
  it('does not lock when the biometric preference is disabled', async () => {
    jest.mocked(SecureStore.getItemAsync).mockResolvedValue('false')
    const now = jest.spyOn(Date, 'now')
    now.mockReturnValue(1_000)

    await renderHook(() => useBiometricGuard(), { wrapper })
    await waitFor(() => expect(jest.mocked(AppState.addEventListener).mock.calls.length).toBeGreaterThan(1))

    fireAppState('background')
    now.mockReturnValue(1_000 + 31_000)
    fireAppState('active')

    await Promise.resolve()
    expect(LocalAuthentication.hasHardwareAsync).not.toHaveBeenCalled()
  })

  // Architecture-review requirement: a preference change mid-session (no
  // remount) must govern the very next background/foreground cycle, not
  // only cycles after a fresh mount. This is a behavioral/end-to-end
  // regression test, not an isolated proof of the dependency-array entry
  // specifically — a second adversarial-review pass found that useSignOut()'s
  // useMutation() result has NO stable object identity across renders (real
  // TanStack Query behavior, confirmed independently, not a mock artifact),
  // so this effect already re-subscribes on every render of this hook for a
  // reason unrelated to isBiometricEnabled — which means the literal
  // stale-closure failure mode cannot currently be isolated by reverting
  // only the isBiometricEnabled dependency-array entry (verified: doing so
  // does not fail this test). Listing isBiometricEnabled explicitly remains
  // correct, defensive practice — the effect should not rely on an
  // unrelated hook's referential instability to stay correct — and this
  // test still proves the actually-required end-to-end behavior: a toggle
  // takes effect on the very next cycle without a remount.
  it('honors a preference toggled mid-session, without a remount, on the next background/foreground cycle', async () => {
    jest.mocked(LocalAuthentication.hasHardwareAsync).mockResolvedValue(true)
    jest.mocked(LocalAuthentication.isEnrolledAsync).mockResolvedValue(true)
    jest.mocked(LocalAuthentication.authenticateAsync).mockResolvedValue({
      success: true,
    } as Awaited<ReturnType<typeof LocalAuthentication.authenticateAsync>>)

    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    function sharedWrapper({ children }: { children: ReactNode }) {
      return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    }

    const now = jest.spyOn(Date, 'now')
    now.mockReturnValue(1_000)

    const { result } = await renderHook(() => useBiometricGuard(), { wrapper: sharedWrapper })
    // Let the preference query resolve to its default (enabled) first.
    await waitFor(() => expect(SecureStore.getItemAsync).toHaveBeenCalled())

    // First cycle: still enabled -> locks and prompts as usual.
    fireAppState('background')
    now.mockReturnValue(1_000 + 31_000)
    fireAppState('active')
    await waitFor(() => expect(LocalAuthentication.authenticateAsync).toHaveBeenCalledTimes(1))
    await waitFor(() => expect(result.current.isLocked).toBe(false))

    // Toggle the preference in the SAME query cache this still-mounted hook
    // reads from — simulates Settings' toggle elsewhere in the app without
    // this hook ever remounting.
    queryClient.setQueryData(['settings', 'biometric-preference'], false)
    await waitFor(() => expect(jest.mocked(AppState.addEventListener).mock.calls.length).toBeGreaterThan(1))

    // Second cycle: now disabled -> must NOT prompt again.
    now.mockReturnValue(1_000 + 31_000 + 1_000)
    fireAppState('background')
    now.mockReturnValue(1_000 + 31_000 + 1_000 + 31_000)
    fireAppState('active')
    await Promise.resolve()
    expect(LocalAuthentication.authenticateAsync).toHaveBeenCalledTimes(1)
  })
})
