// Release-readiness pass: sign-in and forgot-password both disable their
// submit button until every field is non-empty; this screen had no such
// gate, so its button looked identical whether the form was empty or
// filled in. First test coverage for any (auth) screen.
import { describe, expect, it, jest } from '@jest/globals'
import { fireEvent, render } from '@testing-library/react-native'
import SignUp from './sign-up'
import '@/i18n'

jest.mock('expo-router', () => {
  const { Text: RNText } = jest.requireActual<typeof import('react-native')>('react-native')
  return {
    Link: ({ children }: { children: React.ReactNode }) => <RNText>{children}</RNText>,
  }
})

const mockSignUpMutate = jest.fn()
jest.mock('@/features/auth/hooks/useSignUp', () => ({
  useSignUp: () => ({ mutate: mockSignUpMutate, isPending: false, isError: false, isSuccess: false, error: null }),
}))

describe('SignUp', () => {
  it('disables the submit button until every field has something in it, matching sign-in/forgot-password', async () => {
    const { getByLabelText, getByRole } = await render(<SignUp />)

    expect(getByRole('button', { name: 'הרשמה' }).props.accessibilityState.disabled).toBe(true)

    await fireEvent.changeText(getByLabelText('שם תצוגה'), 'נועם')
    await fireEvent.changeText(getByLabelText('אימייל'), 'noam@example.com')
    await fireEvent.changeText(getByLabelText('סיסמה'), 'password123')
    await fireEvent.changeText(getByLabelText('אימות סיסמה'), 'password123')

    expect(getByRole('button', { name: 'הרשמה' }).props.accessibilityState.disabled).toBe(false)
  })

  it('does not call the mutation while any field is still empty', async () => {
    const { getByLabelText, getByRole } = await render(<SignUp />)

    await fireEvent.changeText(getByLabelText('שם תצוגה'), 'נועם')
    await fireEvent.press(getByRole('button', { name: 'הרשמה' }))

    expect(mockSignUpMutate).not.toHaveBeenCalled()
  })
})
