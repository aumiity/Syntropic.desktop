---
name: project_theme_variant_audit
description: /theme showcase rebuilt from cva as SSOT — Button/Badge done (2/33 sections); secondary removed; neutral-outline renamed to neutral (flat) vs elevated (shadow).
metadata:
  type: project
---

**ACTIVE 2026-07-16 — รื้อโซนโชว์ variant ในหน้า `/theme` ให้ตรงกับ primitive จริง.**

## ทำไปแล้ว 2/33 sections — Button + Badge

หน้า `/theme` (`src/pages/Theme/index.tsx`) มี **33 `<Section>`** — จัดไป **Button กับ Badge** (2 ตัวที่ variant เยอะสุด) ที่เหลือ 31 sections ส่วนใหญ่เบากว่ามาก (Avatar/Label/Pagination/Toast แทบไม่มี variant).

**วิธีที่ใช้ (ทำซ้ำกับ section อื่นได้):** ไล่ variant จาก cva ในไฟล์ primitive = SSOT → โชว์ครบทุกตัว **ตัวละครั้งเดียว** → label = **ชื่อ variant ตรงตัว** → จัดกลุ่มตาม**พื้นผิว** ให้ Button กับ Badge เรียงล้อกันอ่านเทียบได้.

**ของเดิมที่พัง (เผื่อเจอ pattern เดียวกันใน section อื่น):** label ไม่ตรง variant (`default` เขียนว่า "Primary"), `elevated` โผล่ 2 แถวด้วยชื่อมั่ว ("Status"/"Method"), หัวข้อแถวโกหก ("no border" ทั้งที่ variant ประกาศ `border`).

## กับดักโครงสร้าง — base cva ของ Button แจก shadow ฟรี

`button.tsx` base cva มี `"shadow-sm hover:shadow-sm"` → **ทุก variant ได้เงาฟรี**. ใครจะเพิ่มปุ่ม**แบน**ต้อง `shadow-none hover:shadow-none` เอง ไม่งั้นจะกลายเป็น `elevated` โดยไม่ตั้งใจ. **บน Button มี 5 ตัวที่ปฏิเสธเงา = กลุ่ม neutral ทั้งกลุ่ม: `neutral` / `ghost` / `link` / `outline` / `mutedborder`** (2026-07-16 เจ้าของสั่งถอดเงา `outline`+`mutedborder` เพิ่ม). ตระกูล `*-outline` **รับเงาไว้หมดทุกตัว** (outline สี = ยกขึ้น ไม่ใช่แบน).

**`badge.tsx` base ไม่มี shadow เลย** → 5 ตัวเดียวกันนั้นแบนฟรีไม่ต้องประกาศอะไร. **คนละกลไกกับ Button อย่าเอา logic ข้ามกัน** — แต่**ผลลัพธ์ตรงกันเป๊ะแล้ว: `elevated` = ตัวเดียวที่มีเงา ทั้ง 2 primitive**. มีคอมเมนต์กันลืมไว้ในทั้ง 2 ไฟล์แล้ว.

## กฎ hover ของปุ่ม SOLID — โทเคนเท่านั้น ห้าม opacity (2026-07-16)

**ทุก solid variant ต้อง hover ด้วยโทเคนของตัวเอง `--<role>-hover` = เข้มขึ้น ~−7% lightness. ห้ามใช้ `hover:bg-<role>/85` เด็ดขาด.**

เดิมปนกัน 2 กลไก: 4 ตัว (primary/destructive/success/warning) ใช้โทเคน = **เข้มขึ้น**, อีก 6 ตัว (accent/info/violet/teal/amber/sand) ใช้ `/85` = **จางลง** (เพราะ opacity ไม่ได้ทำให้สีเข้ม มันแค่ปล่อยพื้นหลังทะลุขึ้นมา). **กับดักซ้อน: `/85` พึ่งสีพื้นหลัง → light จางลง / dark เข้มขึ้น = ปุ่มเดียวกัน hover กลับทิศกันคนละธีม.**

แก้แล้ว: เติมโทเคน `--accent-hover`/`--info-hover`/`--violet-hover`/`--teal-hover`/`--amber-hover`/`--sand-hover` ครบทั้ง `:root`+`.dark` → register `hover` ใน `tailwind.config.js` → เปลี่ยน 6 variant มาใช้โทเคน. จูน `destructive` (−20%→−7%) และ `warning` (−10%→−7%) ให้เท่ากันด้วย. `success` เหลือ −6% (ต่างจนมองไม่เห็น ไม่แตะ). ถอด `[a]:hover:bg-primary/80`/`accent/80` ทิ้งด้วย (opacity ตัวเดิมที่ซ่อนอยู่ในเคสปุ่ม-เป็น-ลิงก์). **ตระกูล `*-soft` ยังมี `[a]:hover:.../80` เหลืออยู่ — ยังไม่จัด.**

