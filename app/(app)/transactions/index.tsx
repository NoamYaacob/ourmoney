import { FlatList, Pressable, Text, View } from 'react-native'
import { useRouter } from 'expo-router'
import { useTranslation } from 'react-i18next'
import { Ionicons } from '@expo/vector-icons'
import { useColorScheme } from 'nativewind'
import { useAuth } from '@/features/auth/hooks/useAuth'
import { useHousehold } from '@/features/household/hooks/useHousehold'
import { useTransactions } from '@/features/transactions/hooks/useTransactions'
import { useCategories } from '@/features/categories/hooks/useCategories'
import { formatILS } from '@/lib/money/format'
import { CategoryIcon } from '@/features/categories/components/CategoryIcon'
import { colors } from '@/constants/colors'
import { Screen } from '@/components/ui/Screen'
import { Card } from '@/components/ui/Card'
import { Divider } from '@/components/ui/Divider'
import { FAB } from '@/components/ui/FAB'
import { ErrorMessage } from '@/components/ui/ErrorMessage'
import { SkeletonList } from '@/components/ui/SkeletonList'
import { EmptyState } from '@/components/ui/EmptyState'
import type { Transaction } from '@/types/app'

export default function Transactions() {
  const { t } = useTranslation()
  const router = useRouter()
  const { user } = useAuth()
  const { colorScheme: scheme } = useColorScheme()
  const accentColor = scheme === 'dark' ? colors.accent.dark : colors.accent.light
  const { householdId, isLoading: isHouseholdLoading } = useHousehold(user?.id)
  const { transactions, isLoading, error } = useTransactions(householdId)
  const { categories } = useCategories(householdId)
  const categoryNameById = Object.fromEntries(categories.map((c) => [c.id, c.name_he]))
  const categoryIconById = Object.fromEntries(categories.map((c) => [c.id, c.icon]))
  // Fail-safe display: householdId is briefly null while useHousehold
  // itself is still resolving, during which useTransactions' own isLoading
  // is false (enabled: !!householdId) — without folding in
  // isHouseholdLoading, the empty-list state below would render as if the
  // household genuinely has zero transactions (mobile-expo-reviewer
  // finding, systemic across the new M6 screens).
  const isPageLoading = isHouseholdLoading || isLoading

  return (
    <Screen
      scroll={false}
      width="wide"
      floatingAction={<FAB accessibilityLabel={t('transactions.addButton')} onPress={() => router.push('/transactions/new')} />}
    >
      <View className="mb-6 flex-row items-center justify-between">
        <Text className="text-title font-bold text-ink-light dark:text-ink-dark">{t('transactions.title')}</Text>
        {/* Design Phase 3: a small secondary link, not a Button — this is a
            utility action, not a peer of the primary "add transaction"
            flow, and shouldn't visually compete with the screen title. Same
            treatment as Dashboard's "כל התנועות" link. */}
        <Pressable
          onPress={() => router.push('/transactions/import')}
          accessibilityRole="button"
          className="flex-row items-center gap-1"
        >
          <Ionicons name="cloud-upload-outline" size={16} color={accentColor} />
          <Text className="text-caption font-medium text-accent-light dark:text-accent-dark">
            {t('import.entryButton')}
          </Text>
        </Pressable>
      </View>

      {error ? (
        <ErrorMessage message={t('transactions.errors.generic')} />
      ) : isPageLoading ? (
        <SkeletonList rows={5} />
      ) : transactions.length === 0 ? (
        // Phase 3.1: two changes from Phase 3 — dropped the actionLabel
        // button (the screen's own floatingAction FAB already does the
        // identical "add a transaction" action, so showing both was a
        // redundant, competing CTA), and swapped full-height
        // (flex-1/justify-center) vertical centering for a fixed top
        // offset. On an iPhone-sized viewport flex-1 centering looked
        // natural, but on a tall desktop/web window it stretched the
        // empty state to the exact vertical middle of a very tall column,
        // reading as a huge void above and below a tiny message — this
        // keeps it horizontally centered and near the top instead.
        //
        // Desktop polish pass: still not vertically centered against the
        // viewport (unchanged from the above) — but on a wide desktop
        // window the compact message alone, floating with nothing but
        // blank canvas around it, still read as an "enormous empty area"
        // once visually reviewed in a real browser. `web:desktop:` classes
        // give it a deliberate, moderately-sized bounded region right below
        // the header instead — same Card surface/border tokens used
        // everywhere else in this app, not a new design system. Mobile is
        // untouched: none of the `web:desktop:` classes apply there, so
        // this is the exact same "items-center pt-10" box as before.
        //
        // Debugging pass (real-browser regression): the previous attempt
        // added `web:desktop:items-end` to THIS element — but `align-items`
        // governs how THIS box's own CHILDREN align inside it, not how the
        // box itself is positioned within ITS parent (the Screen's plain
        // `flex-1` column, which never set `align-items` and so defaults to
        // `stretch`). A `max-w-[640px]`-clamped child under a `stretch`
        // parent isn't repositioned by `stretch` (it only affects sizing of
        // `auto`-width children) and falls back to `flex-start` — the
        // physical left edge on this LTR-computed web document (see
        // _layout.tsx's DesktopSideRail comment) — which is exactly the
        // reported bug: the box floating left-of-center instead of anchored
        // right. Confirmed both the bug and the fix with a real headless-
        // browser measurement (`getBoundingClientRect()`), not just reading
        // the compiled CSS: `items-end` left the box at
        // {left:169,right:809} in a 1440px viewport; `self-end` — which
        // sets `align-self` on the box itself, the correct property for
        // "how does THIS element sit within its parent" — moved it to
        // {left:631,right:1271}, flush against the wide content column's
        // right edge. `items-center` (mobile default, unscoped) is kept
        // so the empty-state's own icon+message still center inside the box.
        <View className="items-center pt-10 web:desktop:mt-2 web:desktop:w-full web:desktop:max-w-[640px] web:desktop:self-end web:desktop:rounded-card web:desktop:border web:desktop:border-border-light web:desktop:bg-surfaceMuted-light web:desktop:pb-10 dark:web:desktop:border-border-dark dark:web:desktop:bg-surfaceMuted-dark">
          <EmptyState iconName="receipt-outline" message={t('transactions.empty')} compact />
        </View>
      ) : (
        <FlatList<Transaction>
          data={transactions}
          keyExtractor={(item) => item.id}
          ItemSeparatorComponent={() => <View className="h-2" />}
          renderItem={({ item }) => {
            const categoryName = item.category_id ? categoryNameById[item.category_id] : undefined
            return (
              <Pressable onPress={() => router.push(`/transactions/${item.id}`)} accessibilityRole="button">
                <Card>
                  <View className="flex-row items-center gap-3">
                    <CategoryIcon icon={item.category_id ? categoryIconById[item.category_id] : undefined} size="sm" />
                    <View className="flex-1">
                      <Text className="text-body text-ink-light dark:text-ink-dark" numberOfLines={1}>
                        {item.description}
                      </Text>
                      <Text className="text-caption text-inkMuted-light dark:text-inkMuted-dark" numberOfLines={1}>
                        {categoryName ? `${categoryName} · ${item.txn_date}` : item.txn_date}
                        {!item.is_shared ? ` · ${t('transactions.form.personal')}` : ''}
                      </Text>
                    </View>
                    <Text
                      className={
                        item.amount_agorot > 0
                          ? 'text-body font-medium text-positive-light dark:text-positive-dark'
                          : 'text-body font-medium text-ink-light dark:text-ink-dark'
                      }
                    >
                      {formatILS(item.amount_agorot)}
                    </Text>
                  </View>
                  {item.is_excluded && (
                    <>
                      <View className="my-2">
                        <Divider />
                      </View>
                      <Text className="text-caption text-inkMuted-light dark:text-inkMuted-dark">
                        {t('transactions.excludedLabel')}
                      </Text>
                    </>
                  )}
                </Card>
              </Pressable>
            )
          }}
        />
      )}
    </Screen>
  )
}
