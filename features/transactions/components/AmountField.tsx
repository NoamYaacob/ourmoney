// Design Phase 2: amount is the single most important input on this form —
// previously it looked identical to every other text field. This is a
// dedicated, oversized entry area; it only renders the value and forwards
// onChangeText, so agorotFromILS parsing/validation in the parent screen is
// completely unchanged (this component never touches money arithmetic).
import { Text, TextInput, View } from 'react-native'
import { useColorScheme } from 'nativewind'
import { colors } from '@/constants/colors'

interface AmountFieldProps {
  label: string
  value: string
  onChangeText: (text: string) => void
  placeholder: string
}

export function AmountField({ label, value, onChangeText, placeholder }: AmountFieldProps) {
  const { colorScheme: scheme } = useColorScheme()
  const placeholderColor = scheme === 'dark' ? colors.inkMuted.dark : colors.inkMuted.light

  return (
    // Desktop Visual/Responsive Design pass: trimmed vertical rhythm at
    // desktop only (mb-6/pb-5 -> mb-4/pb-3) — this stays the visually
    // dominant hero field (same text-display size, same centered symbol+
    // digits row), just without claiming as much of a now-wider form's
    // vertical space before the grouped fields below it. Mobile untouched.
    <View className="mb-6 items-center border-b border-border-light pb-5 web:desktop:mb-4 web:desktop:pb-3 dark:border-border-dark">
      <Text className="mb-1 text-caption text-inkMuted-light dark:text-inkMuted-dark">{label}</Text>
      {/* The ₪ comes after the digits in source, which under RTL puts it on
          the physical left — where `formatILS` puts it in every other figure
          in the app, and where the design's own entry screen draws it. It
          had been first, so the one amount a household actually types was
          the one amount laid out differently from all the ones it reads
          back.

          The input keeps a min-width so a short or empty value still has a
          stable tap target, and right-aligns inside it so the digits stay
          flush against the symbol however many are typed — extra width grows
          away from it rather than around it.

          It also needs a max-width and `shrink`. A browser sizes a text
          input from its `size` attribute — about twenty characters — so at
          52px the field measured 626px inside a 390px screen and pushed
          itself and the ₪ clean off both edges. Nothing about that is
          visible until you measure it: the row reported no overflow because
          it was centred, so it hung off each side equally. */}
      <View className="w-full flex-row items-center justify-center gap-1">
        <TextInput
          value={value}
          onChangeText={onChangeText}
          placeholder={placeholder}
          placeholderTextColor={placeholderColor}
          keyboardType="decimal-pad"
          accessibilityLabel={label}
          className="min-w-[90px] max-w-[240px] shrink font-heebo text-heroXl text-ink-light dark:text-ink-dark"
          // The class alone cannot size an <input> on web — see the
          // `input[data-hero-amount]` rule in global.css for why, and for the
          // measurement behind it. Native takes the size from the class.
          {...({ dataSet: { heroAmount: '' } } as object)}
          style={{ textAlign: 'right' }}
          maxFontSizeMultiplier={1.2}
        />
        <Text
          className="font-heebo text-heroXl text-ink-light dark:text-ink-dark"
          maxFontSizeMultiplier={1.2}
        >
          ₪
        </Text>
      </View>
    </View>
  )
}
