import { useState, type ComponentProps, type ReactNode } from 'react'
import { FlatList, Modal, Platform, Pressable, Text, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { Ionicons } from '@expo/vector-icons'
import { useColorScheme } from 'nativewind'
import { colors } from '@/constants/colors'
import { ICON } from '@/constants/icons'
import { DIALOG_WIDTH_CLASS } from '@/constants/layout'
import { usePopoverAnchor } from '@/hooks/usePopoverAnchor'

export interface SelectOption {
  value: string
  label: string
  // Design Phase 2: optional per-option leading icon for the bottom sheet
  // row (e.g. a category's icon). Omitted entirely by every pre-Phase-2
  // caller, so their sheet rows render exactly as before — plain label +
  // trailing checkmark, no icon column.
  iconName?: ComponentProps<typeof Ionicons>['name']
}

interface SelectProps {
  label: string
  options: SelectOption[]
  value: string | null
  onChange: (value: string) => void
  placeholder: string
  // Design Phase 2, both additive/opt-in — default 'box' is the original
  // trigger AND the original bottom-sheet chrome, pixel-identical to every
  // pre-Phase-2 caller (Accounts/Budgets/Recurring/Settings/Import/edit-
  // transaction — all untouched this phase). 'row' is the tappable-
  // selection-row trigger + polished sheet used only by Add Transaction's
  // account/category fields, so this phase's sheet polish (item 14) can't
  // leak into screens this phase isn't supposed to touch.
  variant?: 'box' | 'row'
  leadingIcon?: ReactNode
  sheetTitle?: string
}

const POPOVER_MAX_HEIGHT = 320
const POPOVER_MIN_WIDTH = 260

export function Select({
  label,
  options,
  value,
  onChange,
  placeholder,
  variant = 'box',
  leadingIcon,
  sheetTitle,
}: SelectProps) {
  const [isOpen, setIsOpen] = useState(false)
  const { triggerRef, anchor, isDesktopWeb, measure, style: anchorStyle } = usePopoverAnchor()
  const { colorScheme: scheme } = useColorScheme()
  const selectedOption = options.find((option) => option.value === value)
  const selectedLabel = selectedOption?.label
  const mutedColor = scheme === 'dark' ? colors.inkMuted.dark : colors.inkMuted.light
  const accentColor = scheme === 'dark' ? colors.accent.dark : colors.accent.light

  function openSelect() {
    // Opening never waits on measurement — see usePopoverAnchor's own
    // comment for why. popoverStyle()'s null-anchor fallback covers the
    // render before it resolves.
    setIsOpen(true)
    measure()
  }

  // Popover width is content-driven (grows to fit a wide option list, never
  // narrower than the trigger); usePopoverAnchor handles the actual
  // top/left/viewport-collision math shared with DatePickerField's calendar
  // popover.
  function popoverStyle() {
    const popoverWidth = anchor ? Math.max(anchor.width, POPOVER_MIN_WIDTH) : POPOVER_MIN_WIDTH
    return anchorStyle(popoverWidth, POPOVER_MAX_HEIGHT)
  }

  return (
    <>
      {variant === 'row' ? (
        <Pressable
          ref={triggerRef}
          onPress={openSelect}
          accessibilityRole="button"
          accessibilityLabel={label}
          accessibilityValue={{ text: selectedLabel ?? placeholder }}
          className="flex-row items-center gap-3 py-3 active:opacity-70"
        >
          {leadingIcon}
          <View className="flex-1">
            <Text className="text-caption text-inkMuted-light dark:text-inkMuted-dark">{label}</Text>
            <Text
              className={
                selectedLabel
                  ? 'mt-0.5 text-body text-ink-light dark:text-ink-dark'
                  : 'mt-0.5 text-body text-inkMuted-light dark:text-inkMuted-dark'
              }
            >
              {selectedLabel ?? placeholder}
            </Text>
          </View>
          <Ionicons name="chevron-down" size={ICON.row} color={mutedColor} />
        </Pressable>
      ) : (
        <View className="mb-4">
          <Text className="mb-1 text-sm text-inkMuted-light dark:text-inkMuted-dark">{label}</Text>
          <Pressable
            ref={triggerRef}
            onPress={openSelect}
            accessibilityRole="button"
            accessibilityLabel={label}
            // An explicit accessibilityLabel overrides the accessible name RN
            // would otherwise compose from the child Text nodes below —
            // without accessibilityValue, a screen-reader user hears only
            // "<label>, button" with no way to tell what's currently selected
            // (mobile-expo-reviewer finding).
            accessibilityValue={{ text: selectedLabel ?? placeholder }}
            className="flex-row items-center justify-between rounded-xl border border-border-light bg-surfaceMuted-light px-4 py-3 dark:border-border-dark dark:bg-surfaceMuted-dark"
          >
            <Text className={selectedLabel ? 'text-ink-light dark:text-ink-dark' : 'text-inkMuted-light dark:text-inkMuted-dark'}>
              {selectedLabel ?? placeholder}
            </Text>
            <Ionicons name="chevron-down" size={ICON.row} color={mutedColor} />
          </Pressable>
        </View>
      )}

      <Modal
        visible={isOpen}
        transparent
        animationType={isDesktopWeb ? 'fade' : 'slide'}
        onRequestClose={() => setIsOpen(false)}
      >
        {isDesktopWeb ? (
          // Anchored popover: the backdrop is still a full-screen Pressable
          // (click-outside-to-close, same mechanism every other caller
          // already relies on) and the Modal still owns Escape-to-close via
          // onRequestClose (react-native-web's Modal attaches this on web) —
          // both are inherited for free by staying inside the same Modal,
          // rather than reimplemented with raw DOM listeners. Only the
          // content's own position/size changes: anchored under (or, near
          // the bottom edge, above) the trigger and sized to it, not
          // centered/full-width like the mobile sheet or the old dialog.
          <Pressable className="flex-1" onPress={() => setIsOpen(false)}>
            <View
              style={popoverStyle()}
              className="max-h-[320px] rounded-xl border border-border-light bg-surface-light shadow-lg dark:border-border-dark dark:bg-surface-dark"
            >
              {sheetTitle && (
                <Text className="border-b border-border-light px-3 pb-2 pt-3 text-caption font-semibold text-ink-light dark:border-border-dark dark:text-ink-dark">
                  {sheetTitle}
                </Text>
              )}
              <FlatList
                data={options}
                keyExtractor={(item) => item.value}
                ItemSeparatorComponent={() => <View className="h-px bg-border-light dark:bg-border-dark" />}
                renderItem={({ item }) => (
                  <Pressable
                    onPress={() => {
                      onChange(item.value)
                      setIsOpen(false)
                    }}
                    accessibilityRole="button"
                    accessibilityState={{ selected: item.value === value }}
                    // RRR §16 P0-4: aria-selected reaches the DOM directly
                    // (RNW forwards it; accessibilityState's object form is
                    // dropped) — see SegmentedControl.tsx's identical note.
                    aria-selected={item.value === value}
                    className="flex-row items-center gap-3 px-3 py-2.5"
                  >
                    {item.iconName && (
                      <View className="h-7 w-7 items-center justify-center rounded-full bg-surfaceMuted-light dark:bg-surfaceMuted-dark">
                        <Ionicons name={item.iconName} size={ICON.chip} color={mutedColor} />
                      </View>
                    )}
                    <Text className="flex-1 text-body text-ink-light dark:text-ink-dark" numberOfLines={1}>
                      {item.label}
                    </Text>
                    {item.value === value && <Ionicons name="checkmark" size={ICON.row} color={accentColor} />}
                  </Pressable>
                )}
              />
            </View>
          </Pressable>
        ) : (
          <Pressable className="flex-1 justify-end bg-black/40" onPress={() => setIsOpen(false)}>
            {variant === 'row' ? (
              <View className={`max-h-[70%] w-full ${DIALOG_WIDTH_CLASS} rounded-t-2xl bg-surface-light dark:bg-surface-dark`}>
                {/* Drag-handle affordance — this Modal is a plain RN Modal, not
                    a real gesture-driven bottom sheet, so there is nothing to
                    wire up here beyond the visual cue (no new library added). */}
                <View className="items-center pb-1 pt-3">
                  <View className="h-1 w-9 rounded-full bg-border-light dark:bg-border-dark" />
                </View>
                {sheetTitle && (
                  <Text className="px-4 pb-2 pt-1 text-heading font-semibold text-ink-light dark:text-ink-dark">
                    {sheetTitle}
                  </Text>
                )}
                <FlatList
                  data={options}
                  keyExtractor={(item) => item.value}
                  contentContainerStyle={{ paddingBottom: Platform.OS === 'ios' ? 8 : 16 }}
                  ItemSeparatorComponent={() => <View className="h-px bg-border-light dark:bg-border-dark" />}
                  renderItem={({ item }) => (
                    <Pressable
                      onPress={() => {
                        onChange(item.value)
                        setIsOpen(false)
                      }}
                      accessibilityRole="button"
                      accessibilityState={{ selected: item.value === value }}
                      // RRR §16 P0-4: aria-selected reaches the DOM directly
                      // (RNW forwards it; accessibilityState's object form
                      // is dropped) — see SegmentedControl.tsx's note.
                      aria-selected={item.value === value}
                      className="flex-row items-center gap-3 px-4 py-3.5"
                    >
                      {item.iconName && (
                        <View className="h-9 w-9 items-center justify-center rounded-full bg-surfaceMuted-light dark:bg-surfaceMuted-dark">
                          <Ionicons name={item.iconName} size={ICON.row} color={mutedColor} />
                        </View>
                      )}
                      <Text className="flex-1 text-body text-ink-light dark:text-ink-dark">{item.label}</Text>
                      {item.value === value && <Ionicons name="checkmark" size={ICON.row} color={accentColor} />}
                    </Pressable>
                  )}
                />
                <SafeAreaView edges={['bottom']} />
              </View>
            ) : (
              <View className={`max-h-96 w-full ${DIALOG_WIDTH_CLASS} rounded-t-2xl bg-surface-light p-4 dark:bg-surface-dark`}>
                <FlatList
                  data={options}
                  keyExtractor={(item) => item.value}
                  // Visual QA pass: this variant had no bottom padding and no
                  // safe-area handling at all — the 'row' variant's own
                  // trailing `<SafeAreaView edges={['bottom']} />` below is
                  // what this was missing, on the one variant every
                  // pre-existing caller (Accounts, Budgets, Recurring,
                  // Settings, Import, edit-transaction) still uses.
                  contentContainerStyle={{ paddingBottom: 8 }}
                  ItemSeparatorComponent={() => <View className="h-px bg-border-light dark:bg-border-dark" />}
                  renderItem={({ item }) => (
                    <Pressable
                      onPress={() => {
                        onChange(item.value)
                        setIsOpen(false)
                      }}
                      accessibilityRole="button"
                      accessibilityState={{ selected: item.value === value }}
                      // RRR §16 P0-4: aria-selected reaches the DOM directly
                      // (RNW forwards it; accessibilityState's object form
                      // is dropped) — see SegmentedControl.tsx's note.
                      aria-selected={item.value === value}
                      className="flex-row items-center gap-3 py-3"
                    >
                      {item.iconName && (
                        <View className="h-8 w-8 items-center justify-center rounded-full bg-surfaceMuted-light dark:bg-surfaceMuted-dark">
                          <Ionicons name={item.iconName} size={ICON.row} color={mutedColor} />
                        </View>
                      )}
                      <Text className="flex-1 text-base text-ink-light dark:text-ink-dark">{item.label}</Text>
                      {item.value === value && <Ionicons name="checkmark" size={ICON.row} color={accentColor} />}
                    </Pressable>
                  )}
                />
                <SafeAreaView edges={['bottom']} />
              </View>
            )}
          </Pressable>
        )}
      </Modal>
    </>
  )
}
