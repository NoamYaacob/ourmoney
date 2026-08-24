// Extracted from the identical centered error-text block duplicated across
// every M3/M4 screen — was `text-red-600 dark:text-red-400` (raw Tailwind
// default shades) everywhere; now the `danger` token in constants/colors.ts
// is the single place that shade is spelled out.
//
// `onRetry` is optional and additive: every existing caller that only ever
// passed `message` keeps rendering exactly the same plain text it always
// has. A caller whose failed query is retryable passes `onRetry` (its
// hook's own `refetch`) and gets a real button here instead of leaving a
// household stuck re-navigating away and back, or backgrounding the app,
// to get a query to run again — which was the only way to recover from a
// failed fetch anywhere in the product before this.

import { Pressable, Text, View } from 'react-native'
import { useTranslation } from 'react-i18next'

interface ErrorMessageProps {
  message: string
  onRetry?: () => void
}

export function ErrorMessage({ message, onRetry }: ErrorMessageProps) {
  const { t } = useTranslation()
  return (
    <View className="mb-4 items-center gap-2">
      <Text className="text-center text-sm text-danger-light dark:text-danger-dark" accessibilityRole="alert">
        {message}
      </Text>
      {onRetry && (
        <Pressable onPress={onRetry} accessibilityRole="button" accessibilityLabel={t('common.retry')}>
          <Text className="text-caption font-sansSemibold text-accent-light dark:text-accent-dark">
            {t('common.retry')}
          </Text>
        </Pressable>
      )}
    </View>
  )
}
