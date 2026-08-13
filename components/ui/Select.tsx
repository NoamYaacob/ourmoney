import { useState, type ComponentProps, type ReactNode } from 'react'
import { FlatList, Modal, Platform, Pressable, Text, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { Ionicons } from '@expo/vector-icons'
import { useColorScheme } from 'nativewind'
import { colors } from '@/constants/colors'

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
  const { colorScheme: scheme } = useColorScheme()
  const selectedOption = options.find((option) => option.value === value)
  const selectedLabel = selectedOption?.label
  const mutedColor = scheme === 'dark' ? colors.inkMuted.dark : colors.inkMuted.light
  const accentColor = scheme === 'dark' ? colors.accent.dark : colors.accent.light

  return (
    <>
      {variant === 'row' ? (
        <Pressable
          onPress={() => setIsOpen(true)}
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
          <Ionicons name="chevron-down" size={18} color={mutedColor} />
        </Pressable>
      ) : (
        <View className="mb-4">
          <Text className="mb-1 text-sm text-inkMuted-light dark:text-inkMuted-dark">{label}</Text>
          <Pressable
            onPress={() => setIsOpen(true)}
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
            <Ionicons name="chevron-down" size={18} color={mutedColor} />
          </Pressable>
        </View>
      )}

      <Modal visible={isOpen} transparent animationType="slide" onRequestClose={() => setIsOpen(false)}>
        <Pressable className="flex-1 justify-end bg-black/40" onPress={() => setIsOpen(false)}>
          {variant === 'row' ? (
            <View className="max-h-[70%] rounded-t-2xl bg-surface-light dark:bg-surface-dark">
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
                    className="flex-row items-center gap-3 px-4 py-3.5"
                  >
                    {item.iconName && (
                      <View className="h-9 w-9 items-center justify-center rounded-full bg-surfaceMuted-light dark:bg-surfaceMuted-dark">
                        <Ionicons name={item.iconName} size={18} color={mutedColor} />
                      </View>
                    )}
                    <Text className="flex-1 text-body text-ink-light dark:text-ink-dark">{item.label}</Text>
                    {item.value === value && <Ionicons name="checkmark" size={18} color={accentColor} />}
                  </Pressable>
                )}
              />
              <SafeAreaView edges={['bottom']} />
            </View>
          ) : (
            <View className="max-h-96 rounded-t-2xl bg-surface-light p-4 dark:bg-surface-dark">
              <FlatList
                data={options}
                keyExtractor={(item) => item.value}
                renderItem={({ item }) => (
                  <Pressable
                    onPress={() => {
                      onChange(item.value)
                      setIsOpen(false)
                    }}
                    accessibilityRole="button"
                    className="flex-row items-center justify-between border-b border-border-light py-3 dark:border-border-dark"
                  >
                    <Text className="text-base text-ink-light dark:text-ink-dark">{item.label}</Text>
                    {item.value === value && <Ionicons name="checkmark" size={18} color={accentColor} />}
                  </Pressable>
                )}
              />
            </View>
          )}
        </Pressable>
      </Modal>
    </>
  )
}
