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
- [x] **1. Setup Wizard** — `src/pages/Setup/SetupWizard.tsx` — **DONE (เจ้าของเคาะ 2026-06-06):** Split brand panel + rebrand "Rx Desktop" + base Card border default + required asterisks (ชื่อ/ที่อยู่/เบอร์) + เบอร์โทรตัวเลขเท่านั้น + บล็อก VAT registration (Phase 2/3 ยังไม่พร้อม)
- [x] **2. Login Screen** — `src/pages/Auth/LoginScreen.tsx` — **DONE (เจ้าของเคาะ 2026-06-06):** 2-pane BrandPanel + Apple-style user list (avatar lg, ชื่อ+email, ติ๊กถูกตอนเลือก, ไม่มีกรอบนอก), โลโก้ใบไม้จริง + "เข้าสู่ระบบ" ใหญ่, admin-first, ปุ่มลืมรหัส elevated, ชื่อร้านจริง. พ่วง: username UPPERCASE+charset (people.ts/seed), avatar size lg, **โลโก้ Syntropic จริง** (logo-mark.tsx) ใช้ทั้ง Setup/Login/Sidebar

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

- **2026-06-06** — **merge `feat/user-profile-schema` เข้า main** (งานที่ค้างนอก main: ย้ายเมนูบัญชี titlebar→sidebar = `SidebarUser.tsx`, + username login + profile schema + self-password-change + hygeia prep). resolve conflict `MEMORY.md` ที่เดียว, tsc ผ่านทั้ง 2 config. **ผลต่อ redesign:** LoginScreen (#2) ตอนนี้เป็น username login แล้ว (เดิม name-select) → redesign บนฐานนี้; เมนู user ย้ายไป Sidebar (`SidebarUser.tsx`) แล้ว — ไม่ต้องทำซ้ำ. **ยังไม่ push origin** (รอเจ้าของสั่ง). ควร re-test login รอบใหม่

- **2026-06-06** — **#1 SetupWizard DONE + rebrand ทั้งแอป**
  - rebrand: **โปรแกรมชื่อ "Rx Desktop"** (Syntropic = บริษัท, สาย product = Rx Desktop/Web/CLI/Code แบบ Anthropic→Claude). แก้ `productName`+`description` (package.json), `<title>` (index.html), window title (main.ts), Sidebar wordmark (Rx + "Desktop"), brand.tsx wordmark "Rx Desktop" + โลโก้ placeholder = "Rx" serif italic. คงไว้: appId `com.syntropic.desktop`, footer `© Syntropic`. รอ logo asset จริง → สลับที่ `LogoGlyph`/tile ใน brand.tsx
  - **base Card ได้ border เป็น default** (card.tsx) — [[card-border-default]]; ถอด border ซ้ำใน SetupWizard
  - step "ข้อมูลร้าน": required asterisk (FormField `required`) + เบอร์โทร digits-only (`replace(/\D/g,'')` + inputMode numeric)
  - step "ภาษี VAT": **บล็อกการเลือกจด VAT** (validateStep2 reject 'yes' + toast "ระบบยังไม่สามารถใช้งานได้" + กล่อง warning แทนช่อง) — [[project_vat_phasing]]; โค้ดเดิมเก็บไว้ re-enable ง่าย
  - tsc ผ่านทั้ง 2 config. commit checkpoint.

- **2026-06-06** — **#2 Login DONE + โลโก้จริง + username UPPERCASE**
  - Login: 2-pane (คง BrandPanel เทลซ้าย) + การ์ดผู้ใช้สไตล์ Apple "Choose an account" (avatar `lg` size-12, ชื่อหนา+email, ติ๊กถูกวงเทลตอนเลือก, hover เทาอ่อน), เอากรอบนอกออก (content วางบนพื้น), โลโก้ใหญ่กลาง + "เข้าสู่ระบบ" text-3xl + subtitle, admin-first sort, ปุ่มลืมรหัส `elevated`, ชื่อร้านดึงจริงจาก getShop (preview ด้วย)
  - **username = UPPERCASE บังคับ + [A-Z0-9_.-] เท่านั้น** (people.ts save + People form input + suggestUsername + seed ADMIN/STAFF + owner lock 'ADMIN'); uniqueness กลายเป็น case-insensitive
  - **โลโก้ Syntropic จริง** = ใบไม้ใน docs/Logo/**Logo_adobe.svg** (path เดียว สะอาด 4KB) → `src/components/ui/logo-mark.tsx` (`LogoMark`, fill=currentColor themeable). **ไม่ใช้** `LOGO_TRANS_VEC_edge1color.svg` (1.3MB traced raster). ใช้ที่ BrandMark/BrandLogo (Setup+Login) + Sidebar. avatar เพิ่ม size `lg`
  - tsc ผ่านทั้ง 2 config. commit checkpoint. **ถัดไป: แวะทำ Logo (app icon/favicon/showcase) ก่อนไป #3 POS**

- **2026-06-06** — **แวะทำ Logo + DEV auto-login**
  - โลโก้จริง = `Logo_adobe.svg` (ไม่ใช่ edge1color 1.3MB) → `logo-mark.tsx`. **trim viewBox เป็นจัตุรัสครอบใบไม้** (เดิมมีขอบว่าง ~20% ในกรอบ 1024² → เล็ก/ห่าง) ตอนนี้เต็ม ~96%
  - refine `BrandMark`: prop `orientation` (horizontal/vertical) + size `sm/md/lg`; gap โลโก้-ข้อความ = **gap-2** ทั้งแอป (BrandMark + Sidebar)
  - **showcase "Brand / Logo"** ใน `/theme` (LogoMark หลายสี/ขนาด, BrandMark h/v, b+teal panel)
  - **pin font wordmark**: token `--font-brand: 'Inter'` (ไม่ override .dark, ไม่โดน Theme swap) + utility `font-brand` → "Rx Desktop" เป็น Inter เสมอ (ฟอนต์ทั้งแอป bundle local แล้ว ไม่พึ่ง CDN/ระบบ)
  - **DEV auto-login** กัน refresh แล้วเด้ง login ตอน dev: `auth:devLogin` (bind admin คนแรกไม่ใช้รหัส, gate `!app.isPackaged`) + LoginGate เรียกเมื่อ `import.meta.env.DEV` (prod strip). session in-memory no-persist = ตั้งใจ (security) ไม่แตะ. **main+preload เปลี่ยน → ต้อง restart electron:dev ครั้งเดียว**
  - tsc ผ่านทั้ง 2 config. commit. **ถัดไป: Wave 2 #3 POS**

## โน้ตต่อหน้า (เก็บ decision/ของที่เจอระหว่างทำ)
- **โลโก้ Syntropic:** ยังไม่มี asset จริง → ใช้ SVG logomark ใน `brand.tsx` (3 แท่งไล่ระดับ = growth/syntropy + จุด accent เหลือง). เปลี่ยนเป็นโลโก้จริงได้ที่ `LogoGlyph` ใน `brand.tsx` ที่เดียว
- **BrandPanel/BrandMark = ใช้ซ้ำ:** Setup + Login (Wave 1) ต้องหน้าตาเดียวกัน — แก้ที่ `brand.tsx` กระทบทั้งคู่
- **gradient แบรนด์:** `from-primary to-primary-strong` (token มีครบ light/dark)