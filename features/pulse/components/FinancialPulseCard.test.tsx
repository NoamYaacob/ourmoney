import { describe, expect, it } from '@jest/globals'
import { render } from '@testing-library/react-native'
import i18n from '@/i18n'
import { formatILS } from '@/lib/money/format'
import type { FinancialPulseResult } from '@/lib/engines/pulse/computeFinancialPulse'
import { FinancialPulseCard } from './FinancialPulseCard'

describe('FinancialPulseCard', () => {
  it('renders nothing when pulse is null — no permanent empty container', async () => {
    const { toJSON } = await render(<FinancialPulseCard pulse={null} />)
    expect(toJSON()).toBeNull()
  })

  it('renders the "less available" headline for a negative delta, with the magnitude as a positive number', async () => {
    const pulse: FinancialPulseResult = {
      safeToSpendDeltaAgorot: -62000,
      previousSafeToSpendAgorot: 200450,
      currentSafeToSpendAgorot: 138450,
      hasPrimaryChange: true,
      cause: null,
      secondaryItems: [],
    }
    const { getByText, queryByText } = await render(<FinancialPulseCard pulse={pulse} />)
    expect(getByText(i18n.t('home.pulse.less', { amount: formatILS(62000) }))).toBeTruthy()
    // Never shown with a leading minus sign — direction is carried by
    // "less," not by the number itself.
    expect(queryByText(`-${formatILS(62000)}`)).toBeNull()
    expect(getByText(i18n.t('home.pulse.sinceLastTime'))).toBeTruthy()
  })

  it('renders no headline for a nonzero but sub-threshold delta — gates on hasPrimaryChange, not on delta !== 0 (CP8E correction)', async () => {
    const pulse: FinancialPulseResult = {
      safeToSpendDeltaAgorot: -499,
      previousSafeToSpendAgorot: 500000,
      currentSafeToSpendAgorot: 499501,
      hasPrimaryChange: false,
      cause: null,
      secondaryItems: [],
    }
    const { queryByText } = await render(<FinancialPulseCard pulse={pulse} />)
    expect(queryByText(i18n.t('home.pulse.less', { amount: formatILS(499) }))).toBeNull()
    expect(queryByText(i18n.t('home.pulse.sinceLastTime'))).toBeNull()
  })

  it('renders the "more available" headline for a positive delta', async () => {
    const pulse: FinancialPulseResult = {
      safeToSpendDeltaAgorot: 40000,
      previousSafeToSpendAgorot: 290000,
      currentSafeToSpendAgorot: 330000,
      hasPrimaryChange: true,
      cause: null,
      secondaryItems: [],
    }
    const { getByText } = await render(<FinancialPulseCard pulse={pulse} />)
    expect(getByText(i18n.t('home.pulse.more', { amount: formatILS(40000) }))).toBeTruthy()
  })

  it('renders no headline when the delta is exactly zero but a secondary item justifies rendering', async () => {
    const pulse: FinancialPulseResult = {
      safeToSpendDeltaAgorot: 0,
      previousSafeToSpendAgorot: 500000,
      currentSafeToSpendAgorot: 500000,
      hasPrimaryChange: false,
      cause: null,
      secondaryItems: [{ kind: 'recurring_price_increase', description: 'Netflix', increaseAgorot: 900 }],
    }
    const { queryByText, getByText } = await render(<FinancialPulseCard pulse={pulse} />)
    expect(queryByText(i18n.t('home.pulse.sinceLastTime'))).toBeNull()
    expect(getByText(i18n.t('home.pulse.secondaryPriceIncrease', { description: 'Netflix', amount: formatILS(900) }))).toBeTruthy()
  })

  it('renders the named-transaction cause line with the real description and amount', async () => {
    const pulse: FinancialPulseResult = {
      safeToSpendDeltaAgorot: -184000,
      previousSafeToSpendAgorot: 491800,
      currentSafeToSpendAgorot: 307800,
      hasPrimaryChange: true,
      cause: { kind: 'transaction', description: 'חיוב אשראי', amountAgorot: -184000 },
      secondaryItems: [],
    }
    const { getByText } = await render(<FinancialPulseCard pulse={pulse} />)
    expect(
      getByText(i18n.t('home.pulse.causeTransaction', { description: 'חיוב אשראי', amount: formatILS(184000) }))
    ).toBeTruthy()
  })

  it('renders the transaction cause line in correlation-safe wording — never asserts causation (CP8E correction)', async () => {
    const pulse: FinancialPulseResult = {
      safeToSpendDeltaAgorot: -184000,
      previousSafeToSpendAgorot: 491800,
      currentSafeToSpendAgorot: 307800,
      hasPrimaryChange: true,
      cause: { kind: 'transaction', description: 'תיקון מזגן', amountAgorot: -184000 },
      secondaryItems: [],
    }
    const { getByText } = await render(<FinancialPulseCard pulse={pulse} />)
    const rendered = getByText(i18n.t('home.pulse.causeTransaction', { description: 'תיקון מזגן', amount: formatILS(184000) }))
    expect(rendered).toBeTruthy()
    // Preserves the real transaction amount and description...
    expect(rendered.props.children).toEqual(expect.stringContaining('תיקון מזגן'))
    expect(rendered.props.children).toEqual(expect.stringContaining(formatILS(184000)))
    // ...but never claims it caused the delta.
    expect(rendered.props.children).not.toEqual(expect.stringContaining('הסיבה העיקרית'))
  })

  it('renders the generic cause line when the engine could not prove a specific cause', async () => {
    const pulse: FinancialPulseResult = {
      safeToSpendDeltaAgorot: -62000,
      previousSafeToSpendAgorot: 200450,
      currentSafeToSpendAgorot: 138450,
      hasPrimaryChange: true,
      cause: { kind: 'generic' },
      secondaryItems: [],
    }
    const { getByText } = await render(<FinancialPulseCard pulse={pulse} />)
    expect(getByText(i18n.t('home.pulse.causeGeneric'))).toBeTruthy()
  })

  // RRR P1 finding #4 regression coverage: computeFinancialPulse.ts's own
  // resolveCause() returns { kind: 'generic' } for three different
  // underlying truths — zero new expense transactions since the previous
  // snapshot (the delta can come from a forecast/obligation/recurring-
  // template change with NO transaction involved at all — see that file's
  // own header comment), multiple new expenses (something spent, but not
  // attributable to one), or a lone expense whose size doesn't plausibly
  // explain the delta. The copy shown for all three must therefore never
  // assert that any charge was actually recorded — that claim is simply
  // false in the zero-transactions case, which is a real, documented,
  // expected path, not an edge case being defended against speculatively.
  it('the generic cause line never asserts that charges were recorded, since it also covers the zero-new-transactions case (P1-4)', async () => {
    const pulse: FinancialPulseResult = {
      safeToSpendDeltaAgorot: -62000,
      previousSafeToSpendAgorot: 200450,
      currentSafeToSpendAgorot: 138450,
      hasPrimaryChange: true,
      cause: { kind: 'generic' },
      secondaryItems: [],
    }
    const { getByText } = await render(<FinancialPulseCard pulse={pulse} />)
    const rendered = getByText(i18n.t('home.pulse.causeGeneric'))
    expect(rendered.props.children).not.toEqual(expect.stringMatching(/נרשמ(ו|ה) חיוב/))
  })

  it('renders up to two secondary items, each its own line', async () => {
    const pulse: FinancialPulseResult = {
      safeToSpendDeltaAgorot: -1000,
      previousSafeToSpendAgorot: 501000,
      currentSafeToSpendAgorot: 500000,
      hasPrimaryChange: true,
      cause: { kind: 'generic' },
      secondaryItems: [
        { kind: 'recurring_price_increase', description: 'Netflix', increaseAgorot: 900 },
        { kind: 'recurring_price_increase', description: 'Spotify', increaseAgorot: 500 },
      ],
    }
    const { getByText } = await render(<FinancialPulseCard pulse={pulse} />)
    expect(getByText(i18n.t('home.pulse.secondaryPriceIncrease', { description: 'Netflix', amount: formatILS(900) }))).toBeTruthy()
    expect(getByText(i18n.t('home.pulse.secondaryPriceIncrease', { description: 'Spotify', amount: formatILS(500) }))).toBeTruthy()
  })

  it('carries an accessible summary label regardless of which content branch renders', async () => {
    const pulse: FinancialPulseResult = {
      safeToSpendDeltaAgorot: -62000,
      previousSafeToSpendAgorot: 200450,
      currentSafeToSpendAgorot: 138450,
      hasPrimaryChange: true,
      cause: null,
      secondaryItems: [],
    }
    const { getByLabelText } = await render(<FinancialPulseCard pulse={pulse} />)
    expect(getByLabelText(i18n.t('home.pulse.sectionLabel'))).toBeTruthy()
  })

  it('applies a caller-supplied className override (DesktopDashboard uses its own tabletLg spacing)', async () => {
    const pulse: FinancialPulseResult = {
      safeToSpendDeltaAgorot: -1000,
      previousSafeToSpendAgorot: 501000,
      currentSafeToSpendAgorot: 500000,
      hasPrimaryChange: true,
      cause: null,
      secondaryItems: [],
    }
    const { getByLabelText } = await render(<FinancialPulseCard pulse={pulse} className="web:tabletLg:mt-5" />)
    expect((getByLabelText(i18n.t('home.pulse.sectionLabel')).props.className as string)).toContain('web:tabletLg:mt-5')
  })
})
