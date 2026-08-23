import { Text, View } from 'react-native'
import { Divider } from '@/components/ui/Divider'
import { formatILS } from '@/lib/money/format'
import { CategoryIcon } from '@/features/categories/components/CategoryIcon'
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
          <View className="flex-row items-center gap-3 web:flex-row">
            <CategoryIcon icon={categoryIconById[entry.categoryId]} size="sm" />
            <Text className="flex-1 text-body text-ink-light dark:text-ink-dark">
              {categoryNameById[entry.categoryId] ?? ''}
            </Text>
            <Text className="text-body font-semibold text-ink-light dark:text-ink-dark">
              {formatILS(entry.spentAgorot)}
            </Text>
          </View>
        </View>
      ))}
    </View>
  )
}
