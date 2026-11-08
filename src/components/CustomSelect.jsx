import { useEffect, useRef, useState } from 'react'
import { Check, ChevronDown } from 'lucide-react'

export default function CustomSelect({
  value,
  defaultValue = '',
  onChange,
  options = [],
  name,
  className = '',
  ariaLabel,
  disabled = false,
}) {
  const [open, setOpen] = useState(false)
  const [internalValue, setInternalValue] = useState(defaultValue)
  const dropdownRef = useRef(null)

  const currentValue = value !== undefined ? value : internalValue
  const selected = options.find(option => option.value === currentValue) || options[0]

  useEffect(() => {
    function handleOutsideClick(event) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setOpen(false)
      }
    }

    function handleEscape(event) {
      if (event.key === 'Escape') setOpen(false)
    }

    document.addEventListener('mousedown', handleOutsideClick)
    document.addEventListener('keydown', handleEscape)

    return () => {
      document.removeEventListener('mousedown', handleOutsideClick)
      document.removeEventListener('keydown', handleEscape)
    }
  }, [])

  return (
    <div className={`qorvexa-select ${className}`} ref={dropdownRef}>
      {name && <input type="hidden" name={name} value={currentValue} />}

      <button
        type="button"
        className="qorvexa-select-trigger"
        aria-label={ariaLabel}
        aria-haspopup="listbox"
        aria-expanded={open}
        disabled={disabled}
        onClick={() => setOpen(current => !current)}
      >
        <span>{selected?.label ?? 'Select an option'}</span>
        <ChevronDown size={15} className={open ? 'is-open' : ''} />
      </button>

      {open && (
        <div className="qorvexa-select-menu" role="listbox" aria-label={ariaLabel}>
          {options.map(option => {
            const isSelected = option.value === currentValue

            return (
              <button
                key={option.value}
                type="button"
                role="option"
                aria-selected={isSelected}
                title={option.description || option.label}
                className={`qorvexa-select-option${isSelected ? ' is-selected' : ''}`}
                onClick={() => {
                  if (value === undefined) setInternalValue(option.value)
                  onChange?.(option.value)
                  setOpen(false)
                }}
              >
                <span>{option.label}</span>
                {isSelected && <Check size={15} />}
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}
