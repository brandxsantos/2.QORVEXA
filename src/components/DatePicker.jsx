import { useEffect, useRef, useState } from 'react'
import { CalendarDays, ChevronLeft, ChevronRight } from 'lucide-react'

const months = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
]

const weekdays = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

function localToday() {
  const date = new Date()
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function parseDate(value) {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null
  const [year, month, day] = value.split('-').map(Number)
  const date = new Date(year, month - 1, day)
  if (
    date.getFullYear() !== year ||
    date.getMonth() !== month - 1 ||
    date.getDate() !== day
  ) return null
  return date
}

function formatDate(value) {
  const date = parseDate(value)
  if (!date) return ''
  return new Intl.DateTimeFormat('en-US', {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  }).format(date)
}

function toISO(year, month, day) {
  return `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`
}

export default function DatePicker({ name, value, onChange }) {
  const rootRef = useRef(null)
  const [internalValue, setInternalValue] = useState('')
  const [open, setOpen] = useState(false)

  const selectedValue = value === undefined ? internalValue : value
  const today = localToday()
  const selectedDate = parseDate(selectedValue)
  const initialDate = selectedDate || new Date()

  const [viewYear, setViewYear] = useState(initialDate.getFullYear())
  const [viewMonth, setViewMonth] = useState(initialDate.getMonth())

  useEffect(() => {
    function handlePointerDown(event) {
      if (rootRef.current && !rootRef.current.contains(event.target)) {
        setOpen(false)
      }
    }

    function handleKeyDown(event) {
      if (event.key === 'Escape') setOpen(false)
    }

    document.addEventListener('pointerdown', handlePointerDown)
    document.addEventListener('keydown', handleKeyDown)

    return () => {
      document.removeEventListener('pointerdown', handlePointerDown)
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [])

  function showCalendar() {
    const date = parseDate(selectedValue) || new Date()
    setViewYear(date.getFullYear())
    setViewMonth(date.getMonth())
    setOpen((current) => !current)
  }

  function changeMonth(offset) {
    const date = new Date(viewYear, viewMonth + offset, 1)
    setViewYear(date.getFullYear())
    setViewMonth(date.getMonth())
  }

  function selectDate(day) {
    const nextValue = toISO(viewYear, viewMonth, day)
    if (nextValue > today) return

    setInternalValue(nextValue)
    onChange?.(nextValue)
    setOpen(false)
  }

  function selectToday() {
    const date = new Date()
    setViewYear(date.getFullYear())
    setViewMonth(date.getMonth())
    setInternalValue(today)
    onChange?.(today)
    setOpen(false)
  }

  const firstWeekday = new Date(viewYear, viewMonth, 1).getDay()
  const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate()
  const years = Array.from(
    { length: new Date().getFullYear() - 1899 },
    (_, index) => new Date().getFullYear() - index,
  )

  return (
    <div className="q-date-picker" ref={rootRef}>
      {name && <input type="hidden" name={name} value={selectedValue || ''} />}

      <button
        type="button"
        className="q-date-trigger"
        onClick={showCalendar}
        aria-haspopup="dialog"
        aria-expanded={open}
      >
        <span className={selectedValue ? 'q-date-value' : 'q-date-placeholder'}>
          {selectedValue ? formatDate(selectedValue) : 'Select your birthdate'}
        </span>
        <CalendarDays size={19} aria-hidden="true" />
      </button>

      {open && (
        <div className="q-date-popover" role="dialog" aria-label="Choose birthdate">
          <div className="q-date-header">
            <button
              type="button"
              className="q-date-nav"
              onClick={() => changeMonth(-1)}
              aria-label="Previous month"
            >
              <ChevronLeft size={19} />
            </button>

            <div className="q-date-selectors">
              <select
                aria-label="Month"
                value={viewMonth}
                onChange={(event) => setViewMonth(Number(event.target.value))}
              >
                {months.map((month, index) => (
                  <option key={month} value={index}>{month}</option>
                ))}
              </select>

              <select
                aria-label="Year"
                value={viewYear}
                onChange={(event) => setViewYear(Number(event.target.value))}
              >
                {years.map((year) => (
                  <option key={year} value={year}>{year}</option>
                ))}
              </select>
            </div>

            <button
              type="button"
              className="q-date-nav"
              onClick={() => changeMonth(1)}
              disabled={toISO(viewYear, viewMonth + 1, 1) > today.slice(0, 7) + '-01'}
              aria-label="Next month"
            >
              <ChevronRight size={19} />
            </button>
          </div>

          <div className="q-date-grid">
            {weekdays.map((day) => (
              <span className="q-date-weekday" key={day}>{day}</span>
            ))}

            {Array.from({ length: firstWeekday }, (_, index) => (
              <span className="q-date-empty" key={`empty-${index}`} />
            ))}

            {Array.from({ length: daysInMonth }, (_, index) => {
              const day = index + 1
              const dateValue = toISO(viewYear, viewMonth, day)
              const isFuture = dateValue > today
              const isSelected = dateValue === selectedValue
              const isToday = dateValue === today

              return (
                <button
                  type="button"
                  key={dateValue}
                  className={[
                    'q-date-day',
                    isSelected ? 'is-selected' : '',
                    isToday ? 'is-today' : '',
                  ].filter(Boolean).join(' ')}
                  disabled={isFuture}
                  onClick={() => selectDate(day)}
                  aria-label={`${months[viewMonth]} ${day}, ${viewYear}`}
                  aria-pressed={isSelected}
                >
                  {day}
                </button>
              )
            })}
          </div>

          <div className="q-date-footer">
            <span>{selectedValue ? formatDate(selectedValue) : 'No date selected'}</span>
            <button type="button" onClick={selectToday}>Today</button>
          </div>
        </div>
      )}
    </div>
  )
}
