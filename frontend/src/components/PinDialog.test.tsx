import { fireEvent, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { renderWithStore } from '../test/render'
import { PinPrompt } from './PinDialog'

function pinInput() {
  return screen.getByLabelText('Mã PIN 4 số') as HTMLInputElement
}

describe('PinPrompt', () => {
  it('submits by itself on the fourth digit', () => {
    const onSubmit = vi.fn()
    renderWithStore(<PinPrompt profileName="Bố" error={null} busy={false} onSubmit={onSubmit} onClose={() => {}} />)

    fireEvent.change(pinInput(), { target: { value: '123' } })
    expect(onSubmit).not.toHaveBeenCalled()

    fireEvent.change(pinInput(), { target: { value: '1234' } })
    expect(onSubmit).toHaveBeenCalledWith('1234')
  })

  it('keeps digits only, at most four', () => {
    renderWithStore(<PinPrompt profileName="Bố" error={null} busy={false} onSubmit={() => {}} onClose={() => {}} />)
    fireEvent.change(pinInput(), { target: { value: '1a2b-3' } })
    expect(pinInput().value).toBe('123')
  })

  it('clears the boxes and shows the reason after a failed attempt', () => {
    const props = { profileName: 'Bố', busy: false, onSubmit: () => {}, onClose: () => {} }
    const { rerender } = renderWithStore(<PinPrompt {...props} error={null} />)
    fireEvent.change(pinInput(), { target: { value: '12' } })

    rerender(<PinPrompt {...props} error="Mã PIN không đúng." />)

    expect(pinInput().value).toBe('')
    expect(screen.getByRole('alert').textContent).toBe('Mã PIN không đúng.')
  })

  it('closes on Escape', () => {
    const onClose = vi.fn()
    renderWithStore(<PinPrompt profileName="Bố" error={null} busy={false} onSubmit={() => {}} onClose={onClose} />)
    fireEvent.keyDown(window, { key: 'Escape' })
    expect(onClose).toHaveBeenCalled()
  })
})
