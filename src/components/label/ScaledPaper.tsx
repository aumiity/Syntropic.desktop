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
  // When set (0–1), the label scales to occupy this fraction of the available
  // box and MAY enlarge past 1:1 (still fit within both axes, never overflows).
  // Omit to keep the default "fit and never upscale past real size" behaviour.
  fill?: number
  // 'fit' (default) scales to fit BOTH axes of a fixed-height box. 'width' scales
  // by the available WIDTH only and lets the wrapper's height follow the label —
  // use it when the container should hug the label instead of stretching tall.
  mode?: 'fit' | 'width'
}

export function ScaledPaper({ widthMm, heightMm, children, fill, mode = 'fit' }: Props) {
  const ref = useRef<HTMLDivElement>(null)
  const [scale, setScale] = useState(1)

  const naturalW = Math.max(1, widthMm * MM_TO_PX)
  const naturalH = Math.max(1, heightMm * MM_TO_PX)

  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    const update = () => {
      const aw = el.clientWidth, ah = el.clientHeight
      if (!aw) return
      if (mode === 'width') {
        setScale((aw / naturalW) * (fill ?? 1))
        return
      }
      if (!ah) return
      const fit = Math.min(aw / naturalW, ah / naturalH)
      setScale(fill != null ? fit * fill : Math.min(1, fit))
    }
    update()
    const ro = new ResizeObserver(update)
    ro.observe(el)
    return () => ro.disconnect()
  }, [naturalW, naturalH, fill, mode])

  return (
    <div ref={ref} className={`flex w-full items-center justify-center ${mode === 'width' ? '' : 'h-full overflow-hidden'}`}>
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