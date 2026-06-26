import React from 'react'
import { useOutlet, useLocation } from 'react-router-dom'
import { AnimatePresence, motion } from 'framer-motion'
import { Sidebar } from './Sidebar'
import { TitleBar } from './TitleBar'
import { usePermission } from '@/hooks/usePermission'

export function Layout() {
  const location = useLocation()
  const outlet = useOutlet()
  const { isAdmin } = usePermission()
  // Key by top-level section so sub-route changes (report tabs, product edit)
  // don't replay the full-page transition — only major section switches do.
  const sectionKey = location.pathname.split('/')[1] || 'home'
  // POS owns its own layout (full-width cart + product grid). Purchase (รับสินค้า)
  // and Purchase Intake (จับคู่ใบส่งของ) are wide data-entry grids, and รายงาน
  // (dashboard + charts/tables) is analytics-heavy — all should stretch with the
  // screen. Every other page is constrained to 1280px so form fields don't
  // stretch on large monitors.
  const isPOS = location.pathname === '/' || location.pathname === ''
  const isFullWidth =
    isPOS ||
    location.pathname === '/purchase' ||
    location.pathname === '/purchase-intake' ||
    location.pathname.startsWith('/reports') ||
    // Admin's การจัดการ (Manage) is data/analytics-heavy (finance dashboard +
    // wide history tables) and owns a page-level scroll, so it stretches full
    // width — the scrollbar then sits at the window edge. Staff keeps the capped
    // width (unchanged).
    (location.pathname.startsWith('/manage') && isAdmin)
  const widthClass = isFullWidth ? 'h-full' : 'h-full w-full max-w-7xl mx-auto'

  return (
    <div className="relative flex flex-col h-screen overflow-hidden bg-background">
      <TitleBar />
      <div className="flex flex-1 overflow-hidden">
        <Sidebar />
        <main className="flex-1 overflow-hidden">
          <AnimatePresence mode="wait">
            <motion.div
              key={sectionKey}
              className={widthClass}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.18, ease: 'easeOut' }}
            >
              {outlet}
            </motion.div>
          </AnimatePresence>
        </main>
      </div>
    </div>
  )
}
