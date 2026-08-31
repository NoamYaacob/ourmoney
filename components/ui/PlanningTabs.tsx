// The three Planning sections, as one place with three tabs.
//
// `OurMoney - Mobile.dc.html` screen 10 draws תכנון as a single screen whose
// body swaps between התחייבויות, קבועים and יעדים; the desktop frame groups
// the same three under one "תכנון · התחייבויות · חיובים קבועים · יעדים"
// panel. The app had them as three unrelated destinations reached from
// different places, so moving between "what is due once" and "what is due
// every month" meant going back out to a menu.
//
// Presentation only. `/obligations`, `/recurring` and `/goals` remain exactly
// the routes they were — same files, same hooks, same deep links, same
// history. This strip is a control that navigates between them, not a
// re-parenting of the routes underneath it, which is what keeps every
// existing link and test valid.
//
// `replace`, not `push`: the three are siblings, not a stack. Pushing would
// grow the back stack every time someone compared two tabs, and then leaving
// Planning would mean pressing back once per comparison.

import { Pressable, Text, View } from 'react-native'
import { useRouter } from 'expo-router'
import { useTranslation } from 'react-i18next'

export type PlanningTab = 'obligations' | 'recurring' | 'goals'

// Short labels, as the frame writes them — "התחייבויות · קבועים · יעדים".
// The full destination names ("חיובים קבועים", "יעדי חיסכון") do not fit a
// third of a 390px row and truncate mid-word, which is worse than the
// shorter name: the screen title directly above already says the long one.
// `accessibilityLabel` keeps the full name for anyone not reading the
// title visually.
const TABS: { key: PlanningTab; route: '/obligations' | '/recurring' | '/goals'; labelKey: string; fullKey: string }[] = [
  { key: 'obligations', route: '/obligations', labelKey: 'nav.planningTabs.obligations', fullKey: 'settings.financial.obligations' },
  { key: 'recurring', route: '/recurring', labelKey: 'nav.planningTabs.recurring', fullKey: 'settings.financial.recurring' },
  { key: 'goals', route: '/goals', labelKey: 'nav.planningTabs.goals', fullKey: 'settings.financial.goals' },
]

export function PlanningTabs({ active }: { active: PlanningTab }) {
  const { t } = useTranslation()
  const router = useRouter()

  return (
    <View
      accessibilityRole="tablist"
      className="mb-4 h-12 flex-row gap-1 rounded-control bg-track-light p-1 dark:bg-track-dark"
    >
      {TABS.map((tab) => {
        const isActive = tab.key === active
        return (
          <Pressable
            key={tab.key}
            onPress={() => {
              if (isActive) return
              router.replace(tab.route)
            }}
            accessibilityRole="tab"
            accessibilityState={{ selected: isActive }}
            // RRR §16 P0-4: see SegmentedControl.tsx's note — aria-selected
            // reaches the DOM directly, accessibilityState's object form
            // does not.
            aria-selected={isActive}
            accessibilityLabel={t(tab.fullKey)}
            className={`h-10 flex-1 items-center justify-center rounded-[8px] px-2 ${
              isActive ? 'bg-surfaceMuted-light dark:bg-surfaceMuted-dark' : ''
            }`}
          >
            <Text
              className={`text-caption ${
                isActive
                  ? 'font-sansSemibold text-ink-light dark:text-ink-dark'
                  : 'font-sans text-inkMuted-light dark:text-inkMuted-dark'
              }`}
              numberOfLines={1}
            >
              {t(tab.labelKey)}
            </Text>
          </Pressable>
        )
      })}
    </View>
  )
}
