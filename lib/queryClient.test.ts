import { describe, expect, it, jest } from '@jest/globals'

// Uses require(), not dynamic import() — this Jest environment (Babel/
// jest-expo, no --experimental-vm-modules) doesn't support dynamic import()
// in test files. require() after jest.resetModules()/jest.doMock() is the
// standard Jest pattern for re-importing a module under different mocked
// dependencies within one test file.

describe('queryClient focusManager wiring', () => {
  it('wires focusManager to AppState on native and forwards active/background', () => {
    jest.resetModules()
    let nativeListener: ((state: string) => void) | undefined
    const removeMock = jest.fn()

    jest.doMock('react-native', () => ({
      Platform: { OS: 'ios' },
      AppState: {
        addEventListener: jest.fn((_event: string, listener: (state: string) => void) => {
          nativeListener = listener
          return { remove: removeMock }
        }),
      },
    }))

    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { focusManager } = require('@tanstack/react-query')
    const setEventListenerSpy = jest.spyOn(focusManager, 'setEventListener')

    // eslint-disable-next-line @typescript-eslint/no-require-imports
    require('./queryClient')

    expect(setEventListenerSpy).toHaveBeenCalledTimes(1)
    expect(nativeListener).toBeDefined()

    const ourCallback = setEventListenerSpy.mock.calls[0]![0] as (
      handleFocus: (focused: boolean) => void
    ) => (() => void) | undefined
    const handleFocus = jest.fn()
    const unsubscribe = ourCallback(handleFocus)

    nativeListener?.('active')
    expect(handleFocus).toHaveBeenLastCalledWith(true)

    nativeListener?.('background')
    expect(handleFocus).toHaveBeenLastCalledWith(false)

    unsubscribe?.()
    expect(removeMock).toHaveBeenCalled()

    setEventListenerSpy.mockRestore()
    jest.dontMock('react-native')
  })

  it('does not wire focusManager on web', () => {
    jest.resetModules()
    jest.doMock('react-native', () => ({
      Platform: { OS: 'web' },
      AppState: { addEventListener: jest.fn() },
    }))

    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { focusManager } = require('@tanstack/react-query')
    const setEventListenerSpy = jest.spyOn(focusManager, 'setEventListener')

    // eslint-disable-next-line @typescript-eslint/no-require-imports
    require('./queryClient')

    expect(setEventListenerSpy).not.toHaveBeenCalled()

    setEventListenerSpy.mockRestore()
    jest.dontMock('react-native')
  })
})
