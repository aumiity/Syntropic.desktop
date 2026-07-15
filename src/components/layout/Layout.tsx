import React from 'react'
import { useOutlet, useLocation } from 'react-router-dom'
import { AnimatePresence, motion } from 'framer-motion'
import { Sidebar } from './Sidebar'
import { TitleBar } from './TitleBar'
import { useCan } from '@/hooks/useCan'

export function Layout() {
  const location = useLocation()
  const outlet = useOutlet()
  // Manage runs full-bleed for roles that see its finance dashboard; others keep
  // the capped width. Aligned with the Manage finance-panel gate so a
  // pharmacist's scroll matches the owner's (cosmetic).
  const canManageFull = useCan('report.finance') !== 'off'
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
    // Theme/CSS showcases own a page-level scroll like Manage/Reports, so they run
    // full-bleed too — the scrollbar then sits at the window edge (content stays
    // capped/centered by the page's own inner wrapper), matching the Sales page.
    location.pathname === '/theme' ||
    location.pathname === '/css' ||
    // Settings + the product/bundle edit forms also own a page-level form scroll;
    // full-bleed puts their scrollbar at the window edge. Each re-centers content
    // (and keeps table tabs capped) via its own inner CAP wrapper. The product/
    // bundle EDIT/NEW pages match by suffix so the list/print tabs stay capped.
    location.pathname === '/settings' ||
    (location.pathname.startsWith('/products/') &&
      (location.pathname.endsWith('/edit') || location.pathname.endsWith('/new'))) ||
    // Admin's การจัดการ (Manage) is data/analytics-heavy (finance dashboard +
    // wide history tables) and owns a page-level scroll, so it stretches full
    // width — the scrollbar then sits at the window edge. Staff keeps the capped
    // width (unchanged).
    (location.pathname.startsWith('/manage') && canManageFull)
  const widthClass = isFullWidth ? 'h-full' : 'h-full w-full max-w-7xl mx-auto'

  return (
    <div className="relative flex flex-col h-screen overflow-hidden bg-background">
      <TitleBar />
      <div className="flex flex-1 overflow-hidden">
        {/* Sidebar inset matches on all three open edges (top/left/bottom = pl-2's
            0.5rem) — near-flush against the window, not centered under the
            TitleBar's h-9 drag strip. The strip overlays transparently and has
            no interactive elements over the sidebar, so this reads fine. */}
        <div className="shrink-0 pl-2 pt-2 pb-2">
          <Sidebar />
        </div>
        {/* Content is flush against the sidebar and the right/top window edges (no
            gap, no top padding — confirmed via the realtime padding tuner). Bottom
            keeps the sidebar's 0.5rem inset so the two bottom edges line up. NOTE:
            with pt-0, the top ~h-9 of every page now sits under the
            absolutely-positioned TitleBar drag strip (TitleBar.tsx), so that strip
            visually covers/blocks the top of page content. */}
        <main className="flex-1 overflow-hidden pb-2">
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
