# จุดส้มบอกสถานะ "ยังไม่บันทึก" บนปุ่มบันทึก — Design Spec

วันที่: 2026-07-05
สถานะ: อนุมัติดีไซน์แล้ว (รอ review spec ก่อนทำ plan)

## 1. เป้าหมาย

เพิ่มตัวบ่งชี้ทางสายตา: **จุดกลมสีส้ม** นำหน้าไอคอนในปุ่ม "บันทึก" เมื่อฟอร์มถูกแก้ไขแล้วแต่ยังไม่กดบันทึก (dirty state) — เพื่อกันผู้ใช้ลืมกดบันทึกหลังแก้ไข ทำเฉพาะ **หน้าฟอร์มใหญ่** ไม่ทำใน dialog และไม่ทำในแท็บที่เป็นตาราง CRUD (บันทึกทีละแถวทันที)

## 2. ขอบเขต

### ทำ (7 จุด)
| # | ไฟล์ | วิธีจับ dirty |
|---|------|--------------|
| 1 | `src/pages/Products/EditProduct/index.tsx` | ธง `isDirty` เดิม (มีอยู่แล้ว) |
| 2 | `src/pages/Products/EditBundle/index.tsx` | ธง `isDirty` เดิม (มีอยู่แล้ว) |
| 3 | `src/pages/Settings/ShopTab.tsx` | ตั้งธงใหม่ |
| 4 | `src/pages/Settings/SalesTab.tsx` | ตั้งธงใหม่ + ยกขึ้นพ่อ |
| 5 | `src/pages/Settings/ReceiptSettingsTab.tsx` | ตั้งธงใหม่ |
| 6 | `src/pages/Settings/DocumentSettingsTab.tsx` | ตั้งธงใหม่ |
| 7 | `src/components/label/LabelDesigner.tsx` | เทียบ snapshot (คลุมฉลากยา + ฉลากเปล่า) |

หมายเหตุ: `PrintersTab.tsx` เป็นตัวครอบ sub-tab (documents = DocumentSettingsTab, labels = LabelSettingsTab→LabelDesigner, receipts = ReceiptSettingsTab) ไม่มีฟอร์มแยก จึงคลุมด้วยรายการ 5–7 อยู่แล้ว `LabelSettingsTab.tsx` เป็น wrapper บาง ๆ ของ `LabelDesigner`

### ไม่ทำ
- Dialog ทุกตัว (เพิ่มลูกค้า, ปรับสต็อก, ฟอร์มค่าใช้จ่าย ฯลฯ)
- แท็บตาราง CRUD: Units, Categories/ProductMgmt, DrugTypes/DrugUsage, ExpenseCategories, LabelLookup, LabelPreset, Permissions
- หน้ารายงาน / grid entry (EnvLog, VatReport ฯลฯ)

## 3. ดีไซน์

### 3.1 Primitive — prop `dirty` บน `Button`

> ยืนยันหน้าตาจาก mockup (2026-07-05): **จุด 8px · สีส้ม warning · นิ่งไม่กะพริบ**

แก้ `src/components/ui/button.tsx`: เพิ่ม prop `dirty?: boolean`

- `dirty === true` → เรนเดอร์จุดกลม **นำหน้า** `children` (จุด → ไอคอน Save → ข้อความ)
- `dirty` falsy → ไม่เรนเดอร์อะไร (ปุ่มปกติ)
- สีจุด = โทเคน `bg-warning` (สีส้มของระบบ ตามคอมเมนต์ button.tsx: "warning-soft = pale ORANGE") — **ห้าม** ใช้ literal เช่น `bg-orange-500`
- ขนาดจุด = rem-relative (`size-2`) เป็นวงกลม `rounded-full` — ห้าม hardcode px
- นิ่ง ไม่มี animation (ตามกฎ animation ต้องเสนอ+อนุมัติก่อน)
- **Guard `asChild`:** เรนเดอร์จุดเฉพาะเมื่อ `!asChild` เท่านั้น เพราะ `Slot.Root` รับลูกได้ตัวเดียว การแทรกจุดเป็น sibling จะพัง Slot การเรนเดอร์จุดจึงต้องดึง `children` ออกมาเรนเดอร์เองแทนการปล่อยผ่าน `{...props}` (เฉพาะ path ที่ไม่ใช่ asChild)
- โทน contrast: จุดส้มบนปุ่ม `default` (teal) และบนปุ่ม elevated (ขาว) อ่านออกทั้งคู่ ไม่ต้องเพิ่ม ring
- ตอน `disabled` (กำลังบันทึก) `opacity-50` ของทั้งปุ่มครอบจุดไปด้วย = ถูกต้อง

