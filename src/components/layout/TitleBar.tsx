import React, { useState, useEffect } from 'react'
import { Minus, Plus, X } from 'lucide-react'

const trafficLight =
  'flex items-center justify-center w-4 h-4 rounded-full transition-colors shrink-0'
const iconBase =
  'opacity-0 group-hover:opacity-100 transition-opacity text-[10px] font-bold leading-none select-none'

const colors = {
  close: { bg: '#FF5F57', hover: '#FF3B30', ring: '#E0443E' },
  minimize: { bg: '#28CA41', hover: '#1EAB31', ring: '#1D8E2B' },
  maximize: { bg: '#FFBD2E', hover: '#FF9F0A', ring: '#DEA123' },
}

export function TitleBar() {
  const [maximized, setMaximized] = useState(false)
  const [hovered, setHovered] = useState<'close' | 'minimize' | 'maximize' | null>(null)

  useEffect(() => {
    window.api.window.isMaximized().then(setMaximized)
  }, [])

  const minimize = () => window.api.window.minimize()
  const maximize = () =>
    window.api.window.maximize().then(() => window.api.window.isMaximized().then(setMaximized))
  const close = () => window.api.window.close()

  return (
    <div
      className="no-print absolute top-0 left-0 right-0 flex items-center justify-end h-9 select-none z-50"
      style={{ WebkitAppRegion: 'drag' } as React.CSSProperties}
    >
      {/* Windows-style controls: minimize | maximize | close */}
      <div
        className="flex items-center gap-2 px-3 h-full"
        style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
      >

        {/* Minimize — yellow */}
        <button
          onClick={minimize}
          onMouseEnter={() => setHovered('minimize')}
          onMouseLeave={() => setHovered(null)}
          className={`group ${trafficLight}`}
          style={{
            backgroundColor: colors.minimize.bg,
            ...(hovered === 'minimize' ? { backgroundColor: colors.minimize.hover } : {}),
          }}
          title="ย่อ"
        >
          <Minus className={`${iconBase} text-[#003D0A]`} size={12} strokeWidth={4} />
        </button>

        {/* Maximize — green */}
        <button
          onClick={maximize}
          onMouseEnter={() => setHovered('maximize')}
          onMouseLeave={() => setHovered(null)}
          className={`group ${trafficLight}`}
          style={{
            backgroundColor: colors.maximize.bg,
            ...(hovered === 'maximize' ? { backgroundColor: colors.maximize.hover } : {}),
          }}
          title={maximized ? 'คืนขนาด' : 'ขยาย'}
        >
          <Plus className={`${iconBase} text-[#7A4E00]`} size={12} strokeWidth={4} />
        </button>

        {/* Close — red */}
        <button
          onClick={close}
          onMouseEnter={() => setHovered('close')}
          onMouseLeave={() => setHovered(null)}
          className={`group ${trafficLight}`}
          style={{
            backgroundColor: colors.close.bg,
            ...(hovered === 'close' ? { backgroundColor: colors.close.hover } : {}),
          }}
          title="ปิด"
        >
          <X className={`${iconBase} text-[#4A0000]`} size={12} strokeWidth={4} />
        </button>
      </div>
    </div>
  )
}
