import { describe, expect, it, jest } from '@jest/globals'
import { render } from '@testing-library/react-native'
import { Modal } from './Modal'

describe('Modal', () => {
  it('announces its title as an alert when visible, for screen-reader users', async () => {
    const { getByRole } = await render(
      <Modal
        visible
        title="מחיקת חשבון"
        message="לא ניתן לשחזר פעולה זו."
        confirmLabel="מחיקה"
        cancelLabel="ביטול"
        onConfirm={jest.fn()}
        onCancel={jest.fn()}
        destructive
      />
    )
    const alert = getByRole('alert')
    expect(alert.props.children).toBe('מחיקת חשבון')
  })
})
