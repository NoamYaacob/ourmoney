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

  // Responsive/desktop pass: on a wide desktop browser this dialog should
  // read as a centered ~560px panel, not stretch edge to edge — `web:`
  // scoped, so native mobile's full-width dialog is untouched.
  it('caps the dialog to a centered width on web, via the shared dialog-width token', async () => {
    const { getByRole } = await render(
      <Modal
        visible
        title="מחיקת חשבון"
        confirmLabel="מחיקה"
        cancelLabel="ביטול"
        onConfirm={jest.fn()}
        onCancel={jest.fn()}
      />
    )
    const className = getByRole('alert').parent?.props.className as string
    expect(className).toContain('web:max-w-[560px]')
    expect(className).toContain('web:self-center')
  })
})
