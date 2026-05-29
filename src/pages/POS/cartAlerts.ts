import dayjs, { type Dayjs } from 'dayjs'
import type { CartItem, ProductLot, SalesSettings } from '@/types'

export type AlertLevel = 'expired' | 'low_stock' | 'danger' | 'warn'
export type CartAlert = { level: AlertLevel; reason: string } | null

const fmt = (d?: string) => (d ? dayjs(d).format('DD/MM/YYYY') : '-')

// Total open-lot stock in BASE units (lots already filter to is_closed=0 in pos:searchProducts).
const sumStock = (lots?: ProductLot[]) =>
  (lots ?? []).reduce((s, l) => s + (l.qty_on_hand ?? 0), 0)

// Returns the lot with the soonest expiry among open lots that actually have stock.
// pos:searchProducts already orders lots by expiry ASC, but we re-pick defensively
// in case callers pass an unsorted list.
const soonestLot = (lots?: ProductLot[]): ProductLot | null => {
  if (!lots || lots.length === 0) return null
  let best: ProductLot | null = null
  for (const l of lots) {
    if ((l.qty_on_hand ?? 0) <= 0) continue
    if (!l.expiry_date) continue
    if (!best || dayjs(l.expiry_date).isBefore(best.expiry_date)) best = l
  }
  return best
}

interface ExpiryEval {
  level: 'expired' | 'danger' | 'warn' | null
  date?: string
}

const evalExpiry = (
  lots: ProductLot[] | undefined,
  s: SalesSettings,
  today: Dayjs,
): ExpiryEval => {
  const lot = soonestLot(lots)
  if (!lot || !lot.expiry_date) return { level: null }
  const exp = dayjs(lot.expiry_date)
  if (s.expired_alert_enabled && exp.isBefore(today, 'day')) {
    return { level: 'expired', date: lot.expiry_date }
  }
  if (s.expiry_alert_enabled) {
    if (exp.isBefore(today.add(s.expiry_danger_months, 'month'), 'day')) {
      return { level: 'danger', date: lot.expiry_date }
    }
    if (exp.isBefore(today.add(s.expiry_warn_months, 'month'), 'day')) {
      return { level: 'warn', date: lot.expiry_date }
    }
  }
  return { level: null }
}

// expired is the most urgent (already a regulatory problem to sell);
// low_stock (can't physically fulfill) outranks near-expiry (can still be sold).
const SEVERITY: Record<AlertLevel, number> = {
  expired: 4,
  low_stock: 3,
  danger: 2,
  warn: 1,
}

export function getCartItemAlert(
  item: CartItem,
  settings: SalesSettings | null,
  today: Dayjs = dayjs(),
): CartAlert {
  if (!settings) return null
  const product = item.product
  if (!product) return null

  // Bundle path — evaluate each component, surface the most severe.
  if (product.is_bundle) {
    const components = product.bundle_items ?? []
    let worst: CartAlert = null
    for (const c of components) {
      const requiredBase = item.qty * (c.qty_per_bundle ?? 1)
      const stock = sumStock(c.lots)
      if (settings.low_stock_alert_enabled && requiredBase > stock) {
        const unitLabel = c.component_unit_name ? ` ${c.component_unit_name}` : ''
        const candidate: CartAlert = {
          level: 'low_stock',
          reason: `สต๊อกไม่พอ: ${c.component_name ?? 'องค์ประกอบ'} ต้องการ ${requiredBase}${unitLabel} แต่มี ${stock}${unitLabel}`,
        }
        if (!worst || SEVERITY[candidate.level] > SEVERITY[worst.level]) worst = candidate
      }
      const ex = evalExpiry(c.lots, settings, today)
      if (ex.level) {
        const name = c.component_name ?? 'องค์ประกอบ'
        const reason =
          ex.level === 'expired'
            ? `${name} หมดอายุแล้ว (${fmt(ex.date)})`
            : ex.level === 'danger'
              ? `${name} อายุต่ำกว่า ${settings.expiry_danger_months} เดือน (${fmt(ex.date)})`
              : `${name} อายุต่ำกว่า ${settings.expiry_warn_months} เดือน (${fmt(ex.date)})`
        const candidate: CartAlert = { level: ex.level, reason }
        if (!worst || SEVERITY[candidate.level] > SEVERITY[worst.level]) worst = candidate
      }
    }
    return worst
  }

  // Regular product — normalize cart qty into base units before stock comparison.
  const factor = item.selectedUnit?.qty_per_base ?? 1
  const soldBase = item.qty * factor
  const stock = sumStock(product.lots)
  if (settings.low_stock_alert_enabled && soldBase > stock) {
    // Stock is in base units; if the user is selling in a non-base unit, surface
    // both the base name (from product) and the conversion is implicit in soldBase.
    const baseUnit = product.unit_name ? ` ${product.unit_name}` : ''
    return {
      level: 'low_stock',
      reason: `สต๊อกไม่พอ`,
    }
  }
  const ex = evalExpiry(product.lots, settings, today)
  if (ex.level) {
    const reason =
      ex.level === 'expired'
        ? `สินค้าหมดอายุแล้ว (${fmt(ex.date)})`
        : ex.level === 'danger'
          ? `อายุต่ำกว่า ${settings.expiry_danger_months} เดือน (${fmt(ex.date)})`
          : `อายุต่ำกว่า ${settings.expiry_warn_months} เดือน (${fmt(ex.date)})`
    return { level: ex.level, reason }
  }
  return null
}

export type ExpiryLevel = 'expired' | 'danger' | 'warn'

const EXPIRY_SEVERITY: Record<ExpiryLevel, number> = { expired: 3, danger: 2, warn: 1 }

// Worst near-expiry level across a product's lots (bundle: across every component),
// driven by the same salesSettings thresholds as getCartItemAlert. Used by the POS
// search dialog so its name-prefix icon matches the cart table exactly.
export function getProductExpiryLevel(
  product:
    | { is_bundle?: boolean | number; lots?: ProductLot[]; bundle_items?: { lots?: ProductLot[] }[] }
    | null
    | undefined,
  settings: SalesSettings | null,
  today: Dayjs = dayjs(),
): ExpiryLevel | null {
  if (!settings || !product) return null
  const lotGroups = product.is_bundle
    ? (product.bundle_items ?? []).map((c) => c.lots)
    : [product.lots]
  let worst: ExpiryLevel | null = null
  for (const lots of lotGroups) {
    const lvl = evalExpiry(lots, settings, today).level
    if (lvl && (!worst || EXPIRY_SEVERITY[lvl] > EXPIRY_SEVERITY[worst])) worst = lvl
  }
  return worst
}

export function alertColorClass(level: AlertLevel): string {
  switch (level) {
    case 'expired':
    case 'low_stock':
      return 'text-destructive'
    case 'danger':
      return 'text-warning-strong'
    case 'warn':
      return 'text-warning'
  }
}
