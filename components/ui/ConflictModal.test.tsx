import { describe, expect, it, jest } from '@jest/globals'
import { fireEvent, render } from '@testing-library/react-native'
import '@/i18n'
import { ConflictModal } from './ConflictModal'

describe('ConflictModal', () => {
  it('shows the conflict copy and reload/cancel actions for kind="conflict"', async () => {
    const { getByText } = await render(
      <ConflictModal visible kind="conflict" onReload={jest.fn()} onCancel={jest.fn()} />
    )
    expect(getByText('כבר בוצע שינוי בפריט הזה ממכשיר או משתמש אחר.')).toBeTruthy()
    expect(getByText('טען את הגרסה החדשה')).toBeTruthy()
    expect(getByText('ביטול')).toBeTruthy()
  })

  it('shows the not-found copy for kind="not_found"', async () => {
    const { getByText } = await render(
      <ConflictModal visible kind="not_found" onReload={jest.fn()} onCancel={jest.fn()} />
    )
    expect(getByText('הפריט הזה נמחק או שאינו זמין יותר.')).toBeTruthy()
  })

  it('calls onReload, never onCancel, when the reload action is pressed — no auto-merge, no auto-retry, just an explicit user choice', async () => {
    const onReload = jest.fn()
    const onCancel = jest.fn()
    const { getByText } = await render(
      <ConflictModal visible kind="conflict" onReload={onReload} onCancel={onCancel} />
    )
    await fireEvent.press(getByText('טען את הגרסה החדשה'))
    expect(onReload).toHaveBeenCalledTimes(1)
    expect(onCancel).not.toHaveBeenCalled()
  })
})
