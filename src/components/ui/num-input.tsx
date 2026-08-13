import * as React from 'react'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { ChevronUp, ChevronDown, Minus, Plus } from 'lucide-react'
import { cn } from '@/lib/utils'

// Press-and-hold auto-repeat. `bind(fn)` returns pointer handlers for a button:
// one immediate call, then repeat every 70ms after a 350ms hold, until pointer
// up / leave / cancel / unmount. Shared by the NumInput steppers AND callers
// that drive their own arrow buttons (e.g. the label position nudger), so both
// feel identical.
export function useHoldRepeat() {
  const ref = React.useRef<{ t?: ReturnType<typeof setTimeout>; i?: ReturnType<typeof setInterval> }>({})
  const stop = React.useCallback(() => {
    if (ref.current.t) clearTimeout(ref.current.t)
    if (ref.current.i) clearInterval(ref.current.i)
    ref.current = {}
  }, [])
  React.useEffect(() => stop, [stop])
  return React.useCallback((fn: () => void) => ({
    onPointerDown: () => { stop(); fn(); ref.current.t = setTimeout(() => { ref.current.i = setInterval(fn, 70) }, 350) },
    onPointerUp: stop,
    onPointerLeave: stop,
    onPointerCancel: stop,
  }), [stop])
}

// Number input with a local string buffer — fixes the "can't delete the 0"
// problem that controlled `value={number}` inputs have. Strategy: hold the
// in-flight text locally so the user can clear / type freely; only commit a
// real number to parent state. On blur, snap back to the parent's last good
// value if the buffer is empty/invalid (keeps state consistent on focus loss).
export function NumInput({
  value, onChange, stepper, className, ...rest
}: {
  value: number
  onChange: (n: number) => void
  // `stepper` overlays step buttons inside the field; they step by the `step`
  // prop (default 1), clamped to min/max. Two layouts:
  //   true      — stacked chevrons ▲▼ on the right. Compact; for fine tuning a
  //               value the user mostly types (font size, margins).
  //   'split'   — big − / + on the LEFT and RIGHT of a centred value. Use where
  //               ±1 is the main interaction and typing is the fallback (qty
  //               columns), e.g. the POS adjust-stock rows.
  stepper?: boolean | 'split'
} & Omit<React.ComponentProps<typeof Input>, 'value' | 'onChange' | 'type'>) {
  const [text, setText] = React.useState(String(value))
  const [focused, setFocused] = React.useState(false)
  React.useEffect(() => {
    if (!focused) setText(String(value))
  }, [value, focused])

  const stepN = rest.step != null ? Number(rest.step) : 1
  const minN  = rest.min  != null ? Number(rest.min)  : -Infinity
  const maxN  = rest.max  != null ? Number(rest.max)  :  Infinity
  // Latest value in a ref so the press-and-hold interval (below) reads the
  // current value each tick instead of the stale one captured when it started.
  const valueRef = React.useRef(value)
  valueRef.current = value
  // Step by ±step, clamped, rounded to kill float drift (0.1 steps → 1.2000001).
  const bump = (dir: 1 | -1) => {
    const base = Number.isFinite(valueRef.current) ? valueRef.current : 0
    const n = Math.min(maxN, Math.max(minN, Math.round((base + dir * stepN) * 1000) / 1000))
    setText(String(n))
    if (n !== valueRef.current) onChange(n)
  }

  const bindHold = useHoldRepeat()

  const input = (
    <Input
      type="number"
      variant={rest.variant ?? 'elevated'}
      {...rest}
      className={
        stepper === 'split' ? cn('w-full px-7 text-center', className)
        : stepper           ? cn('w-full pr-6', className)
        : className
      }
      value={text}
      onFocus={e => { setFocused(true); rest.onFocus?.(e) }}
      onChange={e => {
        const v = e.target.value
        setText(v)
        if (v === '' || v === '-') return
        const n = Number(v)
        if (!Number.isNaN(n)) onChange(n)
      }}
      onBlur={e => {
        setFocused(false)
        if (text === '' || text === '-' || Number.isNaN(Number(text))) {
          setText(String(value))
        }
        rest.onBlur?.(e)
      }}
    />
  )

  if (!stepper) return input

  // − / + flanking the value. `inset-y-1` sizes both buttons to the field height
  // minus the 4px inset, so the pair reads as one control at any field height.
  if (stepper === 'split') {
    return (
      <div className={cn('relative', className)}>
        {input}
        <Button type="button" variant="ghost" size="icon-xs" tabIndex={-1} disabled={rest.disabled}
          className="absolute inset-y-1 left-1 h-auto w-6 min-h-0 rounded-sm px-0 text-muted-foreground hover:text-foreground"
          {...bindHold(() => bump(-1))}
          tooltip="ลด">
          <Minus />
        </Button>
        <Button type="button" variant="ghost" size="icon-xs" tabIndex={-1} disabled={rest.disabled}
          className="absolute inset-y-1 right-1 h-auto w-6 min-h-0 rounded-sm px-0 text-muted-foreground hover:text-foreground"
          {...bindHold(() => bump(1))}
          tooltip="เพิ่ม">
          <Plus />
        </Button>
      </div>
    )
  }

  return (
    <div className={cn('relative', className)}>
      {input}
      <div className="absolute inset-y-1 right-1 flex flex-col justify-center">
        <Button type="button" variant="ghost" size="icon-xs" tabIndex={-1} disabled={rest.disabled}
          className="h-1/2 w-5 min-h-0 rounded-sm px-0 text-muted-foreground hover:text-foreground"
          {...bindHold(() => bump(1))}
          tooltip="เพิ่ม">
          <ChevronUp />
        </Button>
        <Button type="button" variant="ghost" size="icon-xs" tabIndex={-1} disabled={rest.disabled}
          className="h-1/2 w-5 min-h-0 rounded-sm px-0 text-muted-foreground hover:text-foreground"
          {...bindHold(() => bump(-1))}
          tooltip="ลด">
          <ChevronDown />
        </Button>
      </div>
    </div>
  )
}