**การจัดวางกับ children:** โครงปัจจุบันปล่อย `children` ผ่าน `{...props}` เข้า `Comp` โดยตรง เมื่อเพิ่ม `dirty` ต้องเปลี่ยนให้ path ที่ไม่ใช่ asChild เรนเดอร์ `{showDot && <span .../>}{children}` อย่างชัดเจน โดย `showDot = !!dirty && !asChild` และ pull `children` ออกจาก `props` เพื่อไม่ให้ซ้ำ ต้องคง `data-slot`/`data-variant`/`data-size`/`aria-label`/`tooltip` wrapper เดิมทั้งหมด

### 3.2 โชว์เคส `/theme`

เพิ่มตัวอย่างปุ่มที่มี `dirty` ใน `src/pages/Theme/index.tsx` ในโซนที่โชว์ `Button` (ตามกฎ: แก้ default/เพิ่ม prop ของ primitive ต้องอัปเดตโชว์เคสในการเปลี่ยนแปลงเดียวกัน) — โชว์คู่ปุ่ม `dirty={false}` vs `dirty={true}`

## 4. การเดินสาย dirty รายหน้า

### 4.1 EditProduct / EditBundle (มีธงแล้ว)
มี `const [isDirty, setIsDirty]` อยู่แล้ว, `setF`→true, บันทึกสำเร็จ→false ครบ **แค่เติม `dirty={isDirty}`** ที่ปุ่มบันทึก ไม่ต้องแตะ logic เดิม (leave-confirm / beforeunload ฯลฯ)

### 4.2 ฟอร์มตั้งธง — pattern มาตรฐาน (ShopTab, ReceiptSettingsTab, DocumentSettingsTab)
1. `const [isDirty, setIsDirty] = useState(false)`
2. ใน `setF` (setter จุดเดียวของฟอร์ม) → เพิ่ม `setIsDirty(true)`
3. การโหลดค่าเริ่มต้น (`useEffect` → `setForm(...)`) **ไม่ผ่าน `setF`** จึงไม่ทำให้ dirty โดยไม่ตั้งใจ — ต้องคงไว้แบบนี้
4. บันทึกสำเร็จ → `setIsDirty(false)` (ในบล็อก try หลัง await save สำเร็จ ไม่ใช่ใน finally เพราะ finally รันแม้ error)
5. ต่อ `dirty={isDirty}` ที่ปุ่ม:
   - **ShopTab**: ปุ่มอยู่ใน JSX ของตัวเอง (SectionCard `right`) — เติมตรง ๆ
   - **ReceiptSettingsTab / DocumentSettingsTab**: ปุ่มถูกสร้างในลูกแล้วยกผ่าน `onActions` ใน effect ที่ผูก `actRef` — เติม `dirty={isDirty}` ที่ node ในนั้น **และเพิ่ม `isDirty` เข้า dependency array ของ effect** (ปัจจุบันเป็น `[onActions, saving]` → เป็น `[onActions, saving, isDirty]`) มิฉะนั้น node จะไม่รีเฟรชเมื่อ dirty เปลี่ยน

### 4.3 SalesTab (registerSave — ปุ่มอยู่ที่พ่อ)
ปุ่มบันทึกของ sales เรนเดอร์ที่ `src/pages/Settings/index.tsx` บรรทัด ~62 โดยลูกส่งขึ้นแค่ `salesSaveFn` + `salesSaving` ดังนั้น dirty ต้องยกขึ้นพ่อเช่นกัน:
1. ใน `SalesTab.tsx`: `const [isDirty, setIsDirty]`, `setF`→true, save สำเร็จ→false
2. เพิ่ม prop `setDirty?: (v: boolean) => void` (ก๊อป pattern เดียวกับ `setSaving`) แล้ว `useEffect(() => setDirty?.(isDirty), [isDirty, setDirty])` — หรือเรียก `setDirty` ตรงจุดที่ setIsDirty (เลือกวิธีที่ไม่เกิด render loop; effect ที่ผูก `[isDirty]` ปลอดภัยสุด)
3. ใน `Settings/index.tsx`: เพิ่ม state `const [salesDirty, setSalesDirty] = useState(false)`, ส่ง `setDirty={setSalesDirty}` ให้ `<SalesTab>`, และปุ่มบรรทัด ~62 เติม `dirty={salesDirty}`

### 4.4 LabelDesigner (snapshot compare — setter หลายทาง)
`form` ถูกแก้จากหลายทาง (`setF`, `nudge` ปุ่มลูกศร, `applySizeTemplate` เปลี่ยนขนาด, reset) การตั้งธงทุก setter เปราะ → ใช้เทียบ snapshot:
1. เก็บ baseline ของ form ตอนโหลดเสร็จ และหลังบันทึกสำเร็จ:
   - `const savedRef = useRef<string>('')` เก็บ `JSON.stringify(form)` (หรือ serializer ที่ stable)
   - ตอนโหลด form ครั้งแรก (จุดที่ `setForm(loaded)`) → set `savedRef.current = JSON.stringify(loaded)`
   - ใน `handleSave` หลัง `await saveLabelSettings` สำเร็จ → `savedRef.current = JSON.stringify(form)` (จับ form ที่เพิ่ง persist)
