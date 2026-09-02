// Visual QA pass: this test originally asserted `className.toContain(
// 'web:flex-row')` after a real-browser measurement reportedly found
// "previous month" on the physical left on web — but that assertion is
// satisfied by BOTH `web:flex-row` and `web:flex-row` (the former
// is a literal substring of the latter), so it proved nothing either way.
// A follow-up "fix" (adding `web:flex-row`) turned out to be wrong
// in the other direction: global.css sets `direction: rtl` on `html, body,
// #root`, and flexbox's `row` axis runs along that direction — plain
// `flex-row` already mirrors correctly here, and `-reverse` flips it a
// second time. Verified directly via a throwaway route + real-browser
// measurement (MonthNavigator.tsx's own header comment has the details),
// not re-assumed from the older comments this codebase still carries
// elsewhere from before global.css's `direction: rtl` existed. This
// asserts the actual correct, verified state: no reversal class at all.
import { describe, expect, it, jest } from '@jest/globals'
import { render } from '@testing-library/react-native'
import '@/i18n'
import { MonthNavigator } from './MonthNavigator'

jest.mock('@expo/vector-icons', () => ({
  Ionicons: () => null,
}))

describe('MonthNavigator', () => {
  it('does not reverse the prev/next row — global.css direction:rtl already mirrors plain flex-row', async () => {
    const { getByLabelText } = await render(
      <MonthNavigator periodStart="2026-08-01" onChange={jest.fn()} />,
    )

    const row = getByLabelText('חודש קודם').parent
    const tokens = (row?.props.className as string).split(/\s+/)
    expect(tokens).toContain('flex-row')
    expect(tokens).not.toContain('web:flex-row')
    expect(tokens).not.toContain('flex-row-reverse')
  })
})
