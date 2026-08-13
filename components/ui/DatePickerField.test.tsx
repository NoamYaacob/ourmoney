// Regression coverage for the confirmed web bug: neither the iOS branch
// (isOpen defaults to Platform.OS === 'ios', so false elsewhere) nor the
// Android branch (its trigger Pressable is gated on Platform.OS ===
// 'android') applies on web, and @react-native-community/datetimepicker's
// platform-less fallback renders null on web — so the picker never opened
// at all. Overrides Platform.OS directly (the established pattern in this
// codebase — see features/settings/hooks/useTheme.test.tsx's identical
// technique), restoring it in afterEach so later tests/files see the real
// platform again.
import { afterEach, describe, expect, it, jest } from '@jest/globals'
import { fireEvent, render } from '@testing-library/react-native'
import { Platform } from 'react-native'
import { DatePickerField } from './DatePickerField'

describe('DatePickerField', () => {
  afterEach(() => {
    Object.defineProperty(Platform, 'OS', { value: 'ios', configurable: true })
  })

  describe('on web', () => {
    it('renders an interactive date input, prefilled with the current value, that the user can actually change', async () => {
      Object.defineProperty(Platform, 'OS', { value: 'web', configurable: true })
      const onChange = jest.fn()

      const { getByLabelText } = await render(
        <DatePickerField label="תאריך הבא" value="2026-08-13" onChange={onChange} />
      )

      const field = getByLabelText('תאריך הבא')
      expect(field.props.type).toBe('date')
      expect(field.props.value).toBe('2026-08-13')

      await fireEvent(field, 'change', { target: { value: '2026-09-01' } })
      expect(onChange).toHaveBeenCalledWith('2026-09-01')
    })

    it('does not render the Android tap-to-open trigger on web (no button role — the browser owns the picker UI)', async () => {
      Object.defineProperty(Platform, 'OS', { value: 'web', configurable: true })

      const { queryByRole } = await render(
        <DatePickerField label="תאריך הבא" value="2026-08-13" onChange={jest.fn()} />
      )

      expect(queryByRole('button')).toBeNull()
    })
  })

  describe('on iOS', () => {
    it('does not render the web <input>, unaffected by the web fix', async () => {
      Object.defineProperty(Platform, 'OS', { value: 'ios', configurable: true })

      const { queryByLabelText } = await render(
        <DatePickerField label="תאריך הבא" value="2026-08-13" onChange={jest.fn()} />
      )

      // Neither the Android trigger (gated on 'android') nor the web <input>
      // (gated on 'web') set an aria-label/accessibilityLabel on iOS.
      expect(queryByLabelText('תאריך הבא')).toBeNull()
    })
  })

  describe('on Android', () => {
    it('still shows the tap-to-open trigger by default, not the web <input>, unaffected by the web fix', async () => {
      Object.defineProperty(Platform, 'OS', { value: 'android', configurable: true })

      const { getByRole, getByLabelText } = await render(
        <DatePickerField label="תאריך הבא" value="2026-08-13" onChange={jest.fn()} />
      )

      expect(getByRole('button', { name: 'תאריך הבא' })).toBeTruthy()
      // The Android trigger also carries this accessibilityLabel — confirm
      // the element found by label is that Pressable trigger, not the
      // web-only <input type="date"> (which has no `type` prop of its own
      // here: a Pressable never sets one).
      expect(getByLabelText('תאריך הבא').props.type).toBeUndefined()
    })
  })
})
