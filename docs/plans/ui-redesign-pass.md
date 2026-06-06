# UI Redesign Pass — เจาะปรับหน้าตาทีละหน้า

> **SSOT ของงานรอบนี้** — ติดตามว่าทำถึงหน้าไหนแล้ว ข้ามวันได้
> เริ่ม: 2026-06-06 · เจ้าของงาน: aumiity

## เป้าหมาย
ปรับ **หน้าตา (UI/visual)** ของแอปทีละหน้า ตาม journey การใช้งานจริง ตั้งแต่หน้าลงโปรแกรมไปจนถึงหน้าที่ใช้ทุกวัน
- ระบบ **ทำงานได้ครบ click-test ผ่านหมดแล้ว** — รอบนี้ไม่แตะ logic/IPC/schema เว้นแต่จำเป็นต่อหน้าตา
- เป้าคือความสวย/ความสม่ำเสมอ/ลำดับสายตา ไม่ใช่ฟีเจอร์ใหม่

## กติกาเหล็ก (อ่านก่อนทุกครั้งที่เจาะหน้าใหม่)
- **`/theme` = source of truth** → เปิด `src/pages/Theme/index.tsx` หา pattern ที่ตรง แล้วใช้ตาม; แก้ primitive ต้องอัปเดต showcase ในคอมมิตเดียวกัน
- อ่าน `docs/claude/ui-theming.md` · `ui-table-card.md` · `ui-components.md` ตามหัวข้อที่กำลังแก้
- **semantic token เท่านั้น** ห้าม palette literal (`bg-blue-500`); ขาด role → เพิ่ม token ใน `src/index.css` + `tailwind.config.js`
- **ไม่มี emoji** ใน UI string/โค้ด; ใช้ lucide-react + Badge variants
- ใช้ `src/components/ui/*` เท่านั้น ห้าม raw HTML; ไม่มี local helper ใน `src/pages/`
- text-size: title ≥ `text-base`, body/table/label/button = `text-sm`, helper/badge = `text-xs`; ห้ามเล็กกว่า `text-xs`
- ใช้ full palette อย่ากองที่ primary/secondary/destructive
- **เสนอก่อนลงมือทุกหน้า** — เปิดหน้านั้น สรุปสิ่งที่จะเปลี่ยน ให้เจ้าของเคาะก่อน

## สถานะ (legend)
- `[ ]` ยังไม่เริ่ม
- `[~]` กำลังทำ / เสนอแผนแล้ว รอเคาะ
- `[x]` เสร็จ + เจ้าของเห็นชอบ
- `[-]` ข้าม (ไม่ทำรอบนี้)

---

## ลำดับงาน

### Wave 1 — ประตูทางเข้า (เล็ก, เจอครั้งแรก, วอร์มภาษาดีไซน์ใหม่)
- [~] **1. Setup Wizard** — `src/pages/Setup/SetupWizard.tsx` (4 ขั้น: shop / VAT / admin password / confirm) — **redesign Split brand panel เสร็จ, tsc ผ่าน, รอเจ้าของดูจริง**
- [ ] **2. Login Screen** — `src/pages/Auth/LoginScreen.tsx` (เลือกชื่อ + password + ลืมรหัส flow) — จะใช้ BrandPanel/BrandMark ชุดเดียวกัน

### Wave 2 — หัวใจที่ใช้ทุกวัน (frequency สูงสุด)
- [ ] **3. POS** — `src/pages/POS/index.tsx` (+ search modal, cart, payment, unit/qty dialogs)
- [ ] **4. Products list** — `src/pages/Products/ProductsList.tsx` + `BundlesList.tsx`
- [ ] **5. Edit Product / Bundle** — EditProduct (tabs) + EditBundle

### Wave 3 — งานรับเข้า + จัดการ
- [ ] **6. Purchase / Intake** — `src/pages/Purchase/index.tsx` + `src/pages/PurchaseIntake/index.tsx`
- [ ] **7. Manage (7 หน้า table-card)** — `src/pages/Manage/*`: Sales, Purchases, Expenses, DeadStock, LowStock, Expiry, NegativeStock
      _(ใช้ pattern เดียวกัน → เจาะ pattern ทีเดียวกระจายได้หลายหน้า)_

### Wave 4 — รายงาน + ตั้งค่า (เยอะแต่ความถี่ต่ำ)
- [ ] **8. Reports** — `src/pages/Reports/*`: Dashboard, FdaReports, KhorYor9
- [ ] **9. People** — `src/pages/People/index.tsx`
- [ ] **10. Settings (12 แท็บ)** — `src/pages/Settings/*`: Shop, Sales, Categories, DrugTypes, Units, ProductMgmt, ExpenseCategories, Printers, Label, Receipt, Document, Database

### ข้าม
- [-] Quotation `src/pages/Quotation/*` — ซ่อนจาก nav แล้ว
- [-] Theme `src/pages/Theme/index.tsx` + CSS `src/pages/CSS/index.tsx` — showcase ไม่ใช่หน้าผู้ใช้ (แต่ต้องอัปเดตเมื่อแก้ primitive)

---

## บันทึกการทำงาน (session log)
> ลงทุกครั้งที่ทำ: วันที่ · หน้าที่แตะ · เปลี่ยนอะไร · commit

- **2026-06-06** — สร้างแผนนี้ + จัดลำดับ Wave 1–4.
- **2026-06-06** — **#1 SetupWizard redesign (Split brand panel)** — เจ้าของเลือกทิศทาง Split brand panel.
  - สร้าง primitive ใหม่ 3 ตัวใน `src/components/ui/`: `brand.tsx` (`BrandMark` + `BrandPanel` + logomark SVG), `stepper.tsx` (`Stepper` แนวตั้ง tone light/dark), `choice-card.tsx` (`ChoiceCard` ย้ายออกจาก page)
  - รื้อ `SetupWizard.tsx`: 2-pane (BrandPanel ซ้าย teal gradient + โลโก้ Syntropic + tagline + Stepper / ฟอร์มขวา), header แบบ eyebrow+title+desc, ฟอร์มใน `Card`, ลบ local helper (StepHeader/ChoiceCard/SummaryRow) ตามรูล, summary เป็น inline map, cleanup `variant="elevated"` ที่ซ้ำซ้อน
  - tsc ผ่าน (app config EXIT 0). **รอเจ้าของดูจริง** (ดูผ่านปุ่ม DEV "ดูตัวอย่าง Setup (DEV)" ใน Settings > ร้าน)
  - **ค้าง/follow-up:** ยังไม่เพิ่ม showcase ของ primitive ใหม่ใน `/theme` (รอ look ผ่านก่อน), Login (#2) จะใช้ BrandPanel/BrandMark ชุดเดียวกัน

## โน้ตต่อหน้า (เก็บ decision/ของที่เจอระหว่างทำ)
- **โลโก้ Syntropic:** ยังไม่มี asset จริง → ใช้ SVG logomark ใน `brand.tsx` (3 แท่งไล่ระดับ = growth/syntropy + จุด accent เหลือง). เปลี่ยนเป็นโลโก้จริงได้ที่ `LogoGlyph` ใน `brand.tsx` ที่เดียว
- **BrandPanel/BrandMark = ใช้ซ้ำ:** Setup + Login (Wave 1) ต้องหน้าตาเดียวกัน — แก้ที่ `brand.tsx` กระทบทั้งคู่
- **gradient แบรนด์:** `from-primary to-primary-strong` (token มีครบ light/dark)