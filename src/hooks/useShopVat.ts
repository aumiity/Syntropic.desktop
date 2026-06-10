import { useEffect, useState } from 'react'
import { VAT_RATE_DEFAULT } from '@/lib/vat'

// Shop-level VAT mode (sales_settings.vat_enabled / vat_rate) for UI gating —
// hide tax-invoice actions, VAT fields, and VAT reports when the shop is
// NO-VAT. Never use this for money math on stored bills: each sale snapshots
// its own vat values at sale time (see normalizeSale.ts) and reprints must
// read the stored snapshot, not the current setting.
export function useShopVat() {
  const [vatEnabled, setVatEnabled] = useState(false)
  const [vatRate, setVatRate] = useState<number>(VAT_RATE_DEFAULT)

  useEffect(() => {
    let alive = true
    window.api.settings.getSalesSettings().then((s: any) => {
      if (!alive) return
      setVatEnabled(s?.vat_enabled === 1)
      setVatRate(Number(s?.vat_rate) || VAT_RATE_DEFAULT)
    })
    return () => { alive = false }
  }, [])

  return { vatEnabled, vatRate }
}