> **ห้ามจูน `--destructive-hover` ฝั่ง `.dark`** (คงไว้ 39%): ใน dark มันไม่ใช่สี hover แต่เป็น**สีพื้นตอนพัก** (`dark:bg-destructive-hover` ใน button.tsx+badge.tsx) แล้ว hover สว่างขึ้นไปหา `--destructive`. จูนตามกฎ = ป้ายแดงทุกอันใน dark เปลี่ยนสี. มีคอมเมนต์เตือนใน `index.css` แล้ว. ไว้รื้อตอนทำ dark mode.

## กฎสีตัวหนังสือบนพื้นทึบ — `text-<role>-foreground` เท่านั้น

`*-soft` = โทเคน**พื้นผิว** ห้ามเอามาเป็นสีตัวหนังสือ. เจอ `amber: "bg-amber text-amber-soft"` (ทองซีดบนทองเข้ม) = **contrast 2.06:1 ตก WCAG** ทั้ง Button และ Badge → แก้เป็น `text-amber-foreground` = **6.96:1** ผ่าน (โทเคนนี้คอมเมนต์ไว้เองว่า "near-brown text on gold"). ตอนนี้ solid ทุกตัวทั้ง 2 primitive ใช้ `text-<role>-foreground` ตรงกันหมดแล้ว ยกเว้น `destructive` ที่ใช้ `text-white` ตรง ๆ (= `--destructive-foreground` พอดี ผลเหมือนกัน ไม่ใช่บั๊ก).

## สัญญาที่ตกลงกันแล้ว — ใช้ร่วมทั้ง 2 primitive

| | Button | Badge |
|---|---|---|
| **ขาวแบน (ไม่มีเงา)** | `neutral` | `neutral` |
| **ขาวมีเงา** | `elevated` | `elevated` |

**`neutral-outline` เปลี่ยนชื่อเป็น `neutral` แล้ว (2026-07-16) — อย่าใช้ชื่อเก่า.** เหตุผล: มันไม่เคยอยู่ตระกูล outline จริง (outline ตัวอื่นมีเงากันหมด มันตัวเดียวที่แบน) ชื่อเดิมเลยสื่อผิดและทำให้จัดกลุ่มไม่ลง. rename 57 จุด / 38 ไฟล์ + ย้าย entry ใน cva ออกจากบล็อก outline ไปอยู่ข้าง `elevated`.

**`secondary` ถูกลบออกจากทั้ง Button และ Badge แล้ว — อย่า re-add.** (ซ้ำกับ `elevated`/`neutral`: light ต่าง 1% lightness, dark = ค่าเดียวกันเป๊ะ). **โทเคน `--secondary*` ลบออกจาก `index.css` (`:root`+`.dark`) และ `tailwind.config.js` แล้ว 2026-07-16 (เจ้าของอนุมัติ).**

> หมายเหตุ: `secondary` ที่ยังเหลือใน `tint-icon.tsx` / `MetricTint` / `SectionCard tint="secondary"` = **คนละ namespace** (map ไป `bg-muted`) ไม่ได้กินโทเคนที่ลบไป อย่าไปไล่ลบ.

## กฎ carve-out ของ Badge — variant ที่นิยามด้วย "เงา" หรือ "hover" อยู่บน Badge ไม่ได้

Badge ขาด variant 2 ชุดเทียบกับ Button **โดยตั้งใจ ไม่ใช่ของตกหล่น อย่า re-add**:

1. **`elevated-<role>` 8 ตัว** (destructive/warning/success/accent × solid,soft) — นิยามด้วย `hover:`/`aria-expanded:` ล้วน ๆ ซึ่ง `<span>` ที่ไม่ interactive ไม่มีวันติด → จะกลายเป็นชิปเทาเหมือนกัน 8 อัน.
2. **`muted-outline`** (ลบ 2026-07-16) — บน Button มันคือ `mutedborder` **แบบมีเงา** (พื้นผิวเดียวกันเป๊ะ ต่างกันที่มันไม่ปฏิเสธเงาจาก base). Badge ไม่มีเงามาแยก → **ซ้ำกันทุกพิกเซล**. ใช้ `mutedborder` แทน — ย้าย call site แล้ว **5 จุด**: ชิป "ปิด" (`EditProduct/LotsTab.tsx`), ชิป "ไม่ถูกใช้งาน" ternary ใน Settings `CategoriesTab`/`DrugTypesTab`/`UnitsTab`, และ `MOVEMENT_META` ใน `EditProduct/shared.ts` (`sale_void`+`purchase_return`, มี union type ต้องแก้ด้วย). **Button ยังเก็บทั้งคู่ไว้** เพราะยังต่างกันจริงด้วยเงา.

