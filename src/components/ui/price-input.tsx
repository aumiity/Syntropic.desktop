import * as React from 'react'
import { Input } from './input'
import { cn } from '@/lib/utils'

interface PriceInputProps extends Omit<React.ComponentProps<'input'>, 'type' | 'value' | 'onChange'> {
  value: string | number | undefined | null
  onChange: (value: string) => void
  /** Decimal places for placeholder + step. Default 2 (currency). */
  decimals?: number
}

// Number input tuned for currency/price fields. Defaults: text-right,,
// min=0, step="0.01", placeholder="0.00". On blur, an empty/NaN value normalizes
// to "0" so the field never reads as a confusing blank after the user clears it.
const PriceInput = React.forwardRef<HTMLInputElement, PriceInputProps>(
  ({ className, value, onChange, decimals = 2, onBlur, placeholder, ...props }, ref) => {
    const fallback = (0).toFixed(decimals)
    const handleBlur = (e: React.FocusEvent<HTMLInputElement>) => {
      const v = e.target.value
      if (v === '' || Number.isNaN(parseFloat(v))) onChange('0')
      onBlur?.(e)
    }
    const step = decimals > 0 ? `0.${'0'.repeat(Math.max(decimals - 1, 0))}1` : '1'
    return (
      <Input
        ref={ref}
        type="number"
        value={value ?? ''}
        onChange={e => onChange(e.target.value)}
        onBlur={handleBlur}
        placeholder={placeholder ?? fallback}
        min={0}
        step={step}
        className={cn('text-right', className)}
        {...props}
      />
    )
  }
)
PriceInput.displayName = 'PriceInput'

export { PriceInput }
