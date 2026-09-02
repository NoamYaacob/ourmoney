import { describe, expect, it, jest } from '@jest/globals'
import { render } from '@testing-library/react-native'
import { InstallmentTrack } from './InstallmentTrack'

jest.mock('nativewind', () => ({ useColorScheme: () => ({ colorScheme: 'light' }) }))

describe('InstallmentTrack', () => {
  it('draws one pill per instalment', async () => {
    const { getByTestId } = await render(
      <InstallmentTrack paidCount={5} totalCount={12} accessibilityLabel="progress" />
    )
    expect(getByTestId('installment-track', { includeHiddenElements: true }).children).toHaveLength(12)
  })

  it('announces the count, not a percentage — a plan is countable', async () => {
    const { getByTestId } = await render(
      <InstallmentTrack paidCount={5} totalCount={12} accessibilityLabel="progress" />
    )
    expect(getByTestId('installment-track', { includeHiddenElements: true }).props.accessibilityValue).toEqual({ min: 0, max: 12, now: 5 })
  })

  it('collapses to a single fill past the point pills stay legible', async () => {
    const { getByTestId } = await render(
      <InstallmentTrack paidCount={5} totalCount={36} accessibilityLabel="progress" />
    )
    expect(getByTestId('installment-track', { includeHiddenElements: true }).children).toHaveLength(1)
    expect(getByTestId('installment-track', { includeHiddenElements: true }).props.accessibilityValue).toEqual({ min: 0, max: 36, now: 5 })
  })

  it('clamps a paid count that runs past the plan', async () => {
    const { getByTestId } = await render(
      <InstallmentTrack paidCount={99} totalCount={12} accessibilityLabel="progress" />
    )
    expect(getByTestId('installment-track', { includeHiddenElements: true }).props.accessibilityValue.now).toBe(12)
  })

  it('survives a zero-instalment plan without dividing by zero', async () => {
    await expect(
      render(<InstallmentTrack paidCount={0} totalCount={0} accessibilityLabel="progress" />)
    ).resolves.toBeTruthy()
  })
})
