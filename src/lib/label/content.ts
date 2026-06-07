// Label text content — maps the layout sections (sections.ts) to the actual
// strings rendered on a label. Two producers share the SECTIONS layout:
//   - SAMPLE_CONTENT      → placeholder text for the Settings designer preview
//   - composeLabelContent → real text from a product label + shop + lookups
// Both feed the same LabelPaper renderer and the print-HTML builder, so the
// preview and the printed sticker stay 1:1.
import type { SectionKey } from './sections'

// Sample text shown in the Settings label-designer preview / test print. The
// `shop` row's date is rendered separately (right column), so it is NOT part of
// the shop string here. Line sections (header_line) carry no content; the
// `custom_text` section pulls from label_settings (config), not from here.
export const SAMPLE_CONTENT: Partial<Record<SectionKey, string>> = {
  shop:         'ร้านยา ซินโทรปิก เภสัช',
  shop_address: '123/4 ถ.สุขุมวิท กรุงเทพ',
  shop_phone:   'โทร. 02-xxx-xxxx',
  shop_line_id: 'LINE: @syntropic',
  product:      'Paracetamol 500mg tablets',
  dosage:       'รับประทาน 1–2 เม็ด วันละ 3 ครั้ง',
  timing:       'หลังอาหาร เช้า-กลางวัน-เย็น',
  indication:   'บรรเทาอาการปวด ลดไข้',
  advice:       'ดื่มน้ำตามมาก ๆ หากแพ้ยาให้หยุดใช้ทันที',
  barcode:      '8851234567890',
}

// Print date for the shop row — dd/mm/yyyy in Buddhist era (matches the rest of
// the app's date convention). Defaults to today.
export function todayBE(d: Date = new Date()): string {
  const dd = String(d.getDate()).padStart(2, '0')
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const yyyy = d.getFullYear() + 543
  return `${dd}/${mm}/${yyyy}`
}

interface LabelLike {
  dose_qty?: number | string | null
  dosage_name?: string | null
  frequency_name?: string | null
  timing_name?: string | null
  label_time_id?: number | null
  advice_id?: number | null
  indication_th?: string | null
}
interface ProductLike {
  name_for_print?: string | null
  trade_name?: string | null
  barcode?: string | null
}
interface ShopLike {
  shop_name?: string | null
  shop_address?: string | null
  shop_phone?: string | null
  shop_line_id?: string | null
}
interface Lookup { id: number; name_th?: string | null }
interface Lookups {
  labelTimes?: Lookup[]
  labelAdvices?: Lookup[]
}

// Map a real product label + shop + lookups to text per section. '' / absent =
// nothing to show (LabelPaper skips empty text sections). The shop row's date is
// rendered by LabelPaper, NOT folded into the shop string here.
export function composeLabelContent(
  label: LabelLike | null,
  product: ProductLike,
  shop: ShopLike | null,
  lookups: Lookups,
): Partial<Record<SectionKey, string>> {
  const out: Partial<Record<SectionKey, string>> = {}
  if (shop?.shop_name) out.shop = shop.shop_name
  // Address / phone / LINE ID are now independent sections (each its own line).
  out.shop_address = shop?.shop_address || ''
  out.shop_phone = shop?.shop_phone ? `โทร. ${shop.shop_phone}` : ''
  out.shop_line_id = shop?.shop_line_id ? `LINE: ${shop.shop_line_id}` : ''
  out.product = product.name_for_print || product.trade_name || ''
  out.barcode = product.barcode || ''

  if (label) {
    const dose = label.dose_qty != null && String(label.dose_qty) !== '' ? String(label.dose_qty) : ''
    out.dosage = [dose, label.dosage_name, label.frequency_name].filter(Boolean).join(' ')

    const labelTimeName = lookups.labelTimes?.find(t => t.id === label.label_time_id)?.name_th
    out.timing = [label.timing_name, labelTimeName].filter(Boolean).join(' ')

    out.indication = label.indication_th || ''

    out.advice = lookups.labelAdvices?.find(a => a.id === label.advice_id)?.name_th || ''
  }

  return out
}
