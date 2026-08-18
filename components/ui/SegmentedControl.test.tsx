// Desktop/RTL polish pass (real-browser regression): the option row was a
// plain flex-row, which native auto-mirrors via Yoga under the forced-RTL
// flag but NativeWind's web-compiled CSS does not — a headless-browser
// measurement found the first-listed option (e.g. expense, or Settings'
// "system" appearance choice) rendering on the physical left on web,
// instead of the right as RTL convention dictates. Affects Add
// Transaction's expense/income and shared/personal controls, and
// Settings' appearance picker (shared component).
import { describe, expect, it, jest } from '@jest/globals'
import { render } from '@testing-library/react-native'
import { SegmentedControl } from './SegmentedControl'

describe('SegmentedControl', () => {
  it('reverses the option row on web so the first-listed option renders on the right', async () => {
    const { getByLabelText } = await render(
      <SegmentedControl
        options={[
          { value: 'expense', label: 'הוצאה' },
          { value: 'income', label: 'הכנסה' },
        ]}
        value="expense"
        onChange={jest.fn()}
        accessibilityLabel="type"
      />,
    )

    const container = getByLabelText('type')
    expect(container.props.className as string).toContain('web:flex-row-reverse')
  })
})
