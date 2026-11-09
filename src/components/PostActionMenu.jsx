import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Link } from 'react-router-dom'
import { MoreHorizontal } from 'lucide-react'

export default function PostActionMenu({ items = [], buttonAriaLabel = 'More post options' }) {
  const [isOpen, setIsOpen] = useState(false)
  const [position, setPosition] = useState({ top: 0, left: 0 })
  const triggerRef = useRef(null)
  const menuRef = useRef(null)

  const updatePosition = () => {
    if (!triggerRef.current) return
    const trigger = triggerRef.current.getBoundingClientRect()
    const menu = menuRef.current
    const menuWidth = menu?.offsetWidth || 190
    const menuHeight = menu?.offsetHeight || 160
    const margin = 10
    const gap = 6

    const idealLeft = trigger.right - menuWidth
    const maxLeft = Math.max(margin, window.innerWidth - menuWidth - margin)
    const left = Math.min(Math.max(margin, idealLeft), maxLeft)

    let top = trigger.bottom + gap
    if (top + menuHeight > window.innerHeight - margin) {
      if (trigger.top - menuHeight - gap >= margin) {
        top = trigger.top - menuHeight - gap
      } else {
        top = Math.max(margin, window.innerHeight - menuHeight - margin)
      }
    }

    setPosition({ top, left })
  }

  const handleToggle = (e) => {
    e.stopPropagation()
    setIsOpen((prev) => !prev)
  }

  useLayoutEffect(() => {
    if (isOpen) {
      updatePosition()
    }
  }, [isOpen])

  useEffect(() => {
    if (!isOpen) return

    const focusTimer = setTimeout(() => {
      const firstItem = menuRef.current?.querySelector('button:not(:disabled), a')
      firstItem?.focus()
    }, 10)

    function handlePointerDown(e) {
      if (
        menuRef.current && !menuRef.current.contains(e.target) &&
        triggerRef.current && !triggerRef.current.contains(e.target)
      ) {
        setIsOpen(false)
      }
    }

    function handleKeyDown(e) {
      if (e.key === 'Escape') {
        e.stopPropagation()
        setIsOpen(false)
        triggerRef.current?.focus()
      }
    }

    function handleScroll(e) {
      if (menuRef.current && menuRef.current.contains(e.target)) return
      setIsOpen(false)
    }

    function handleResize() {
      setIsOpen(false)
    }

    document.addEventListener('pointerdown', handlePointerDown)
    document.addEventListener('keydown', handleKeyDown)
    window.addEventListener('scroll', handleScroll, { passive: true, capture: true })
    window.addEventListener('resize', handleResize)

    return () => {
      clearTimeout(focusTimer)
      document.removeEventListener('pointerdown', handlePointerDown)
      document.removeEventListener('keydown', handleKeyDown)
      window.removeEventListener('scroll', handleScroll, { capture: true })
      window.removeEventListener('resize', handleResize)
    }
  }, [isOpen])

  const handleMenuKeyDown = (e) => {
    const focusable = menuRef.current?.querySelectorAll('button:not(:disabled), a')
    if (!focusable || focusable.length === 0) return

    const itemsArr = Array.from(focusable)
    const currentIndex = itemsArr.indexOf(document.activeElement)

    if (e.key === 'ArrowDown') {
      e.preventDefault()
      const nextIndex = (currentIndex + 1) % itemsArr.length
      itemsArr[nextIndex]?.focus()
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      const prevIndex = (currentIndex - 1 + itemsArr.length) % itemsArr.length
      itemsArr[prevIndex]?.focus()
    } else if (e.key === 'Home') {
      e.preventDefault()
      itemsArr[0]?.focus()
    } else if (e.key === 'End') {
      e.preventDefault()
      itemsArr[itemsArr.length - 1]?.focus()
    }
  }

  const visibleItems = items.filter(Boolean)
  if (visibleItems.length === 0) return null

  return (
    <div className="post-action-menu-container">
      <button
        ref={triggerRef}
        type="button"
        className={`post-menu-trigger${isOpen ? ' is-active' : ''}`}
        onClick={handleToggle}
        aria-label={buttonAriaLabel}
        aria-haspopup="menu"
        aria-expanded={isOpen}
      >
        <MoreHorizontal size={18} aria-hidden="true" />
      </button>

      {isOpen &&
        createPortal(
          <div
            ref={menuRef}
            className="post-action-menu-dropdown"
            style={{
              top: `${position.top}px`,
              left: `${position.left}px`,
            }}
            role="menu"
            aria-label="Post actions"
            onKeyDown={handleMenuKeyDown}
          >
            {visibleItems.map((item, index) => {
              const Icon = item.icon
              const itemClassName = `post-action-menu-item${item.danger ? ' is-danger' : ''}${item.active ? ' is-active' : ''}`

              const handleClick = (e) => {
                if (item.disabled) {
                  e.preventDefault()
                  return
                }
                setIsOpen(false)
                if (item.onClick) item.onClick(e)
              }

              if (item.to) {
                return (
                  <Link
                    key={item.id || item.label || index}
                    to={item.to}
                    className={itemClassName}
                    role="menuitem"
                    tabIndex={0}
                    onClick={handleClick}
                  >
                    {Icon && <Icon size={15} aria-hidden="true" />}
                    <span>{item.label}</span>
                  </Link>
                )
              }

              return (
                <button
                  key={item.id || item.label || index}
                  type="button"
                  className={itemClassName}
                  role="menuitem"
                  tabIndex={0}
                  disabled={item.disabled}
                  onClick={handleClick}
                >
                  {Icon && <Icon size={15} aria-hidden="true" />}
                  <span>{item.label}</span>
                </button>
              )
            })}
          </div>,
          document.body
        )}
    </div>
  )
}
