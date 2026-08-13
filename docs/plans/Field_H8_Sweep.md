# Field `h-8` sweep — ล้าง `className="h-9"` ที่ pin ทับ field primitive

**เริ่ม 2026-08-13** · ทำทีละหน้า ติ๊กเสร็จแล้วขีดฆ่าในไฟล์นี้

## กฎ (SSOT)

- **field primitive ทุกตัว = `h-8`** เป็น default อยู่แล้ว → `Input` · `SearchInput` · `SelectTrigger` · `NativeSelect` · `Combobox` · `DateInput` · `DateRangePicker` · `StatusFilterButton` (`h-8 w-8`)
- **Textarea = ข้อยกเว้นเดียว** (หลายบรรทัด → `min-h-16`)
- **`h-9` เป็นของ `Button` เท่านั้น** — ladder `default h-8` / `lg h-9` / `xl h-10` **ห้ามยุบ**; เจอ `<Button className="h-9">` = ปล่อยไว้ ไม่ใช่เป้าหมายของงานนี้
- prose: `docs/claude/ui-theming.md` › **Field-control height** · `docs/claude/ui-table-card.md` › bar heights · `.claude/memory/control_height_h9_revert.md`
- ภาพ: `/theme` › Input (ย่อหน้าท้าย section)

## วิธีแก้แต่ละจุด

1. ลบเฉพาะโทเคน `h-9` ออกจาก `className` — **อย่าแตะ width / `shrink-0` / `text-*` / prop อื่น**
2. ถ้า `className` เหลือแค่ `h-9` ตัวเดียว → ลบ `className` ทั้ง prop
3. **กล่องปลอมที่ทำหน้าที่เป็น field** (`<div className="h-9 px-3 flex items-center bg-muted border rounded-md">` ที่ยืนแทน DateInput ตอน read-only) → เปลี่ยนเป็น `h-8` ด้วย ไม่งั้นแถวเดียวกันสูงไม่เท่ากัน
4. เจอ `rounded-lg` / `rounded-md` hardcode บน field ระหว่างทาง → ย้ายไปใช้ prop `radius="lg"` (กฎห้าม hardcode radius บน field)
5. จบหน้า → `npx tsc -p tsconfig.json --noEmit` แล้ว click-test หน้านั้นในแอป

> **กับดัก `DateInput`:** `className` ลงที่ **wrapper** ส่วน `<Input>` ข้างในตรึง `h-8` ไว้ (`date-input.tsx:104`) → `h-9` ไม่ได้ทำให้ช่องสูงขึ้นจริง แค่ได้ช่องว่างเปล่า + ปุ่มปฏิทินเยื้องจากกึ่งกลาง

> **เลขบรรทัดจะเลื่อน** หลังแก้แต่ละไฟล์ — ก่อนลงมือหน้าถัดไปให้ `grep -n 'h-9' <file>` ยืนยันก่อน

---

## DONE

### เอกสาร + `/theme` (2026-08-13)
- [x] `src/pages/Theme/index.tsx` — label/คำอธิบายที่บอก h-9 (Combobox, Toggle framed="input", DateInput, DateRangePicker, StatusFilter, หัวคอลัมน์→h-10); ถอด `h-9` ที่ pin จริงบนเดโม DateInput/DateRangePicker/Input; `rounded-lg` → `radius="lg"`; ลบ `<TableRow className="h-9">` ที่ตายแล้ว; เพิ่มย่อหน้ากฎความสูงท้าย section Input
- [x] `docs/claude/ui-theming.md` — เพิ่ม `### Field-control height`; แก้ "filter-strip = h-9 cluster" → h-8; แก้ §Font-relative sizing; แก้บรรทัด `DateInput/DateRangePicker — h-10 wrapper` ที่ผิด
- [x] `src/components/ui/switch.tsx` — คอมเมนต์ "h-9 rule is PAUSED" → h-8 locked
- [x] `.claude/memory/` — `checkbox-row-conventions.md` (2 จุด), `feedback_font_relative_sizing.md`, `MEMORY.md`

### `src/pages/Purchase/` (2026-08-13) — tsc PASS, รอ click-test
- [x] `index.tsx` L780 `<Input>` เลขที่ใบรับ (read-only) · L815 `<Input>` เลขที่บิลผู้จำหน่าย · L828 `<DateInput>` วันที่บิล · L840 `<DateInput>` วันที่รับ · L1123 `<DateInput>` วันครบกำหนด · L1148 `<DateInput>` วันที่ชำระ
- [x] `AddProductWizard.tsx` L683 `<SearchInput>` step 1 · L751 `<Input>` Lot No. · L758 + L766 `<DateInput>` วันผลิต/วันหมดอายุ · L896 + L906 + L916 `<Input>` จำนวน/ต้นทุน/ราคารวม · **L756 + L764 กล่อง read-only `bg-muted` → h-8** (คู่กับ DateInput ในแถวเดียวกัน)
- ไม่แตะ: `<Button className="h-9">` (แถบปุ่มเหนือตาราง, ปุ่มส่วนลดในเซลล์), `<TableRow className="[&>th]:h-9">` (หัวตารางล็อต — override ตั้งใจ), segmented `h-9` ของประเภทการชำระ

---

## TODO — เรียงตามน้ำหนักงาน

