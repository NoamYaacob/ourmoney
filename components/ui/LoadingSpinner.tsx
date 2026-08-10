// useColorScheme is imported from 'nativewind', NOT 'react-native' — see
// components/ui/Button.tsx's header comment for why.

import { ActivityIndicator } from 'react-native'
import { useColorScheme } from 'nativewind'
import { colors } from '@/constants/colors'

export function LoadingSpinner() {
  const { colorScheme: scheme } = useColorScheme()
  return <ActivityIndicator color={scheme === 'dark' ? colors.accent.dark : colors.accent.light} />
}
