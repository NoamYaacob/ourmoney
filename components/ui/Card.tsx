import { View, type ViewProps } from 'react-native'

const BASE_CARD_CLASS =
  'rounded-card border border-border-light bg-surfaceMuted-light dark:border-border-dark dark:bg-surfaceMuted-dark web:desktop:shadow-sm'

export function Card({ className, children, ...viewProps }: ViewProps) {
  return (
    <View className={`${BASE_CARD_CLASS} ${className ?? 'p-4 web:desktop:p-5'}`} {...viewProps}>
      {children}
    </View>
  )
}
