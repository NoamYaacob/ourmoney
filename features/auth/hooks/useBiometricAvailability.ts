// Device-capability check for the Settings biometric toggle — not server
// state (CLAUDE.md's TanStack-Query rule targets Supabase data, not a local
// hardware query), so a plain effect matches the identical check
// useBiometricGuard.ts already performs at lock time, not a query hook.
// Deliberately false (not merely unresolved) on web and while resolving,
// since expo-local-authentication has no web implementation
// (useBiometricGuard.ts's own header comment) and a not-yet-resolved
// availability must not read as "available."

import { useEffect, useState } from 'react'
import { Platform } from 'react-native'
import * as LocalAuthentication from 'expo-local-authentication'

export function useBiometricAvailability(): { isAvailable: boolean; isLoading: boolean } {
  const [isAvailable, setIsAvailable] = useState(false)
  const [isLoading, setIsLoading] = useState(Platform.OS !== 'web')

  useEffect(() => {
    if (Platform.OS === 'web') return

    let cancelled = false
    void (async () => {
      try {
        const [hasHardware, isEnrolled] = await Promise.all([
          LocalAuthentication.hasHardwareAsync(),
          LocalAuthentication.isEnrolledAsync(),
        ])
        if (!cancelled) setIsAvailable(hasHardware && isEnrolled)
      } catch {
        if (!cancelled) setIsAvailable(false)
      } finally {
        if (!cancelled) setIsLoading(false)
      }
    })()

    return () => {
      cancelled = true
    }
  }, [])

  return { isAvailable, isLoading }
}
