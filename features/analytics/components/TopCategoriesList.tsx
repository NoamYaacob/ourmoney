import { Text, View } from 'react-native'
import { Divider } from '@/components/ui/Divider'
import { formatILS } from '@/lib/money/format'
import type { CategoryBreakdownEntry } from '../lib/categoryBreakdown'

interface TopCategoriesListProps {
  entries: CategoryBreakdownEntry[]
  categoryNameById: Record<string, string>
  categoryIconById: Record<string, string>
}

export function TopCategoriesList({ entries, categoryNameById, categoryIconById }: TopCategoriesListProps) {
  return (
    <View>
      {entries.map((entry, index) => (
        <View key={entry.categoryId}>
          {index > 0 && (
            <View className="my-2">
              <Divider />
            </View>
          )}
          <View className="flex-row items-center justify-between">
            <Text className="text-sm text-ink-light dark:text-ink-dark">
              {categoryIconById[entry.categoryId] ?? '📦'} {categoryNameById[entry.categoryId] ?? ''}
            </Text>
            <Text className="text-sm font-semibold text-ink-light dark:text-ink-dark">
              {formatILS(entry.spentAgorot)}
            </Text>
          </View>
        </View>
      ))}
    </View>
  )
}
