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

type BrandSize = 'sm' | 'md' | 'lg'

const BRAND_SIZES: Record<BrandSize, { logo: string; word: string }> = {
  sm: { logo: 'size-10', word: 'text-lg' },
  md: { logo: 'size-12', word: 'text-xl' },
  lg: { logo: 'size-14', word: 'text-2xl' },
}

// The logo lockup: leaf mark + "Rx Desktop" wordmark (+ optional tagline).
// orientation 'horizontal' (mark beside text) or 'vertical' (mark above, centred).
export function BrandMark({
  tone = 'dark',
  tagline,
  size = 'md',
  orientation = 'horizontal',
  className,
}: {
  tone?: BrandTone
  tagline?: string
  size?: BrandSize
  orientation?: 'horizontal' | 'vertical'
  className?: string
}) {
  const s = BRAND_SIZES[size]
  const vertical = orientation === 'vertical'
  return (
    <div className={cn('flex', vertical ? 'flex-col items-center text-center gap-2.5' : 'items-center gap-2', className)}>
      <LogoMark
        className={cn('shrink-0', s.logo, tone === 'light' ? 'text-primary-foreground' : 'text-primary')}
      />
      <div className="leading-tight">
        <div
          className={cn(
            'font-brand font-bold tracking-tight',
            s.word,
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
