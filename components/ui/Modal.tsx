import { Modal as RNModal, Text, View } from 'react-native'
import { Button } from './Button'

interface ModalProps {
  visible: boolean
  title: string
  message?: string
  confirmLabel: string
  cancelLabel: string
  onConfirm: () => void
  onCancel: () => void
  destructive?: boolean
  loading?: boolean
}

// Confirm dialogs for destructive actions (archive account, delete
// transaction/category/rule) — the one gap the M5 component set left
// unbuilt (product-scope-guardian finding, M6 planning pass).
export function Modal({
  visible,
  title,
  message,
  confirmLabel,
  cancelLabel,
  onConfirm,
  onCancel,
  destructive = false,
  loading = false,
}: ModalProps) {
  return (
    <RNModal visible={visible} transparent animationType="fade" onRequestClose={onCancel}>
      <View className="flex-1 items-center justify-center bg-black/40 px-6">
        <View className="w-full rounded-xl bg-surface-light p-5 dark:bg-surface-dark">
          <Text className="mb-2 text-lg font-bold text-ink-light dark:text-ink-dark">{title}</Text>
          {message && <Text className="mb-4 text-sm text-inkMuted-light dark:text-inkMuted-dark">{message}</Text>}
          <View className="flex-row-reverse gap-2">
            <Button
              title={confirmLabel}
              onPress={onConfirm}
              loading={loading}
              variant={destructive ? 'primary' : 'secondary'}
            />
            <Button title={cancelLabel} onPress={onCancel} variant="ghost" disabled={loading} />
          </View>
        </View>
      </View>
    </RNModal>
  )
}
