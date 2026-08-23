// Shared header for every auth/onboarding screen (sign-in, sign-up,
// forgot-password, create-household, invite-partner) — previously each
// screen duplicated its own `text-2xl font-bold` title with no brand mark,
// a raw Tailwind size outside the design system's own type scale
// (tailwind.config.js's `fontSize` roles) and no visual anchor, which read
// as visually disconnected from the rest of the app (mobile visual-parity
// pass finding). The mark is the exact motif DesktopSideRail already uses
// for the same identity purpose, just larger — one shared shape for "this
// is OurMoney," not two.
import { Text, View } from 'react-native'

interface AuthHeaderProps {
  title: string
}

export function AuthHeader({ title }: AuthHeaderProps) {
  return (
    <View className="mb-8 items-center">
      <View className="mb-4 h-12 w-12 items-center justify-center rounded-card bg-ink-light dark:bg-ink-dark">
        <View className="h-3.5 w-3.5 rounded-[4px] bg-accent-light dark:bg-accent-dark" />
      </View>
      <Text className="text-center font-heebo text-title text-ink-light dark:text-ink-dark">{title}</Text>
    </View>
  )
}
