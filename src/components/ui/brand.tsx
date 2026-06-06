import * as React from 'react'
import { cn } from '@/lib/utils'

// Brand identity primitives — the "Rx Desktop" logomark + wordmark (Syntropic =
// company), and the
// gradient "brand panel" used on the gateway screens (Setup wizard, Login).
// Kept here (not in a page) so both screens render the exact same brand.
//
// tone:
//   'light' — sits on the teal brand panel / dark surfaces → frosted tile + white text
//   'dark'  — sits on a normal light surface → solid teal tile + foreground text

type BrandTone = 'light' | 'dark'

// Placeholder logomark — the "Rx" prescription lettermark (serif italic).
// TODO: swap for the real logo asset when provided (only this tile changes).

export function BrandMark({
  tone = 'dark',
  tagline,
  size = 'md',
  className,
}: {
  tone?: BrandTone
  tagline?: string
  size?: 'md' | 'lg'
  className?: string
}) {
  const lg = size === 'lg'
  return (
    <div className={cn('flex items-center gap-3', className)}>
      <div
        className={cn(
          'relative flex items-center justify-center rounded-2xl shrink-0 shadow-sm',
          lg ? 'size-14' : 'size-12',
          tone === 'light'
            ? 'bg-primary-foreground/10 ring-1 ring-primary-foreground/20 text-primary-foreground'
            : 'bg-primary text-primary-foreground',
        )}
      >
        <span className={cn('font-serif font-bold italic leading-none', lg ? 'text-2xl' : 'text-xl')}>Rx</span>
        <span className="absolute -top-0.5 -right-0.5 size-2.5 rounded-full bg-accent" />
      </div>
      <div className="leading-tight">
        <div
          className={cn(
            'font-bold tracking-tight',
            lg ? 'text-2xl' : 'text-xl',
            tone === 'light' ? 'text-primary-foreground' : 'text-foreground',
          )}
        >
          Rx <span className="font-medium opacity-80">Desktop</span>
        </div>
        {tagline && (
          <div
            className={cn(
              'text-xs',
              tone === 'light' ? 'text-primary-foreground/70' : 'text-muted-foreground',
            )}
          >
            {tagline}
          </div>
        )}
      </div>
    </div>
  )
}

// The left brand rail for gateway screens. Hidden on narrow widths (the form
// then takes the full pane). Children render in the middle band (e.g. a Stepper).
export function BrandPanel({
  tagline,
  footer,
  children,
  className,
}: {
  tagline?: string
  footer?: React.ReactNode
  children?: React.ReactNode
  className?: string
}) {
  return (
    <div
      className={cn(
        'relative hidden md:flex flex-col justify-between overflow-hidden shrink-0',
        'w-[min(38%,21rem)] p-8',
        'bg-gradient-to-br from-primary to-primary-strong text-primary-foreground',
        className,
      )}
    >
      {/* decorative soft glows — purely visual */}
      <div aria-hidden="true" className="pointer-events-none absolute -top-24 -right-24 size-64 rounded-full bg-primary-foreground/5 blur-2xl" />
      <div aria-hidden="true" className="pointer-events-none absolute -bottom-32 -left-20 size-72 rounded-full bg-accent/10 blur-3xl" />

      <div className="relative space-y-10">
        <BrandMark tone="light" tagline={tagline} />
        {children}
      </div>

      <div className="relative text-xs text-primary-foreground/50">
        {footer ?? <>&copy; Syntropic</>}
      </div>
    </div>
  )
}
