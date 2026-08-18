import { View, type ViewProps } from 'react-native'

export function Card({ className, children, ...viewProps }: ViewProps) {
  return (
    <View
      className={
        className ??
        // Design Phase 1: rounded-card is the shared large-surface radius
        // token (see tailwind.config.js). Border kept subtle — surfaceMuted
        // already separates the card from `surface` tonally, so the border
        // is a light hairline rather than the primary separation cue.
        'rounded-card border border-border-light bg-surfaceMuted-light p-3 dark:border-border-dark dark:bg-surfaceMuted-dark'
      }
      {...viewProps}
    >
      {children}
    </View>
  )
}
