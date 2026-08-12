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
    // onRequestClose fires on Android's hardware/gesture back button and is
    // NOT covered by the Cancel button's own `disabled={loading}` below —
    // omitted here while loading (RN simply leaves the back press
    // unhandled) rather than unconditionally calling onCancel, which would
    // dismiss the dialog while a destructive mutation is still in flight
    // with nothing left on screen to show it (qa-adversarial-reviewer
    // finding, Milestone 9).
    <RNModal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={loading ? undefined : onCancel}
    >
      <View className="flex-1 items-center justify-center bg-black/40 px-6">
        {/* accessibilityViewIsModal (iOS): scopes VoiceOver's virtual cursor
            to this content only, so swiping can't escape to whatever screen
            is still mounted behind the dialog. accessibilityRole="alert" on
            the title mirrors ErrorMessage.tsx's existing convention — it's
            what makes a screen reader actually announce that a dialog
            appeared, instead of the user needing to discover it by exploring. */}
        <View
          className="w-full rounded-xl bg-surface-light p-5 dark:bg-surface-dark"
          accessibilityViewIsModal
        >
          <Text accessibilityRole="alert" className="mb-2 text-lg font-bold text-ink-light dark:text-ink-dark">
            {title}
          </Text>
          {message && <Text className="mb-4 text-sm text-inkMuted-light dark:text-inkMuted-dark">{message}</Text>}
          {/* maxFontSizeMultiplier=1.5: this row has no flex constraint on
              either Button, so unbounded font scaling at iOS's largest
              accessibility sizes (~310%) could overflow the dialog's fixed
              width — the one place in the app this cap applies (Button's
              own default is uncapped; see its prop comment). */}
          <View className="flex-row-reverse gap-2">
            <Button
              title={confirmLabel}
              onPress={onConfirm}
              loading={loading}
              variant={destructive ? 'danger' : 'secondary'}
              maxFontSizeMultiplier={1.5}
            />
            <Button
              title={cancelLabel}
              onPress={onCancel}
              variant="ghost"
              disabled={loading}
              maxFontSizeMultiplier={1.5}
            />
          </View>
        </View>
      </View>
    </RNModal>
  )
}
