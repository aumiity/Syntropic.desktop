// Label text content — maps the layout sections (sections.ts) to the actual
// strings rendered on a label. Two producers share the SECTIONS layout:
//   - SAMPLE_CONTENT      → placeholder text for the Settings designer preview
//   - composeLabelContent → real text from a product label + shop + lookups
// Both feed the same LabelPaper renderer and the print-HTML builder, so the
// preview and the printed sticker stay 1:1.
import type { SectionKey } from './sections'

// Label print language — selectable per print run in POS. Each maps to the
// `*_th/_en/_mm/_zh` column suffix on the lookup rows + indication fields.
export type LabelLang = 'th' | 'en' | 'mm' | 'zh'

// Shared language picker options (POS print dialog + per-product LabelsTab
// preview + Settings label-designer preview). One source so every language
// selector stays in sync.
export const LANG_OPTIONS: { value: LabelLang; label: string }[] = [
  { value: 'th', label: 'ไทย' },
  { value: 'en', label: 'อังกฤษ' },
  { value: 'mm', label: 'พม่า' },
  { value: 'zh', label: 'จีน' },
]

// Sample text shown in the Settings label-designer preview / test print, keyed
// by language — so the designer can preview font rendering + line wrapping in
// each script. Only the body sections (product / dosage / timing / indication /
// advice) translate; the shop rows stay constant (real shop data has no language
// variants, and the Settings preview overlays the real shop header on top of
// these anyway). The `shop` row's date is rendered separately (right column), so
// it is NOT part of the shop string. Line sections (header_line) carry no
// content; the `custom_text` section pulls from label_settings (config), not here.
export const SAMPLE_CONTENT_BY_LANG: Record<LabelLang, Partial<Record<SectionKey, string>>> = {
  th: {
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
  },
  en: {
    shop:         'ร้านยา ซินโทรปิก เภสัช',
    shop_address: '123/4 ถ.สุขุมวิท กรุงเทพ',
    shop_phone:   'โทร. 02-xxx-xxxx',
    shop_line_id: 'LINE: @syntropic',
    product:      'Paracetamol 500mg tablets',
    dosage:       'Take 1–2 tablets, 3 times a day',
    timing:       'After meals — morning, noon, evening',
    indication:   'Relieves pain, reduces fever',
    advice:       'Drink plenty of water. Stop if any allergy occurs.',
    barcode:      '8851234567890',
  },
  mm: {
    shop:         'ร้านยา ซินโทรปิก เภสัช',
    shop_address: '123/4 ถ.สุขุมวิท กรุงเทพ',
    shop_phone:   'โทร. 02-xxx-xxxx',
    shop_line_id: 'LINE: @syntropic',
    product:      'Paracetamol 500mg tablets',
    dosage:       'တစ်ကြိမ်လျှင် ၁–၂ လုံး၊ တစ်နေ့ ၃ ကြိမ်',
    timing:       'အစာစားပြီး — မနက်၊ နေ့လယ်၊ ည',
    indication:   'နာကျင်မှုသက်သာစေပြီး အဖျားကျစေသည်',
    advice:       'ရေများများသောက်ပါ။ ဓာတ်မတည့်ပါက ရပ်ပါ။',
    barcode:      '8851234567890',
  },
  zh: {
    shop:         'ร้านยา ซินโทรปิก เภสัช',
    shop_address: '123/4 ถ.สุขุมวิท กรุงเทพ',
    shop_phone:   'โทร. 02-xxx-xxxx',
    shop_line_id: 'LINE: @syntropic',
    product:      'Paracetamol 500mg tablets',
    dosage:       '每次 1–2 片，每日 3 次',
    timing:       '饭后服用 — 早、中、晚',
    indication:   '缓解疼痛，退烧',
    advice:       '多喝水。如有过敏请立即停用。',
    barcode:      '8851234567890',
  },
}

// Back-compat alias — Thai is the canonical sample. Callers that don't care
// about language keep importing SAMPLE_CONTENT and get the Thai sample.
export const SAMPLE_CONTENT = SAMPLE_CONTENT_BY_LANG.th

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
  dosage_id?: number | null
  frequency_id?: number | null
  timing_id?: number | null
  label_time_id?: number | null
  advice_id?: number | null
  // Joined name_th from products:getLabels — last-resort fallback when the
  // caller doesn't pass the lookup lists (keeps the Thai LabelsTab preview working).
  dosage_name?: string | null
  frequency_name?: string | null
  timing_name?: string | null
  indication_th?: string | null
  indication_en?: string | null
  indication_mm?: string | null
  indication_zh?: string | null
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
interface Lookup {
  id: number
  name_th?: string | null; name_en?: string | null
  name_mm?: string | null; name_zh?: string | null
}
interface Lookups {
  labelDosages?: Lookup[]
  labelFrequencies?: Lookup[]
  labelMealRelations?: Lookup[]
  labelTimes?: Lookup[]
  labelAdvices?: Lookup[]
}

// Pick a lookup row's name in the requested language, falling back to Thai
// (name_th is NOT NULL in the schema, so Thai is always present). '' if no row.
function pickName(row: Lookup | undefined, lang: LabelLang): string {
  if (!row) return ''
  return (row[`name_${lang}` as const] || row.name_th || '') as string
}

// Map a real product label + shop + lookups to text per section, in `lang`. '' /
// absent = nothing to show (LabelPaper skips empty text sections). The shop row's
// date is rendered by LabelPaper, NOT folded into the shop string here.
// Names resolve from the passed lookup lists by id (lang-aware); if a list is
// omitted, the joined `*_name` (Thai) is the last-resort fallback. lang defaults
// to 'th' so existing callers render identically.
export function composeLabelContent(
  label: LabelLike | null,
  product: ProductLike,
  shop: ShopLike | null,
  lookups: Lookups,
  lang: LabelLang = 'th',
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
    const dosageName = pickName(lookups.labelDosages?.find(d => d.id === label.dosage_id), lang) || label.dosage_name || ''
    const frequencyName = pickName(lookups.labelFrequencies?.find(f => f.id === label.frequency_id), lang) || label.frequency_name || ''
    out.dosage = [dose, dosageName, frequencyName].filter(Boolean).join(' ')

    const timingName = pickName(lookups.labelMealRelations?.find(m => m.id === label.timing_id), lang) || label.timing_name || ''
    const labelTimeName = pickName(lookups.labelTimes?.find(t => t.id === label.label_time_id), lang)
    out.timing = [timingName, labelTimeName].filter(Boolean).join(' ')

    out.indication = label[`indication_${lang}` as const] || label.indication_th || ''

    out.advice = pickName(lookups.labelAdvices?.find(a => a.id === label.advice_id), lang)
  }

  return out
}
