// Generic pulsing placeholder block, rendered while a screen section's real
// content is still loading. Purely decorative — a rectangle conveys no
// information beyond shape, so it is hidden from screen readers entirely
// (importantForAccessibility="no-hide-descendants"); the screen wraps its
// group of Skeleton blocks in a single accessible progressbar-role
// container instead, matching LoadingSpinner's existing announcement
// pattern rather than announcing every individual block.
//
// Uses React Native's built-in Animated API, not react-native-reanimated:
// reanimated is only a transitive dependency of NativeWind's css-interop
// engine (ADR-011), not one this project owns directly, and a background
// opacity pulse needs nothing reanimated provides over core Animated.
// useNativeDriver: true hands the per-frame update to the native animated
// graph instead of a React state update per frame — required, not just a
// perf nicety: RN's newer hooks-based Animated implementation triggers a
// real React re-render on every JS-driven frame (confirmed by triggering
// "not wrapped in act()" warnings under RNTL with useNativeDriver: false),
// which would spam every screen test that renders a loading Skeleton.

import { useEffect, useState } from 'react'
import { Animated, type ViewProps } from 'react-native'

export function Skeleton({ className, style, ...viewProps }: ViewProps) {
  // useState's lazy initializer, not useRef().current: this project's lint
  // config (react-hooks/refs) forbids reading a ref's .current during
  // render, which useRef(...).current does immediately on every render.
  // useState gives the same "created once, stable identity" guarantee for
  // an Animated.Value without that violation.
  const [opacity] = useState(() => new Animated.Value(0.4))

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, { toValue: 1, duration: 700, useNativeDriver: true }),
        Animated.timing(opacity, { toValue: 0.4, duration: 700, useNativeDriver: true }),
      ])
    )
    loop.start()
    return () => loop.stop()
  }, [opacity])

  return (
    <Animated.View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={[{ opacity }, style]}
      className={className ?? 'h-4 w-full rounded-md bg-border-light dark:bg-border-dark'}
      {...viewProps}
    />
  )
}
