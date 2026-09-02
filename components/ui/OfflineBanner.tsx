// A thin, dismissable-by-reconnecting strip at the top of every screen
// (mounted once, in Screen.tsx) when the device has no network connection.
//
// Deliberately reads only `navigator.onLine` + the browser's own
// online/offline events — no NetInfo dependency, no new package. That is a
// real, documented limitation, not an oversight: `navigator.onLine` is
// reliable on web (react-native-web) but React Native's own `navigator`
// polyfill on iOS/Android does not track real connectivity, so this banner
// never appears on native. It still degrades safely there — `isOffline`
// simply never becomes true, so the component renders nothing, exactly as
// it did before this existed. Adding true native connectivity detection
// means adding @react-native-community/netinfo, which is an infrastructure
// decision (a new native dependency) left for that to be asked for
// explicitly, not assumed here.
//
// This is a read-only status strip, not a write-blocking guard: no mutation
// anywhere in this app is disabled while offline (CLAUDE.md has no offline
// queue/sync concept, and inventing one here would be exactly the kind of
// scope this redesign pass is not supposed to add) — a household still sees
// why a save that then fails failed.
//
// The design's own offline frame draws this as a danger-tinted bordered card
// rather than a warning strip, which is the treatment here now. Two lines of
// that frame are deliberately not reproduced. "מוצג המצב מ־09:12" needs a
// cache timestamp this app does not keep. "אפשר להוסיף תנועות. הן יסתנכרנו
// כשהחיבור יחזור" would be false: there is no write queue, so a save
// attempted now fails rather than syncing later, and telling a household
// otherwise is worse than saying less.

import { useEffect, useState } from 'react'
import { Text, View } from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { useTranslation } from 'react-i18next'
import { useColorScheme } from 'nativewind'
import { colors } from '@/constants/colors'
import { ICON } from '@/constants/icons'

function readOnlineState(): boolean {
  try {
    return typeof navigator === 'undefined' || typeof navigator.onLine !== 'boolean' ? true : navigator.onLine
  } catch {
    return true
  }
}

export function OfflineBanner() {
  const { t } = useTranslation()
  const { colorScheme: scheme } = useColorScheme()
  const iconColor = scheme === 'dark' ? colors.dangerStrong.dark : colors.dangerStrong.light
  const [isOnline, setIsOnline] = useState(readOnlineState)

  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.addEventListener !== 'function') return
    const goOnline = () => setIsOnline(true)
    const goOffline = () => setIsOnline(false)
    try {
      window.addEventListener('online', goOnline)
      window.addEventListener('offline', goOffline)
      return () => {
        window.removeEventListener('online', goOnline)
        window.removeEventListener('offline', goOffline)
      }
    } catch {
      return undefined
    }
  }, [])

  if (isOnline) return null

  return (
    <View
      accessibilityRole="alert"
      accessibilityLiveRegion="polite"
      className="mx-4 mt-3 flex-row items-start gap-2.5 rounded-row border border-dangerBorder-light bg-dangerSurface-light p-3 dark:border-dangerBorder-dark dark:bg-dangerSurface-dark"
    >
      <Ionicons name="cloud-offline-outline" size={ICON.row} color={iconColor} style={{ marginTop: 1 }} />
      <Text className="flex-1 text-caption font-sans text-inkMuted-light dark:text-inkMuted-dark">
        {t('common.offline')}
      </Text>
    </View>
  )
}
