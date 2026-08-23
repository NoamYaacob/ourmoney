// The sheet the mobile design uses wherever a set of choices would
// otherwise eat permanent vertical space — filters, category pickers.
//
// Distinct from components/ui/Modal.tsx, which is a centered confirm dialog
// for a single destructive decision. This is a working surface: it rises
// from the bottom edge, it scrolls, and its actions sit at the bottom
// within thumb reach rather than at the top. Mixing the two would have made
// "choose a filter" look like "delete this permanently".
//
// The actions row is sticky, outside the scroll: a household that has
// scrolled through twenty categories must not have to scroll back up to
// apply. That is also why the primary action sits at the bottom of the
// sheet and not in its header — the design's hand-reach rule.

import type { ReactNode } from 'react'
import { Modal as RNModal, Pressable, ScrollView, Text, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { DIALOG_WIDTH_CLASS } from '@/constants/layout'

interface BottomSheetProps {
  visible: boolean
  title: string
  onClose: () => void
  children: ReactNode
  // The bottom action row. Omitted for a sheet whose choices apply on tap
  // (a category picker) rather than on confirm (a filter set).
  actions?: ReactNode
  testID?: string
}

export function BottomSheet({ visible, title, onClose, children, actions, testID }: BottomSheetProps) {
  // RNModal renders outside Screen.tsx's own SafeAreaView (it's a top-level
  // overlay, native and on web), so this sheet was the one surface in the
  // app never actually reading the device's real inset — `pb-8`/`pb-4` below
  // were a fixed guess standing in for it. A device with a taller home
  // indicator than that guess assumes gets a button sitting exactly where
  // the design's own comment says it must not: under the system gesture.
  const insets = useSafeAreaInsets()
  return (
    <RNModal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      {/* The scrim dismisses, and is a real pressable rather than a
          decorative view so the gesture is available to assistive tech as
          well as to a tap. */}
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={title}
        onPress={onClose}
        className="flex-1 justify-end bg-black/40"
      >
        {/* Stops a tap inside the sheet from reaching the scrim behind it. */}
        <Pressable
          testID={testID}
          onPress={() => {}}
          accessibilityViewIsModal
          className={`w-full self-center ${DIALOG_WIDTH_CLASS} max-h-[85%] rounded-t-hero bg-surface-light dark:bg-surface-dark`}
        >
          <View className="items-center pt-2.5">
            <View className="h-1 w-9 rounded-full bg-border-light dark:bg-border-dark" />
          </View>

          <View className="min-h-[44px] flex-row items-center justify-between px-5 py-3">
            <Text accessibilityRole="header" className="text-heading font-heeboBold text-ink-light dark:text-ink-dark">
              {title}
            </Text>
          </View>

          <ScrollView
            className="px-5"
            // No actions row below to carry the inset (see the `actions`
            // branch) — this edge IS the sheet's bottom edge, so it needs
            // the real safe-area value, not the fixed pb-4 every other
            // scroll body uses.
            contentContainerStyle={actions ? undefined : { paddingBottom: Math.max(16, insets.bottom + 8) }}
            contentContainerClassName={actions ? 'pb-4' : undefined}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            {children}
          </ScrollView>

          {actions && (
            // The home indicator sits under this edge, and a button flush
            // against it is a button the household has to fight the system
            // gesture to press — insets.bottom is the device's real value,
            // floored at 16px so a device with no home indicator (an older
            // iPhone, most Android phones) still gets a deliberate gap.
            <View
              className="flex-row gap-2.5 border-t border-border-light px-5 pt-3 dark:border-border-dark"
              style={{ paddingBottom: Math.max(16, insets.bottom + 16) }}
            >
              {actions}
            </View>
          )}
        </Pressable>
      </Pressable>
    </RNModal>
  )
}
