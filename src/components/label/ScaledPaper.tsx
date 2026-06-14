// ScaledPaper — fits a physical-size label preview inside whatever box it's
// given. The drug-label preview renders at its real paper size (mm), so a wide
// or tall sticker overflows a narrow preview column. This wrapper measures the
// available area, converts the label's mm dimensions to CSS px (96dpi, the same
// ratio the browser uses for `mm` units), and applies a uniform `scale()` so
// the WHOLE label is visible without ever overflowing — scaling DOWN only
// (never enlarges past 1:1). The scaled box reserves correct layout space so
// the preview stays centered.
import { useLayoutEffect, useRef, useState, type ReactNode } from 'react'

// 1mm = 96/25.4 px at the CSS reference resolution — the exact factor the
// browser applies to `Nmm` lengths on screen, so this px size matches the
// label's rendered footprint 1:1.
const MM_TO_PX = 96 / 25.4

interface Props {
  widthMm: number
  heightMm: number
  children: ReactNode
}

export function ScaledPaper({ widthMm, heightMm, children }: Props) {
  const ref = useRef<HTMLDivElement>(null)
  const [scale, setScale] = useState(1)

  const naturalW = Math.max(1, widthMm * MM_TO_PX)
  const naturalH = Math.max(1, heightMm * MM_TO_PX)

  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    const update = () => {
      const aw = el.clientWidth, ah = el.clientHeight
      if (!aw || !ah) return
      setScale(Math.min(1, aw / naturalW, ah / naturalH))
    }
    update()
    const ro = new ResizeObserver(update)
    ro.observe(el)
    return () => ro.disconnect()
  }, [naturalW, naturalH])

  return (
    <div ref={ref} className="flex h-full w-full items-center justify-center overflow-hidden">
      {/* Outer box reserves the scaled footprint (transform doesn't affect
          layout); inner box renders at natural size and is shrunk to fit. */}
      <div style={{ width: naturalW * scale, height: naturalH * scale }}>
        <div style={{ width: naturalW, height: naturalH, transform: `scale(${scale})`, transformOrigin: 'top left' }}>
          {children}
        </div>
      </div>
    </div>
  )
}