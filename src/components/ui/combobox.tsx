import * as React from "react"
import { Search, ChevronDown, Check, type LucideIcon } from "lucide-react"

import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  Popover,
  PopoverTrigger,
  PopoverContent,
} from "@/components/ui/popover"

export interface ComboboxProps<T> {
  items: T[]
  /** Currently selected item, or null when nothing / the "empty" row is chosen. */
  value: T | null
  onChange: (item: T | null) => void
  getKey: (item: T) => string | number
  getLabel: (item: T) => string
  getSublabel?: (item: T) => string | undefined
  /** Custom filter. Default: case-insensitive match on label + sublabel. */
  filterFn?: (item: T, query: string) => boolean
  /** Trigger text when nothing is selected. */
  placeholder?: string
  searchPlaceholder?: string
  /** Leading icon shown in the trigger and on every row. */
  icon?: LucideIcon
  /**
   * When set, a row representing "no selection" (value = null) is rendered at
   * the top while the search box is empty — e.g. "ทุกผู้จัดจำหน่าย" for a filter.
   */
  emptyLabel?: string
  emptyText?: string
  disabled?: boolean
  /** Sizes the trigger Button (height, width). */
  triggerClassName?: string
  /**
   * Visual style for the trigger Button.
   * - `default` (current): outline when empty, primary-soft when a value is selected.
   * - `elevated`: matches the filter-strip controls (DateRangePicker / SearchInput
   *   variant="elevated") — white card + shadow regardless of selection state.
   */
  variant?: 'default' | 'elevated'
}

