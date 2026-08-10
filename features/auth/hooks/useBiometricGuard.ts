// AppState background→active biometric re-lock, per docs/PHASE_1_PLAN.md
// §3.7. This gates re-entry to an already-authenticated app; it is not
// Supabase authentication and never touches session state directly — a
// failed/cancelled biometric check signs the user out via useSignOut, which
// then lets the normal auth guard (useAuthGuard.ts) route them to sign-in.
//
// Safe fallback: never locks (and never calls any expo-local-authentication
// API) on web, since the module has no web implementation, or when the
// device has no biometric hardware/enrollment — a user without biometrics
// configured must never be locked out of their own app.
//
// isBiometricLocked is reset to false on every mount. Without this, a user
// who fails/cancels a biometric check gets signed out (correct), then signs
// back in — remounting this hook via app/(app)/_layout.tsx — and would
// otherwise inherit the stale `true` left in the Zustand store from before,
// showing the lock overlay with no real background/foreground cycle having
// happened and no way to clear it (adversarial review finding).
//
// checkInProgressRef prevents two overlapping lock flows: if the 30s
// threshold is crossed a second time while a prior authenticateAsync() call
// is still pending, the second crossing is ignored rather than starting a
// concurrent biometric check (adversarial review finding — concurrent
// hardware evaluations are not something callers can assume is safe, and a
// spurious failure on one call must not sign out a user mid-success on the
// other).
//
// Fail closed on any non-success outcome (a failed/cancelled check, or a
// thrown error from the native calls): the lock is deliberately NOT cleared
// here. It is cleared only by the success branch, or implicitly by
// app/(app)/_layout.tsx unmounting once sign-out actually clears the session
// and useAuthGuard routes the user to sign-in. Clearing it optimistically
// (before sign-out is confirmed) would expose the protected screens
// underneath during the sign-out network round-trip — a real, previously
// shipped regression caught in mobile/Expo review. `signOut.mutateAsync()`
// is awaited (with a local, silent catch — a failed sign-out attempt must
// not throw into this handler) so a slow/failed sign-out keeps the overlay
// up rather than exposing data behind an unconfirmed logout.
import { useEffect, useRef } from 'react'
import { AppState, Platform } from 'react-native'
import * as LocalAuthentication from 'expo-local-authentication'
import { useTranslation } from 'react-i18next'
import { useAuthStore } from '@/store/authStore'
import { useSignOut } from './useSignOut'

const BACKGROUND_THRESHOLD_MS = 30_000

export function useBiometricGuard() {
  const isLocked = useAuthStore((state) => state.isBiometricLocked)
  const setBiometricLocked = useAuthStore((state) => state.setBiometricLocked)
  const signOut = useSignOut()
  const backgroundedAtRef = useRef<number | null>(null)
  const checkInProgressRef = useRef(false)
  const { t } = useTranslation()

  useEffect(() => {
    setBiometricLocked(false)
  }, [setBiometricLocked])

  useEffect(() => {
    if (Platform.OS === 'web') return

    const subscription = AppState.addEventListener('change', (nextState) => {
      if (nextState === 'background') {
        backgroundedAtRef.current = Date.now()
        return
      }
      if (nextState !== 'active' || backgroundedAtRef.current == null) return

      const elapsedMs = Date.now() - backgroundedAtRef.current
      backgroundedAtRef.current = null
      if (elapsedMs < BACKGROUND_THRESHOLD_MS) return
      if (checkInProgressRef.current) return

      checkInProgressRef.current = true

      void (async () => {
        try {
          const [hasHardware, isEnrolled] = await Promise.all([
            LocalAuthentication.hasHardwareAsync(),
            LocalAuthentication.isEnrolledAsync(),
          ])
          if (!hasHardware || !isEnrolled) return

          setBiometricLocked(true)
          const result = await LocalAuthentication.authenticateAsync({
            promptMessage: t('auth.biometric.promptMessage'),
          })

          if (result.success) {
            setBiometricLocked(false)
            return
          }

          await signOut.mutateAsync().catch(() => {})
        } catch {
          await signOut.mutateAsync().catch(() => {})
        } finally {
          checkInProgressRef.current = false
        }
      })()
    })

    return () => subscription.remove()
  }, [setBiometricLocked, signOut, t])

  return { isLocked }
}
