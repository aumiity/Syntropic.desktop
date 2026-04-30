import React, { useState, useEffect } from 'react'
import { Minus, Square, X, Maximize2 } from 'lucide-react'

export function TitleBar() {
  const [maximized, setMaximized] = useState(false)

  useEffect(() => {
    window.api.window.isMaximized().then(setMaximized)
  }, [])

  const minimize = () => window.api.window.minimize()
  const maximize = () => window.api.window.maximize().then(() => window.api.window.isMaximized().then(setMaximized))
  const close = () => window.api.window.close()

  return (
    <div
      className="flex items-center justify-between h-9 bg-sidebar border-b border-sidebar-border shrink-0 select-none"
      style={{ WebkitAppRegion: 'drag' } as React.CSSProperties}
    >
      {/* App title */}
      <div className="px-4 text-xs font-semibold text-sidebar-primary-foreground tracking-widest uppercase">
        Syntropic RX
      </div>

      {/* Window controls */}
      <div
        className="flex h-full"
        style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
      >
        <button
          onClick={minimize}
          className="w-12 h-full flex items-center justify-center text-sidebar-primary-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground transition-colors"
          title="ย่อ"
        >
          <Minus className="h-3.5 w-3.5" />
        </button>
        <button
          onClick={maximize}
          className="w-12 h-full flex items-center justify-center text-sidebar-primary-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground transition-colors"
          title={maximized ? 'คืนขนาด' : 'ขยาย'}
        >
          {maximized ? <Square className="h-3 w-3" /> : <Maximize2 className="h-3.5 w-3.5" />}
        </button>
        <button
          onClick={close}
          className="w-12 h-full flex items-center justify-center text-sidebar-primary-foreground hover:bg-destructive hover:text-primary-foreground transition-colors"
          title="ปิด"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  )
}
