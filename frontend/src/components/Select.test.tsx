import { fireEvent, render, screen } from '@testing-library/react'
import { useState } from 'react'
import { describe, expect, it, vi } from 'vitest'
import Select from './Select'

const OPTIONS = [
  { value: 1, label: 'Phần 1' },
  { value: 2, label: 'Phần 2' },
  { value: 3, label: 'Đặc biệt' },
]

function Harness({ onEscape }: { onEscape: () => void }) {
  const [value, setValue] = useState(1)
  return (
    <div onKeyDown={(e) => e.key === 'Escape' && onEscape()}>
      <Select value={value} options={OPTIONS} onChange={setValue} aria-label="Season" />
    </div>
  )
}

describe('Select', () => {
  it('picks with the keyboard, and Escape closes only the menu', () => {
    const onEscape = vi.fn()
    render(<Harness onEscape={onEscape} />)
    const button = screen.getByRole('combobox', { name: 'Season' })
    expect(button.textContent).toBe('Phần 1')

    fireEvent.keyDown(button, { key: 'ArrowDown' }) // opens on the selected option
    expect(screen.getByRole('option', { name: 'Phần 1' }).getAttribute('aria-selected')).toBe('true')
    fireEvent.keyDown(button, { key: 'ArrowDown' })
    fireEvent.keyDown(button, { key: 'Enter' })
    expect(button.textContent).toBe('Phần 2')
    expect(screen.queryByRole('listbox')).toBeNull()

    fireEvent.keyDown(button, { key: 'Enter' })
    fireEvent.keyDown(button, { key: 'đ' }) // type-ahead
    expect(button.getAttribute('aria-activedescendant')).toBe(screen.getByRole('option', { name: 'Đặc biệt' }).id)
    fireEvent.keyDown(button, { key: 'Escape' })
    expect(screen.queryByRole('listbox')).toBeNull()
    expect(onEscape).not.toHaveBeenCalled()
    expect(button.textContent).toBe('Phần 2')

    fireEvent.keyDown(button, { key: 'Escape' }) // menu already closed: the page gets it
    expect(onEscape).toHaveBeenCalledOnce()
  })

  it('closes on a click outside', () => {
    render(<Harness onEscape={() => {}} />)
    fireEvent.click(screen.getByRole('combobox'))
    expect(screen.getAllByRole('option')).toHaveLength(3)
    fireEvent.mouseDown(document.body)
    expect(screen.queryByRole('listbox')).toBeNull()
  })
})
