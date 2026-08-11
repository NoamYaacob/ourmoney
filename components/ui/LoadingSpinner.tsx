// useColorScheme is imported from 'nativewind', NOT 'react-native' — see
// components/ui/Button.tsx's header comment for why.
//
// Milestone 8 accessibility fix: a bare ActivityIndicator has no
// accessibilityRole/Label of its own, so a screen-reader user got no
// announcement at all when a screen swapped its content for this spinner —
// this is the single shared loading component for every screen in the app,
// so the gap was repo-wide. accessibilityLiveRegion is Android-only (no-op
// elsewhere) and is what makes TalkBack announce the label the moment this
// component appears, without the user needing to manually explore to find it.

import { ActivityIndicator } from 'react-native'
import { useColorScheme } from 'nativewind'
import { useTranslation } from 'react-i18next'
import { colors } from '@/constants/colors'

export function LoadingSpinner() {
  const { colorScheme: scheme } = useColorScheme()
  const { t } = useTranslation()
  return (
    <ActivityIndicator
      color={scheme === 'dark' ? colors.accent.dark : colors.accent.light}
      accessible
      accessibilityRole="progressbar"
      accessibilityLabel={t('common.loading')}
      accessibilityLiveRegion="polite"
    />
  )
}