### 1. `src/pages/People/index.tsx` (5) — 3 ตาราง (ลูกค้า/ผู้จำหน่าย/พนักงาน)
- [ ] L145 `<SearchInput className="h-9">` — filter strip ลูกค้า
- [ ] L258 `<SelectTrigger variant="elevated" className="h-9 min-w-20">` — page-size แถบล่าง
- [ ] L402 `<SearchInput className="h-9">` — filter strip ผู้จำหน่าย
- [ ] L498 `<SelectTrigger variant="elevated" className="h-9 min-w-20">` — page-size
- [ ] L700 `<SearchInput className="h-9">` — filter strip พนักงาน

### 2. `src/pages/PurchaseIntake/index.tsx` (4)
- [ ] L315 `<SelectTrigger className="h-9 w-full rounded-lg bg-input text-sm">` — (มี `rounded-lg` hardcode ด้วย → `radius="lg"`)
- [ ] L398 `<Input className="h-9 pl-8 rounded-lg text-sm">` — ช่องค้นหา
- [ ] L450 `<Input className="h-9 rounded-lg text-sm text-right">`
- [ ] L469 `<Input className="h-9 rounded-lg text-sm text-right">`

### 3. `src/pages/Products/ProductsList.tsx` (3) — หน้า canonical ของ table-card
- [ ] L195 `<SearchInput className="h-9">` — filter strip
- [ ] L202 `<SelectTrigger variant="elevated" className="h-9 w-44 shrink-0">` — หมวดหมู่
- [ ] L408 `<SelectTrigger variant="elevated" className="h-9 min-w-20">` — page-size

### 4. `src/pages/Manage/Expiry.tsx` (3)
- [ ] L276 `<SearchInput>` · L283 `<SelectTrigger w-44>` · L461 `<SelectTrigger min-w-20>`

### 5. `src/pages/Manage/LowStock.tsx` (2)
- [ ] L204 `<SearchInput>` · L211 `<SelectTrigger w-44>`

### 6. `src/pages/Manage/Sales.tsx` (2)
- [ ] L293 `<SearchInput>` · L531 `<SelectTrigger min-w-20>`

### 7. `src/pages/Manage/Purchases.tsx` (2)
- [ ] L561 `<SearchInput>` · L817 `<SelectTrigger min-w-20>`

### 8. `src/pages/Manage/DeadStock.tsx` (1)
- [ ] L160 `<SearchInput className="h-9">`

### 9. `src/pages/Manage/Expenses.tsx` (1)
- [ ] L148 `<SelectTrigger variant="elevated" className="h-9 w-48 ml-auto shrink-0">`

### 10. `src/pages/Products/EditProduct/HistoryTab.tsx` (1)
- [ ] L401 `<SelectTrigger variant="elevated" className="h-9 min-w-20">` — page-size

### 11. `src/pages/Products/EditBundle/HistoryTab.tsx` (1)
- [ ] L369 `<SelectTrigger variant="elevated" className="h-9 min-w-20">` — page-size (คู่แฝดกับข้อ 10)

### 12. `src/pages/Reports/Dashboard.tsx` (1)
- [ ] L510 `<SelectTrigger variant="elevated" className="h-9 w-32">`

### 13. `src/pages/Reports/ReportPrintDialog.tsx` (2)
- [ ] L195 `<Input className="h-9 w-36 shrink-0">` · L202 `<Input className="h-9 w-24 shrink-0">`

### 14. `src/pages/Reports/KhorYor9.tsx` (1)
- [ ] L364 `<Input className="h-9 mb-2">`

### 15. `src/pages/Reports/EnvLog.tsx` (1)
- [ ] L843 `<Input className={cn('h-9 text-center px-1', …)}>` — เซลล์กรอกอุณหภูมิ/ความชื้น (อยู่ใน `cn()` ระวังตอนแก้)

### 16. `src/components/dialogs/LabelPrintDialog.tsx` (2)
- [ ] L106 `<Input className="h-9 w-full min-w-0 px-1 text-center">` — ช่องจำนวนฉลาก
- [ ] L546 `<SelectTrigger className="h-9 w-full">`

### 17. `src/components/label/LabelDesigner.tsx` (1)
- [ ] L563 `<Input className="h-9">` — (ไฟล์นี้มี `h-9` ของ Button/กล่อง layout อีกหลายจุด **อย่าแตะ** แตะเฉพาะ `<Input>` บรรทัดนี้)

---

## คำสั่งตรวจซ้ำ

ต่อไฟล์: `grep -n 'h-9' <file>` แล้วดูว่า tag ที่ครอบคืออะไร (Button = ปล่อย, field = แก้)

ทั้งโปรเจกต์ — เซฟเป็นไฟล์ชั่วคราวแล้วรัน `node <file>` (มันเดินย้อนจากทุก `h-9` ไปหา tag ที่ใกล้ที่สุด แล้วกรองเหลือเฉพาะ field primitive):

```js
import { readFileSync } from 'fs'
import { execSync } from 'child_process'
const files = execSync("grep -rl --include='*.tsx' 'h-9' src/", { encoding: 'utf8' }).trim().split('\n')
const FIELD = /^(Input|SearchInput|Textarea|SelectTrigger|NativeSelect|Combobox|DateInput|DateRangePicker|MultiDatePicker)$/
for (const f of files) {
  const src = readFileSync(f, 'utf8')
  for (const m of src.matchAll(/\bh-9\b/g)) {
    const tags = [...src.slice(Math.max(0, m.index - 800), m.index).matchAll(/<([A-Za-z][A-Za-z0-9]*)\b/g)]
    const tag = tags.at(-1)?.[1]
    if (!tag || !FIELD.test(tag)) continue
    console.log(`${f}:${src.slice(0, m.index).split('\n').length}  <${tag}>`)
  }
}
```
