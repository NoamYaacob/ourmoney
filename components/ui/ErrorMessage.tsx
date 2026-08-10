// Extracted from the identical centered error-text block duplicated across
// every M3/M4 screen — was `text-red-600 dark:text-red-400` (raw Tailwind
// default shades) everywhere; now the `danger` token in constants/colors.ts
// is the single place that shade is spelled out.

import { Text } from 'react-native'

interface ErrorMessageProps {
  message: string
}

export function ErrorMessage({ message }: ErrorMessageProps) {
  return (
    <Text
      className="mb-4 text-center text-sm text-danger-light dark:text-danger-dark"
      accessibilityRole="alert"
    >
      {message}
    </Text>
  )
}
