import type { CartItem } from '@/types'

export function redistributeDiscounts(items: CartItem[], newTotal: number): number[] {
  const n = items.length
  if (n === 0) return []

  const grosses = items.map(i => i.qty * i.unit_price)
  const subtotal = grosses.reduce((a, b) => a + b, 0)
  const result = items.map(i => i.discount || 0)
  const oldTotal = result.reduce((a, b) => a + b, 0)
  const target = Math.max(0, newTotal)

  if (subtotal <= 0 || Math.abs(target - oldTotal) < 1e-6) {
    return result.map(d => round2(Math.max(0, d)))
  }

  if (target > oldTotal) {
    const delta = target - oldTotal
    for (let i = 0; i < n; i++) {
      result[i] += (delta * grosses[i]) / subtotal
    }
  } else {
    let delta = oldTotal - target
    for (let guard = 0; guard < 50 && delta > 1e-6; guard++) {
      const active = result
        .map((d, i) => ({ i, d }))
        .filter(x => x.d > 1e-6)
      if (active.length === 0) break
      const pool = active.reduce((s, x) => s + grosses[x.i], 0)
      if (pool <= 0) break
      let reduced = 0
      for (const { i, d } of active) {
        const share = Math.min(d, (delta * grosses[i]) / pool)
        result[i] -= share
        reduced += share
      }
      delta -= reduced
      if (reduced < 1e-9) break
    }
  }

  const rounded = result.map(d => round2(Math.max(0, d)))
  // Reconcile per-line rounding so rounded values sum exactly to the target.
  // Without this, target=10 split over 3 equal lines yields 3.33+3.33+3.33=9.99, etc.
  const residual = round2(round2(target) - rounded.reduce((a, b) => a + b, 0))
  if (residual !== 0 && n > 0) {
    let bestIdx = 0
    for (let i = 1; i < n; i++) if (grosses[i] > grosses[bestIdx]) bestIdx = i
    rounded[bestIdx] = Math.max(0, round2(rounded[bestIdx] + residual))
  }
  return rounded
}

function round2(n: number) {
  return Math.round(n * 100) / 100
}
