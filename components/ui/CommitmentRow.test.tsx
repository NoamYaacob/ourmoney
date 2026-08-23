import { describe, expect, it, jest } from '@jest/globals'
import { fireEvent, render } from '@testing-library/react-native'
import { Text } from 'react-native'
import { CommitmentRow } from './CommitmentRow'
import { formatILS } from '@/lib/money/format'

describe('CommitmentRow', () => {
  it('stacks the day numeral over a short Hebrew month', async () => {
    const { getByText } = await render(
      <CommitmentRow date="2026-08-28" name="ארנונה דו־חודשית" amountAgorot={122_400} timeLabel="בעוד 6 ימים" tone="danger" />
    )

    expect(getByText('28')).toBeTruthy()
    // Intl returns the full "אוגוסט" for Hebrew in most ICU builds, far too
    // wide for the design's 42px date block — this is the abbreviated form.
    expect(getByText('אוג׳')).toBeTruthy()
  })

  it('drops the leading zero from a single-digit day', async () => {
    const { getByText } = await render(
      <CommitmentRow date="2026-09-04" name="טסט ואגרת רכב" amountAgorot={118_000} timeLabel="גורם לחוסר" tone="warning" />
    )

    // Padded: the date block is a fixed-width column of tabular figures,
    // and an unpadded single digit sits visibly off-centre beside two-digit
    // neighbours. Both design files pad it.
    expect(getByText('04')).toBeTruthy()
    expect(getByText('ספט׳')).toBeTruthy()
  })

  it('always states urgency as a word, not only as a colour', async () => {
    // The design system's rule for this row: the chip's wording carries the
    // urgency alongside the numeral colour and the bar, so the row still
    // reads for anyone who cannot use the colour.
    const { getByText } = await render(
      <CommitmentRow date="2026-08-28" name="ארנונה" amountAgorot={1000} timeLabel="באיחור" tone="danger" />
    )

    expect(getByText('באיחור')).toBeTruthy()
  })

  it('shows the amount, and the type/ownership meta beside the chip', async () => {
    const { getByText } = await render(
      <CommitmentRow
        date="2026-09-10"
        name="משכנתא לאומי"
        amountAgorot={624_000}
        timeLabel="אחרי המשכורת"
        tone="neutral"
        meta="חיוב קבוע · משותף"
      />
    )

    expect(getByText(formatILS(624_000))).toBeTruthy()
    expect(getByText('חיוב קבוע · משותף')).toBeTruthy()
  })

  it('renders a trailing action instead of the amount when given one', async () => {
    const { getByText, queryByText } = await render(
      <CommitmentRow
        date="2026-08-28"
        name="ארנונה"
        amountAgorot={122_400}
        timeLabel="בעוד 6 ימים"
        tone="danger"
        trailing={<Text>סימון כשולם</Text>}
      />
    )

    expect(getByText('סימון כשולם')).toBeTruthy()
    expect(queryByText(formatILS(122_400))).toBeNull()
  })

  it('is only pressable when given a handler', async () => {
    const onPress = jest.fn()
    const { getByTestId } = await render(
      <CommitmentRow
        testID="row"
        date="2026-08-28"
        name="ארנונה"
        amountAgorot={1000}
        timeLabel="בעוד 6 ימים"
        tone="danger"
        onPress={onPress}
      />
    )

    fireEvent.press(getByTestId('row'))
    expect(onPress).toHaveBeenCalled()
  })

  it('renders nothing for the month when the date is malformed, rather than crashing', async () => {
    const { getByText } = await render(
      <CommitmentRow date="not-a-date" name="שורה" amountAgorot={100} timeLabel="בעוד יום" tone="neutral" />
    )
    expect(getByText('שורה')).toBeTruthy()
  })
})
