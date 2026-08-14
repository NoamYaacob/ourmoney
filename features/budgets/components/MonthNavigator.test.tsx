// Desktop/RTL polish pass (real-browser regression): the prev/next row was
// a plain flex-row, which native auto-mirrors via Yoga under the
// forced-RTL flag but NativeWind's web-compiled CSS does not — a headless-
// browser measurement found "previous month" rendering on the physical
// left on web (should be right, matching native and RTL calendar
// convention). Guards the actual fix, not just "some row exists".
import { describe, expect, it, jest } from '@jest/globals'
import { render } from '@testing-library/react-native'
import '@/i18n'
import { MonthNavigator } from './MonthNavigator'

jest.mock('@expo/vector-icons', () => ({
  Ionicons: () => null,
}))

describe('MonthNavigator', () => {
  it('reverses the prev/next row on web so "previous month" renders on the right', async () => {
    const { getByLabelText } = await render(
      <MonthNavigator periodStart="2026-08-01" onChange={jest.fn()} />,
    )

    const row = getByLabelText('חודש קודם').parent
    expect(row?.props.className as string).toContain('web:flex-row-reverse')
  })
})
