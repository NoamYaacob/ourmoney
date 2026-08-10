import { describe, expect, it } from '@jest/globals'
import { render } from '@testing-library/react-native'
import { Avatar, getInitials } from './Avatar'

describe('getInitials', () => {
  it('takes the first letter of the first two words, uppercased', () => {
    expect(getInitials('דנה כהן')).toBe('דכ')
  })

  it('falls back to a single initial for a one-word name', () => {
    expect(getInitials('דנה')).toBe('ד')
  })

  it('returns an empty string for an empty/whitespace-only name', () => {
    expect(getInitials('')).toBe('')
    expect(getInitials('   ')).toBe('')
  })

  it('collapses extra internal whitespace', () => {
    expect(getInitials('דנה   כהן')).toBe('דכ')
  })
})

describe('Avatar', () => {
  it('renders initials when no avatarUrl is given', async () => {
    const { getByText } = await render(<Avatar displayName="דנה כהן" />)
    expect(getByText('דכ')).toBeTruthy()
  })

  it('renders an image instead of initials when avatarUrl is given', async () => {
    const { queryByText } = await render(<Avatar displayName="דנה כהן" avatarUrl="https://example.com/a.png" />)
    expect(queryByText('דכ')).toBeNull()
  })
})
