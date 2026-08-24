import { describe, expect, it } from '@jest/globals'
import { render } from '@testing-library/react-native'
import { CommitmentTimeline } from './CommitmentTimeline'

describe('CommitmentTimeline', () => {
  it('renders nothing for an empty list — no bare line with no dots on it', async () => {
    const { toJSON } = await render(<CommitmentTimeline items={[]} />)
    expect(toJSON()).toBeNull()
  })

  it('renders one short DD.MM date label per commitment, in the design’s no-year form', async () => {
    const { getByText } = await render(
      <CommitmentTimeline
        items={[
          { id: 'a', date: '2026-08-28', daysUntil: 4, tone: 'warning' },
          { id: 'b', date: '2026-09-04', daysUntil: 11, tone: 'neutral' },
        ]}
      />
    )

    expect(getByText('28.08')).toBeTruthy()
    expect(getByText('04.09')).toBeTruthy()
  })

  it('clamps a commitment beyond the 14-day window to the far edge rather than off the line', async () => {
    // A regression for the one arithmetic mistake this component could make
    // silently: an unclamped days-out figure would push `right` past 100%,
    // which renders off the card with no visible failure in a snapshot.
    const { getByText } = await render(
      <CommitmentTimeline items={[{ id: 'far', date: '2026-10-15', daysUntil: 52, tone: 'neutral' }]} />
    )

    expect(getByText('15.10')).toBeTruthy()
  })
})
