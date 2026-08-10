import { useState } from 'react'
import { FlatList, Modal, Pressable, Text, View } from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { useColorScheme } from 'nativewind'
import { colors } from '@/constants/colors'

export interface SelectOption {
  value: string
  label: string
}

interface SelectProps {
  label: string
  options: SelectOption[]
  value: string | null
  onChange: (value: string) => void
  placeholder: string
}

export function Select({ label, options, value, onChange, placeholder }: SelectProps) {
  const [isOpen, setIsOpen] = useState(false)
  const { colorScheme: scheme } = useColorScheme()
  const selectedLabel = options.find((option) => option.value === value)?.label

  return (
    <View className="mb-4">
      <Text className="mb-1 text-sm text-inkMuted-light dark:text-inkMuted-dark">{label}</Text>
      <Pressable
        onPress={() => setIsOpen(true)}
        accessibilityRole="button"
        accessibilityLabel={label}
        // An explicit accessibilityLabel overrides the accessible name RN
        // would otherwise compose from the child Text nodes below — without
        // accessibilityValue, a screen-reader user hears only "<label>,
        // button" with no way to tell what's currently selected (mobile-
        // expo-reviewer finding).
        accessibilityValue={{ text: selectedLabel ?? placeholder }}
        className="flex-row items-center justify-between rounded-xl border border-border-light bg-surfaceMuted-light px-4 py-3 dark:border-border-dark dark:bg-surfaceMuted-dark"
      >
        <Text
          className={
            selectedLabel
              ? 'text-ink-light dark:text-ink-dark'
              : 'text-inkMuted-light dark:text-inkMuted-dark'
          }
        >
          {selectedLabel ?? placeholder}
        </Text>
        <Ionicons name="chevron-down" size={18} color={scheme === 'dark' ? colors.inkMuted.dark : colors.inkMuted.light} />
      </Pressable>

      <Modal visible={isOpen} transparent animationType="slide" onRequestClose={() => setIsOpen(false)}>
        <Pressable className="flex-1 justify-end bg-black/40" onPress={() => setIsOpen(false)}>
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
                  {item.value === value && (
                    <Ionicons name="checkmark" size={18} color={scheme === 'dark' ? colors.accent.dark : colors.accent.light} />
                  )}
                </Pressable>
              )}
            />
          </View>
        </Pressable>
      </Modal>
    </View>
  )
}
