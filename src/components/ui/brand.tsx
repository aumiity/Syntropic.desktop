import * as React from 'react'
import { cn } from '@/lib/utils'
import { LogoMark } from '@/components/ui/logo-mark'

// Brand identity primitives — the Syntropic leaf logomark ([[LogoMark]]) + the
// "Rx Desktop" wordmark (Syntropic = company, Rx Desktop = product), and the
// gradient "brand panel" used on the gateway screens (Setup wizard, Login).
// Kept here (not in a page) so both screens render the exact same brand.
//
// tone:
//   'light' — sits on the teal brand panel / dark surfaces → white logo + text
//   'dark'  — sits on a normal light surface → primary (teal) logo + foreground text

type BrandTone = 'light' | 'dark'

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
      <LogoMark
        className={cn(
          'shrink-0',
          lg ? 'size-14' : 'size-12',
          tone === 'light' ? 'text-primary-foreground' : 'text-primary',
        )}
      />
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

// The bare leaf logomark for centered hero use — e.g. the Login screen. Defaults
// to primary (teal); size it with a size-N class. Centred via mx-auto.
export function BrandLogo({ className }: { className?: string }) {
  return <LogoMark className={cn('mx-auto text-primary', className)} />
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
