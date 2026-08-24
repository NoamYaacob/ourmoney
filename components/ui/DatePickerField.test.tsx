// Product-quality pass: web no longer renders a raw `<input type="date">`
// (whose calendar POPUP was unstylable native browser chrome, visibly
// unrelated to the rest of the app — see this component's own header
// comment). It now renders a themed trigger + a real in-design-system
// calendar popover, following the exact same pattern
// components/ui/Select.tsx already uses. These tests cover the new shape;
// the platform-branching coverage (Android trigger, iOS native picker
// untouched) is unchanged from before.
import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals'
import { fireEvent, render, waitFor } from '@testing-library/react-native'
import { Platform } from 'react-native'
import { DatePickerField } from './DatePickerField'
// Side-effect import: initializes the real i18next singleton this
// component's own useTranslation() reads from — without this, react-
// i18next has no initialized instance in this test file's module registry
// and falls back to rendering raw translation keys. Same pattern every
// other test asserting on real Hebrew copy already uses (e.g.
// features/cashflow/components/MobileCashFlow.test.tsx).
import '@/i18n'

const mockUseColorScheme = jest.fn<() => { colorScheme: 'light' | 'dark' }>()
jest.mock('nativewind', () => ({
  useColorScheme: () => mockUseColorScheme(),
}))

describe('DatePickerField', () => {
  beforeEach(() => {
    mockUseColorScheme.mockReturnValue({ colorScheme: 'light' })
  })

  afterEach(() => {
    Object.defineProperty(Platform, 'OS', { value: 'ios', configurable: true })
  })

  describe('on web', () => {
    beforeEach(() => {
      Object.defineProperty(Platform, 'OS', { value: 'web', configurable: true })
    })

    it('shows the current value on a labeled trigger, formatted the same way every other date in this app renders (DD.MM.YYYY)', async () => {
      const { getByLabelText } = await render(
        <DatePickerField label="תאריך הבא" value="2026-08-13" onChange={jest.fn()} />
      )

      const trigger = getByLabelText('תאריך הבא')
      expect(trigger.props.accessibilityValue).toEqual({ text: '2026-08-13' })
      expect(getByLabelText('תאריך הבא')).toBeTruthy()
      const { getByText } = await render(
        <DatePickerField label="תאריך הבא" value="2026-08-13" onChange={jest.fn()} />
      )
      expect(getByText('13.08.2026')).toBeTruthy()
    })

    it('opens a real calendar popover on press, showing the visible month and the selected day', async () => {
      const { getByLabelText, getByText } = await render(
        <DatePickerField label="תאריך הבא" value="2026-08-13" onChange={jest.fn()} />
      )

      fireEvent.press(getByLabelText('תאריך הבא'))

      await waitFor(() => {
        expect(getByText('אוגוסט 2026')).toBeTruthy()
      })
      const selectedDay = getByLabelText(/13 באוגוסט 2026/)
      expect(selectedDay.props.accessibilityState).toEqual({ selected: true })
    })

    it('selecting a day calls onChange with that exact date and closes the popover', async () => {
      const onChange = jest.fn()
      const { getByLabelText, queryByText } = await render(
        <DatePickerField label="תאריך הבא" value="2026-08-13" onChange={onChange} />
      )

      fireEvent.press(getByLabelText('תאריך הבא'))
      await waitFor(() => expect(queryByText('אוגוסט 2026')).toBeTruthy())

      fireEvent.press(getByLabelText(/20 באוגוסט 2026/))

      expect(onChange).toHaveBeenCalledWith('2026-08-20')
      await waitFor(() => expect(queryByText('אוגוסט 2026')).toBeNull())
    })

    it('the month stepper moves the visible month without changing the selected value', async () => {
      const onChange = jest.fn()
      const { getByLabelText, getByText, queryByText } = await render(
        <DatePickerField label="תאריך הבא" value="2026-08-13" onChange={onChange} />
      )

      fireEvent.press(getByLabelText('תאריך הבא'))
      await waitFor(() => expect(getByText('אוגוסט 2026')).toBeTruthy())

      fireEvent.press(getByLabelText('חודש הבא'))
      await waitFor(() => expect(getByText('ספטמבר 2026')).toBeTruthy())
      expect(queryByText('אוגוסט 2026')).toBeNull()
      expect(onChange).not.toHaveBeenCalled()

      fireEvent.press(getByLabelText('חודש קודם'))
      await waitFor(() => expect(getByText('אוגוסט 2026')).toBeTruthy())
    })

    it('the "today" shortcut selects today\'s date and closes', async () => {
      const onChange = jest.fn()
      const { getByLabelText, getByText, queryByText } = await render(
        <DatePickerField label="תאריך הבא" value="2026-08-13" onChange={onChange} />
      )

      fireEvent.press(getByLabelText('תאריך הבא'))
      await waitFor(() => expect(getByText('אוגוסט 2026')).toBeTruthy())

      fireEvent.press(getByText('היום'))

      expect(onChange).toHaveBeenCalledTimes(1)
      const [calledWith] = onChange.mock.calls[0] as [string]
      expect(calledWith).toMatch(/^\d{4}-\d{2}-\d{2}$/)
      await waitFor(() => expect(queryByText('אוגוסט 2026')).toBeNull())
    })
  })

  describe('on iOS', () => {
    it('does not render the web trigger, unaffected by the web calendar', async () => {
      Object.defineProperty(Platform, 'OS', { value: 'ios', configurable: true })

      const { queryByLabelText } = await render(
        <DatePickerField label="תאריך הבא" value="2026-08-13" onChange={jest.fn()} />
      )

      expect(queryByLabelText('תאריך הבא')).toBeNull()
    })
  })

  describe('on Android', () => {
    it('still shows the tap-to-open trigger by default, not the web calendar, unaffected by the web fix', async () => {
      Object.defineProperty(Platform, 'OS', { value: 'android', configurable: true })

      const { getByRole, getByLabelText } = await render(
        <DatePickerField label="תאריך הבא" value="2026-08-13" onChange={jest.fn()} />
      )

      expect(getByRole('button', { name: 'תאריך הבא' })).toBeTruthy()
      expect(getByLabelText('תאריך הבא').props.type).toBeUndefined()
    })
  })
})
