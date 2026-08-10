import { View, type ViewProps } from 'react-native'

export function Card({ className, children, ...viewProps }: ViewProps) {
  return (
    <View
      className={
        className ??
        'rounded-xl border border-border-light bg-surfaceMuted-light p-3 dark:border-border-dark dark:bg-surfaceMuted-dark'
      }
      {...viewProps}
    >
      {children}
    </View>
  )
}
