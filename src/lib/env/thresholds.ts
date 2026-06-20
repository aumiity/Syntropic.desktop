// SSOT — ค่ามาตรฐาน GPP อุณหภูมิ–ความชื้น สำหรับร้านยา. นิ่งตามประกาศ
// อย./GPP (ไม่มีวันเปลี่ยน) จึงฝังเป็นค่าคงที่แทนตาราง env_settings เดิม.
// ไฟล์นี้ต้อง self-contained (ไม่ import อะไร, ไม่ใช้ alias @/) เพราะถูก
// import จากทั้ง renderer (src/) และ electron main — electron build ไม่มี @ alias.
export const GPP_THRESHOLDS = {
  store_temp_max: 30,
  store_humidity_max: 75,
  reserve_temp_max: 30,
  reserve_humidity_max: 75,
  fridge_temp_min: 2,
  fridge_temp_max: 8,
} as const

export type ThreshKind =
  | 'store_temp' | 'store_humidity'
  | 'reserve_temp' | 'reserve_humidity' | 'fridge'

// True เมื่อค่าที่วัดได้หลุดเกณฑ์ GPP (→ เซลล์แดง). null/blank ไม่ถือว่าหลุด.
export function isOutOfRange(kind: ThreshKind, v: number | null): boolean {
  if (v == null) return false
  switch (kind) {
    case 'store_temp':       return v > GPP_THRESHOLDS.store_temp_max
    case 'store_humidity':   return v > GPP_THRESHOLDS.store_humidity_max
    case 'reserve_temp':     return v > GPP_THRESHOLDS.reserve_temp_max
    case 'reserve_humidity': return v > GPP_THRESHOLDS.reserve_humidity_max
    case 'fridge':           return v < GPP_THRESHOLDS.fridge_temp_min || v > GPP_THRESHOLDS.fridge_temp_max
  }
}
