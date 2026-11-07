import { useEffect, useId, useLayoutEffect, useRef, useState, type KeyboardEvent, type ReactNode } from 'react'
import { CheckIcon, ChevronDownIcon } from './icons'

export interface SelectOption<T> {
  value: T
  label: string
}

interface Props<T> {
  value: T
  options: SelectOption<T>[]
  onChange: (value: T) => void
  'aria-label'?: string
  'aria-labelledby'?: string
  title?: string
  disabled?: boolean
  /** Shown before the selected label (e.g. a globe for the language picker). */
  icon?: ReactNode
  /** Which edge of the trigger the menu lines up with. */
  align?: 'start' | 'end'
  /** Sizes and places the whole control; the trigger fills it. */
  className?: string
  /** Colors of the trigger, to match the surface it sits on. */
  triggerClassName?: string
}

const MENU_MAX_HEIGHT = 288 // max-h-72

/**
 * A dropdown in the look of the shadcn/ui Select, built here, with the same corner radius as the app's buttons: a button that opens a listbox.
 * Keyboard: arrows / Home / End move, Enter or Space picks, Escape or Tab closes, typing a letter jumps to an option.
 * Focus stays on the button while the menu is open (aria-activedescendant), so the page's own Escape handlers
 * (modals, dialogs) only run once the menu is closed.
 */
export default function Select<T extends string | number | null>({
  value,
  options,
  onChange,
  disabled = false,
  icon,
  align = 'start',
  className = '',
  triggerClassName = 'border-white/25 bg-black/50 hover:border-white/60',
  title,
  ...aria
}: Props<T>) {
  const id = useId()
  const rootRef = useRef<HTMLDivElement>(null)
  const listRef = useRef<HTMLUListElement>(null)
  const [open, setOpen] = useState(false)
  const [active, setActive] = useState(0)
  const [upward, setUpward] = useState(false)
  const selectedIndex = Math.max(
    0,
    options.findIndex((o) => o.value === value),
  )
  const selected = options[selectedIndex]

  const show = (index = selectedIndex) => {
    if (disabled) return
    // Open upwards when the menu would not fit below the button but does above it.
    const rect = rootRef.current?.getBoundingClientRect()
    if (rect) {
      const below = window.innerHeight - rect.bottom
      setUpward(below < Math.min(MENU_MAX_HEIGHT, options.length * 36 + 10) && rect.top > below)
    }
    setActive(index)
    setOpen(true)
  }

  const pick = (index: number) => {
    setOpen(false)
    const option = options[index]
    if (option && option.value !== value) onChange(option.value)
  }

  // Close on a press outside the control.
  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [open])

  // Keep the highlighted option in view in a long list. Scrolls the list only (scrollIntoView would also scroll
  // the page or the modal around it).
  useLayoutEffect(() => {
    const list = listRef.current
    const item = list?.children[active] as HTMLElement | undefined
    if (!list || !item) return
    if (item.offsetTop < list.scrollTop) list.scrollTop = item.offsetTop
    else if (item.offsetTop + item.offsetHeight > list.scrollTop + list.clientHeight)
      list.scrollTop = item.offsetTop + item.offsetHeight - list.clientHeight
  }, [open, active])

  const onKeyDown = (e: KeyboardEvent<HTMLButtonElement>) => {
    const last = options.length - 1
    if (!open) {
      if (['ArrowDown', 'ArrowUp', 'Enter', ' '].includes(e.key)) {
        e.preventDefault()
        show()
      }
      return
    }

    const move = (index: number) => {
      e.preventDefault()
      setActive(Math.min(last, Math.max(0, index)))
    }
    switch (e.key) {
      case 'ArrowDown':
        return move(active + 1)
      case 'ArrowUp':
        return move(active - 1)
      case 'Home':
      case 'PageUp':
        return move(0)
      case 'End':
      case 'PageDown':
        return move(last)
      case 'Enter':
      case ' ':
        e.preventDefault()
        return pick(active)
      case 'Escape':
        e.preventDefault()
        e.stopPropagation() // close the menu only, not the dialog it sits in
        e.nativeEvent.stopImmediatePropagation()
        return setOpen(false)
      case 'Tab':
        return setOpen(false)
      default:
        if (e.key.length === 1 && /\S/.test(e.key)) {
          // Type-ahead: the next option starting with that letter, wrapping around.
          const key = e.key.toLocaleLowerCase()
          for (let step = 1; step <= options.length; step++) {
            const index = (active + step) % options.length
            if (options[index].label.toLocaleLowerCase().startsWith(key)) return move(index)
          }
        }
    }
  }

  return (
    <div ref={rootRef} className={`relative inline-block ${className}`}>
      <button
        type="button"
        role="combobox"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={`${id}-list`}
        aria-activedescendant={open ? `${id}-${active}` : undefined}
        {...aria}
        title={title}
        disabled={disabled}
        onClick={() => (open ? setOpen(false) : show())}
        onKeyDown={onKeyDown}
        className={`flex w-full items-center gap-2 rounded border py-2 pr-2.5 pl-3 text-left text-sm whitespace-nowrap text-white shadow-sm outline-none transition-colors focus-visible:ring-2 focus-visible:ring-white/70 disabled:cursor-wait disabled:opacity-60 ${
          open ? 'border-white/60' : ''
        } ${triggerClassName}`}
      >
        {icon}
        <span className="flex-1 truncate">{selected?.label}</span>
        <ChevronDownIcon className={`size-4 shrink-0 opacity-60 transition-transform duration-200 ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <ul
          ref={listRef}
          id={`${id}-list`}
          role="listbox"
          aria-label={aria['aria-label']}
          aria-labelledby={aria['aria-labelledby']}
          tabIndex={-1}
          className={`select-in absolute z-50 max-h-72 min-w-full overflow-y-auto rounded border border-white/15 bg-neutral-900 p-1 shadow-xl shadow-black/60 ${
            align === 'end' ? 'right-0' : 'left-0'
          } ${upward ? 'bottom-full mb-1 origin-bottom' : 'top-full mt-1 origin-top'}`}
        >
          {options.map((option, index) => {
            const isSelected = index === selectedIndex
            return (
              <li
                key={String(option.value)}
                id={`${id}-${index}`}
                role="option"
                aria-selected={isSelected}
                onMouseEnter={() => setActive(index)}
                onMouseDown={(e) => e.preventDefault()} // keep focus on the button
                onClick={() => pick(index)}
                className={`flex cursor-pointer items-center gap-6 rounded-sm py-1.5 pr-2 pl-2.5 text-sm whitespace-nowrap select-none ${
                  index === active ? 'bg-white/10 text-white' : 'text-white/80'
                }`}
              >
                <span className="flex-1">{option.label}</span>
                <CheckIcon className={`size-4 shrink-0 ${isSelected ? '' : 'invisible'}`} />
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
