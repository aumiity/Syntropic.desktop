import { LabelLookupTab } from './LabelLookupTab'

// "preset วิธีใช้" ถูกย้ายเข้าไปอยู่ใน segmented strip เดียวกับ KINDS (รวม "คำแนะนำ")
// ภายใน LabelLookupTab แล้ว — ชั้น subtab แนว line เดิมจึงไม่จำเป็นอีกต่อไป
export function DrugUsageTab() {
  return <LabelLookupTab />
}
