// Presentation only: the strip navigates between three routes that still
// exist independently. What matters is that it says which one you are on and
// does not push a new history entry for a sibling.

import { beforeEach, describe, expect, it, jest } from '@jest/globals'
import { fireEvent, render } from '@testing-library/react-native'
import i18n from '@/i18n'
import { PlanningTabs } from './PlanningTabs'

const mockReplace = jest.fn()
const mockPush = jest.fn()
jest.mock('expo-router', () => ({ useRouter: () => ({ replace: mockReplace, push: mockPush }) }))
jest.mock('nativewind', () => ({ useColorScheme: () => ({ colorScheme: 'light' }) }))

beforeEach(() => {
  mockReplace.mockClear()
  mockPush.mockClear()
})

describe('PlanningTabs', () => {
  it('marks the current section as selected and the others as not', async () => {
    const { getByLabelText } = await render(<PlanningTabs active="recurring" />)

    expect(getByLabelText(i18n.t('settings.financial.recurring')).props.accessibilityState.selected).toBe(true)
    expect(getByLabelText(i18n.t('settings.financial.obligations')).props.accessibilityState.selected).toBe(false)
  })

  it('replaces rather than pushes — the three are siblings, not a stack', async () => {
    const { getByLabelText } = await render(<PlanningTabs active="obligations" />)

    fireEvent.press(getByLabelText(i18n.t('settings.financial.goals')))

    expect(mockReplace).toHaveBeenCalledWith('/goals')
    expect(mockPush).not.toHaveBeenCalled()
  })

  it('does nothing when the current tab is pressed', async () => {
    const { getByLabelText } = await render(<PlanningTabs active="goals" />)

    fireEvent.press(getByLabelText(i18n.t('settings.financial.goals')))

    expect(mockReplace).not.toHaveBeenCalled()
  })

  it('offers all three sections from any one of them', async () => {
    const { getByLabelText } = await render(<PlanningTabs active="goals" />)
    for (const key of ['obligations', 'recurring', 'goals'] as const) {
      expect(getByLabelText(i18n.t(`settings.financial.${key}`))).toBeTruthy()
    }
  })
})