2. `const isDirty = JSON.stringify(form) !== savedRef.current` (คำนวณตอน render; form เป็น object เล็ก JSON.stringify ทุก render ยอมรับได้ หรือใช้ `useMemo` ผูก `[form]`)
3. ต่อ `dirty={isDirty}` ที่ปุ่มบันทึก **ทั้ง 2 ทางเรนเดอร์**:
   - ทาง `onActions` (actRef effect, บรรทัด ~272) — เติม `dirty` + เพิ่ม `isDirty`/`form` เข้า dep ของ effect ที่ผูก node (ปัจจุบัน `[onActions, saving]`)
   - ทาง `previewActions` inline (บรรทัด ~293, กรณี `!onActions` = ฉลากเปล่าใน PrintTab) — เติม `dirty` ตรง ๆ (รีเรนเดอร์ตาม isDirty อยู่แล้ว)
4. ระวัง `savedRef` ต้องรีเซ็ตเมื่อสลับ `profile` (drug ↔ blank) หรือโหลด form ชุดใหม่ — ผูก baseline กับจุดที่ form ถูกโหลดใหม่จริง เพื่อไม่ให้ค้าง dirty ข้าม profile

## 5. Key/interface

- `Button` เพิ่ม `dirty?: boolean` (optional, default undefined = ไม่มีจุด) — backward compatible ทุก call site เดิมไม่กระทบ
- `SalesTab` เพิ่ม prop `setDirty?: (v: boolean) => void` (optional)
- ไม่มีการเปลี่ยน schema / IPC / payload allow-list ใด ๆ — งานนี้เป็น renderer/UI ล้วน

## 6. Invariant ที่ต้องระวัง (จาก CLAUDE.md / docs/claude)

- **ไม่มี emoji** ในโค้ด/UI — ใช้ `<span>` วงกลม token ไม่ใช่อักขระ emoji
- **สีต้องเป็น semantic token** — `bg-warning` เท่านั้น ห้าม `bg-orange-*`/literal
- **ขนาดเป็น rem** — `size-2` ห้าม hardcode px
- **แก้ primitive → อัปเดตโชว์เคส `/theme`** ในการเปลี่ยนแปลงเดียวกัน
- **อ่าน `docs/claude/ui-theming.md` + `ui-components.md`** ก่อนแตะ `button.tsx`
- **ไม่มี animation** เว้นแต่เสนอ+อนุมัติภายหลัง
- **Tailwind v3 bracketed syntax** ถ้าต้องใช้ CSS var (คาดว่าไม่ต้อง)
- **setIsDirty(false) ต้องอยู่ใน path สำเร็จ** ไม่ใช่ finally (finally รันตอน error ด้วย → จะลบจุดทั้งที่ยังไม่บันทึกจริง)

## 7. การทดสอบ (manual / in-app)

- แต่ละหน้า: เปิด → ยังไม่มีจุด; แก้ 1 ช่อง → จุดส้มขึ้น; กดบันทึกสำเร็จ → จุดหาย
- LabelDesigner: แก้ผ่านช่องปกติ, ปุ่มลูกศร nudge, และเปลี่ยนขนาดกระดาษ → จุดขึ้นทุกทาง; บันทึก → หาย; สลับ profile drug↔blank → ไม่ค้าง dirty ผิด
- SalesTab: จุดโผล่ที่ปุ่มบนแถบแม่ (Settings/index.tsx)
- โหลดหน้า (ค่าเริ่มต้นจาก DB) ต้อง **ไม่** ทำให้จุดขึ้นเอง
- `tsc` ผ่าน (มี type prop ใหม่)

## 8. ทางเลือกที่พิจารณาแล้วไม่เลือก

- **Component `<UnsavedDot/>` แยก ให้แต่ละหน้าไปวางเอง** — ไม่เลือก เพราะกระจายสไตล์ ผู้ใช้ต้องจำตำแหน่งวาง prop บน Button รวมศูนย์กว่า
- **ตั้งธงทุก setter ใน LabelDesigner** — ไม่เลือก เปราะ ตกหล่นง่าย (มี setter หลายทาง) → ใช้ snapshot
- **เปลี่ยนสีทั้งปุ่มเป็น warning ตอน dirty** — ผู้ใช้เลือกจุดนำหน้าแทน (เด่นน้อยกว่า รบกวนสายตาน้อยกว่า)
- **จุดมุมขวาบนแบบ notification badge** — ผู้ใช้เลือกจุดนำหน้าข้อความแทน
