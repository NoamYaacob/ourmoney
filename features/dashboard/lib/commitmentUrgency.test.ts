import { describe, expect, it } from '@jest/globals'
import { commitmentUrgency, greetingKey } from './commitmentUrgency'

const TODAY = '2026-08-22'

describe('commitmentUrgency', () => {
  it('reads an overdue charge as past due, however overdue it is', () => {
    expect(commitmentUrgency(TODAY, '2026-08-21')).toMatchObject({ labelKey: 'pastDue', tone: 'danger' })
    expect(commitmentUrgency(TODAY, '2026-01-01')).toMatchObject({ labelKey: 'pastDue', tone: 'danger' })
  })

  it('names today and tomorrow rather than counting them', () => {
    expect(commitmentUrgency(TODAY, TODAY)).toMatchObject({ labelKey: 'today', tone: 'danger' })
    expect(commitmentUrgency(TODAY, '2026-08-23')).toMatchObject({ labelKey: 'tomorrow', tone: 'danger' })
  })

  it('stays urgent through three days out, matching the alerts engine window', () => {
    expect(commitmentUrgency(TODAY, '2026-08-25')).toMatchObject({ tone: 'danger', labelKey: 'inDays', count: 3 })
    expect(commitmentUrgency(TODAY, '2026-08-26')).toMatchObject({ tone: 'warning', count: 4 })
  })

  it('drops to attention through a week, then to neutral', () => {
    expect(commitmentUrgency(TODAY, '2026-08-29')).toMatchObject({ tone: 'warning', count: 7 })
    expect(commitmentUrgency(TODAY, '2026-08-30')).toMatchObject({ tone: 'neutral', count: 8 })
  })

  it('always returns a word, never a tone alone', () => {
    // The accessibility guarantee this helper exists for: every urgency has
    // a label key, so no row can end up conveying urgency by color only.
    for (const date of ['2026-08-01', TODAY, '2026-08-23', '2026-08-25', '2026-09-30']) {
      expect(commitmentUrgency(TODAY, date).labelKey).toBeTruthy()
    }
  })

  it('counts across a month boundary', () => {
    expect(commitmentUrgency(TODAY, '2026-09-04')).toMatchObject({ daysUntil: 13, tone: 'neutral' })
  })
})

describe('greetingKey', () => {
  it('splits the day at noon and five', () => {
    expect(greetingKey(0)).toBe('morning')
    expect(greetingKey(11)).toBe('morning')
    expect(greetingKey(12)).toBe('afternoon')
    expect(greetingKey(16)).toBe('afternoon')
    expect(greetingKey(17)).toBe('evening')
    expect(greetingKey(23)).toBe('evening')
  })
})