export function Combobox<T>({
  items,
  value,
  onChange,
  getKey,
  getLabel,
  getSublabel,
  filterFn,
  placeholder = "— เลือก —",
  searchPlaceholder = "พิมพ์เพื่อค้นหา...",
  icon: Icon,
  emptyLabel,
  emptyText = "ไม่พบรายการ",
  disabled,
  triggerClassName,
  variant = 'default',
}: ComboboxProps<T>) {
  const [open, setOpen] = React.useState(false)
  const [query, setQuery] = React.useState("")
  const [highlight, setHighlight] = React.useState(0)
  const activeRowRef = React.useRef<HTMLButtonElement>(null)

  const defaultFilter = React.useCallback(
    (item: T, q: string) => {
      const lc = q.toLowerCase()
      const sub = getSublabel?.(item) ?? ""
      return (
        getLabel(item).toLowerCase().includes(lc) ||
        sub.toLowerCase().includes(lc)
      )
    },
    [getLabel, getSublabel]
  )

  const filtered = React.useMemo(() => {
    const q = query.trim()
    if (!q) return items
    const fn = filterFn ?? defaultFilter
    return items.filter((it) => fn(it, q))
  }, [items, query, filterFn, defaultFilter])

  // The empty row only shows while the search box is untouched.
  const showEmptyRow = !!emptyLabel && !query.trim()
  // Flat navigable list: index 0 = empty row (when shown), then filtered items.
  const navCount = filtered.length + (showEmptyRow ? 1 : 0)

  React.useEffect(() => {
    setHighlight(0)
  }, [query])

  React.useEffect(() => {
    activeRowRef.current?.scrollIntoView({ block: "nearest" })
  }, [highlight])

  const reset = () => {
    setQuery("")
    setHighlight(0)
  }

  const commit = (item: T | null) => {
    onChange(item)
    setOpen(false)
    reset()
  }

  const selectByNavIndex = (idx: number) => {
    if (showEmptyRow && idx === 0) {
      commit(null)
      return
    }
    const item = filtered[showEmptyRow ? idx - 1 : idx]
    if (item) commit(item)
  }

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") {
      e.preventDefault()
      setHighlight((h) => Math.min(h + 1, navCount - 1))
    } else if (e.key === "ArrowUp") {
      e.preventDefault()
      setHighlight((h) => Math.max(h - 1, 0))
    } else if (e.key === "Enter") {
      e.preventDefault()
      selectByNavIndex(highlight)
    }
  }

  const selectedKey = value != null ? getKey(value) : null
  const triggerLabel = value != null ? getLabel(value) : emptyLabel ?? placeholder
  const hasValue = value != null

  return (
    <Popover
      open={open}
      onOpenChange={(o) => {
        setOpen(o)
        if (!o) reset()
      }}
    >
      <PopoverTrigger asChild>
        <Button
          type="button"
          disabled={disabled}
          variant={variant === 'elevated' ? 'elevated' : (hasValue ? 'primary-soft' : 'outline')}
          className={cn(
            "h-8 w-full justify-between gap-2 px-3 rounded-md text-sm font-normal",
            triggerClassName
          )}
        >
          <span className="flex items-center gap-2 min-w-0">
            {Icon ? <Icon className="size-4 shrink-0 opacity-70" /> : null}
            <span
              className={cn(
                "truncate",
                !hasValue && "text-foreground-subtle"
              )}
            >
              {triggerLabel}
            </span>
          </span>
          <ChevronDown className="size-3.5 shrink-0 opacity-60 transition-transform group-data-[state=open]:rotate-180" />
        </Button>
      </PopoverTrigger>

      <PopoverContent
        align="start"
        sideOffset={6}
        className="w-[var(--radix-popover-trigger-width)] p-0 gap-0"
        onOpenAutoFocus={(e) => {
          // Let the search input grab focus instead of the first row.
          e.preventDefault()
        }}
      >
        <div className="flex items-center gap-2 px-2.5 pt-2.5 pb-2">
          <Search className="size-4 shrink-0 text-foreground-subtle" />
          <Input
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={onKeyDown}
            placeholder={searchPlaceholder}
            className="h-8 border-0 bg-transparent px-0 shadow-none focus:ring-0"
            autoComplete="off"
          />
        </div>

        <div
          className="max-h-72 overflow-y-auto scrollbar-thin px-1.5 pb-1.5"
          // When this popover is portaled out of a Dialog, the Dialog's
          // react-remove-scroll adds a document-level (bubble) wheel/touch
          // listener that preventDefaults scrolling on anything outside the
          // dialog — including this list. Stop the event from bubbling to
          // document so the list scrolls natively. Harmless outside a dialog.
          onWheel={(e) => e.stopPropagation()}
          onTouchMove={(e) => e.stopPropagation()}
        >
          {showEmptyRow ? (
            (() => {
              const active = highlight === 0
              const isSelected = !hasValue
              return (
                <button
                  type="button"
                  ref={active ? activeRowRef : undefined}
                  onClick={() => commit(null)}
                  className={cn(
                    "group flex w-full items-center gap-2.5 rounded-md px-2.5 py-1.5 text-left transition-colors",
                    active
                      ? "bg-primary-soft"
                      : "hover:bg-primary-soft/60",
                    isSelected && "text-primary"
                  )}
                >
                  {Icon ? (
                    <Icon
                      className={cn(
                        "size-4 shrink-0",
                        isSelected
                          ? "text-primary"
                          : "text-foreground-subtle"
                      )}
                    />
                  ) : null}
                  <span className="min-w-0 flex-1 truncate text-sm">
                    {emptyLabel}
                  </span>
                  {isSelected ? (
                    <Check className="size-4 shrink-0 text-primary" />
                  ) : null}
                </button>
              )
            })()
          ) : null}

          {filtered.length === 0 ? (
            <div className="py-6 text-center text-sm text-foreground-subtle">
              {emptyText}
            </div>
          ) : (
            filtered.map((item, i) => {
              const navIdx = showEmptyRow ? i + 1 : i
              const active = navIdx === highlight
              const isSelected =
                selectedKey != null && getKey(item) === selectedKey
              const sub = getSublabel?.(item)
              return (
                <button
                  key={getKey(item)}
                  type="button"
                  ref={active ? activeRowRef : undefined}
                  onClick={() => commit(item)}
                  className={cn(
                    "group flex w-full items-center gap-2.5 rounded-md px-2.5 py-1.5 text-left transition-colors",
                    active ? "bg-primary-soft" : "hover:bg-primary-soft/60",
                    isSelected && "text-primary"
                  )}
                >
                  {Icon ? (
                    <Icon
                      className={cn(
                        "size-4 shrink-0",
                        isSelected ? "text-primary" : "text-foreground-subtle"
                      )}
                    />
                  ) : null}
                  <span className="flex min-w-0 flex-1 items-baseline gap-2">
                    <span className="truncate text-sm">
                      {getLabel(item)}
                    </span>
                    {sub ? (
                      <span className="shrink-0 text-sm text-foreground-subtle">
                        {sub}
                      </span>
                    ) : null}
                  </span>
                  {isSelected ? (
                    <Check className="size-4 shrink-0 text-primary" />
                  ) : null}
                </button>
              )
            })
          )}
        </div>
      </PopoverContent>
    </Popover>
  )
}