> **กับดัก dark mode ที่ยังค้าง (เจ้าของบอกไว้ทำทีหลัง อย่าเพิ่งไล่แก้):** `muted-outline` ไม่มี `dark:` override → ตอน dark ใช้ `--muted` ตรง ๆ ซึ่งใน `.dark` = `240 5% 96%` (**เกือบขาว**) = ชิปขาวจ้ากลางธีมมืด. `mutedborder` มี `dark:bg-input/30 dark:border-input` เลยถูกต้อง. ตอนย้าย LotsTab ไป `mutedborder` เลยได้ dark ที่ถูกมาฟรี. **`--muted` ใน `.dark` สว่างกว่า light (96% vs 92%) — น่าสงสัยว่าเป็นบั๊กโทเคน ไว้ตรวจตอนทำ dark mode.**

## โครงแถวโชว์ตอนนี้ (Button / Badge เรียงล้อกัน)

Outline (ไม่มี neutral แล้ว) → **Neutral/surface — แบน** (`neutral`, `ghost`, `link`, `outline`, `mutedborder`) → **Neutral/surface — มีเงา** (`elevated` ตัวเดียว). **สองแถวนี้สมาชิกตรงกันเป๊ะทั้ง Button และ Badge** อ่านเทียบข้างกันได้ตรง ๆ. แบ่งตามเงาแบบนี้ทำให้ `neutral` กับ `elevated` อยู่ติดกันคนละแถว → เทียบ "ขาวแบน vs ขาวมีเงา" ได้ในตาเดียว.

## ค้างไว้ — เริ่ม session หน้าจากตรงนี้

1. **ยังไม่ได้ click-test ในแอปจริง** — ยืนยันแค่ `tsc` PASS. เจ้าของบอกว่า test รอบก่อน (ปุ่มขาวแบน) ผ่านแล้ว แต่รอบ rename + จัดแถวใหม่ยังไม่ได้ดู.
2. เหลือ **31 sections** ที่ยังไม่ได้รื้อ.

## บทเรียน

**ลบ variant ต้องใช้ grep + tsc คู่กันเสมอ — อันเดียวไม่พอ ทั้งคู่มีจุดบอดคนละที่.**

- **grep ตาบอด computed:** ตอนลบ `muted-outline` grep `variant="muted-outline"` (literal) เจอแค่ **1 จุด** แต่ของจริงมี **5** — ที่หายคือ ternary (`? 'teal-outline' : 'muted-outline'`) กับตาราง meta (`shared.ts`). **tsc จับได้ครบ** เพราะตารางนั้น type แน่น. → **อย่า grep แค่ `variant="X"` ให้ grep `'X'` เปล่า ๆ ด้วย.**
- **tsc ตาบอด `any`:** ตอนลบ `secondary` เจอ **call site ค้าง 5 จุด** ที่รอบก่อนคิดว่าย้ายครบแล้ว: `SEVERITY_VARIANTS: Record<string, any>` (POS/CustomerFormDialog), `SALE_TYPE_VARIANTS: Record<string, any>` (Manage/Sales), `variant: 'secondary' as const` (EditProduct/EditBundle HistoryTab). ทั้งหมดเป็น **fallback `?? 'secondary'`** → badge render ออกมาไม่มีสี (cva ไม่รู้จักชื่อ = ได้แค่ base class) และ **หลุดขึ้น main ไปแล้ว**. เวลาลบ variant: ต้อง grep ชื่อ variant แบบ string ตรง ๆ ด้วย ไม่ใช่พึ่ง tsc — ตารางที่ประกาศเป็น `Record<string, any>` ทำให้ type check ตาบอด.

และระวัง `grep -o -h` ที่ตัดชื่อไฟล์ทิ้ง ทำให้ `| grep -v pages/Theme` กรองไม่ได้ → เคยนับ usage ผิดมาแล้วรอบนึง.

Related: [[project_ui_redesign_pass]] (งาน UI ใหญ่ที่ ACTIVE อยู่), [[feedback_read_doc_before_ui_edit]], [[card-border-default]], [[input-elevated-default-flip]], [[feedback_design_rules_2026-06]].
