# UI Theming

## Tailwind syntax trap (HARD)

Project is on **Tailwind v3.4.4**, not v4. Arbitrary values for CSS variables must use **bracketed syntax**:

- ✅ `w-[var(--radix-select-trigger-width)]`
- ❌ `w-(--radix-select-trigger-width)` ← v4 shorthand, **silently dropped** in v3 (no error, just no CSS emitted)

Same trap for `min-w-`, `max-w-`, `h-`, `min-h-`, `max-h-`, `bg-`, `text-`, `origin-`, etc. with CSS vars. shadcn CLI generated several primitives with v4 syntax — when touching `src/components/ui/*`, audit for this pattern. If a class "isn't doing anything", check whether it's v4 shorthand first.

## Dependency installation

`npm install` rebuilds native modules and breaks the `better-sqlite3` prebuilt binary. To add a library, use `npm install <pkg> --ignore-scripts` and verify `node_modules/better-sqlite3/build/Release/better_sqlite3.node` still exists. `framer-motion` was added this way for Tabs animation.

## Theming rules (HARD — do not break)

The app must be re-themable by editing one file (`src/index.css`). To keep that guarantee:

1. **Never use Tailwind palette literals for colors.** Forbidden: `bg-blue-500`, `text-slate-600`, `border-amber-200`, `from-red-50`, `hover:bg-emerald-100`, `ring-sky-400`, etc. Use semantic tokens only:
   - Brand: `bg-primary`, `bg-primary-soft`, `bg-primary-soft-hover`, `border-primary-soft-border`, `bg-primary-strong`, `text-primary-foreground`, `hover:bg-primary-hover`
   - Text: `text-foreground` (strong), `text-muted-foreground` (secondary), `text-foreground-subtle` (placeholder/disabled)
   - Surface: `bg-background`, `bg-card`, `bg-muted`, `bg-surface-hover`, `border-border`, `border-border-strong`
   - Status: `bg-success`/`bg-success-soft`/`text-success`, `bg-warning`/`bg-warning-soft`/`text-warning-strong`, `bg-destructive`/`bg-destructive-soft`/`text-destructive`
   - Sidebar: `bg-sidebar`, `text-sidebar-foreground`, `bg-sidebar-accent`, `text-sidebar-primary-foreground`
   - Opacity modifiers on semantic tokens are allowed: `bg-primary/30`, `border-warning/40`, `text-destructive/80`
2. **Need a token that doesn't exist? Add it.** Add the variable to BOTH `:root` and `.dark` in `src/index.css`, then register it under `colors` in `tailwind.config.js`. Token names describe the *role* (`--success`, `--primary-soft`) — never the shade (`--blue-500` is forbidden).
3. **No local UI components in page files (HARD).** Any JSX helper component defined at module scope inside `src/pages/` is forbidden — no exceptions. If it could be used in more than one place, add it to `src/components/ui/`. Available global helpers: `SectionCard` (card.tsx), `FormField` (label.tsx), `NativeSelect` (select.tsx), `Toggle` (switch.tsx). Before writing a new helper in a page file, check `src/components/ui/` first.
4. **Never write raw HTML UI elements.** Use `src/components/ui/` components exclusively:
   - `<button>` → `<Button variant="...">` — always, no exceptions
   - `<input>` → `<Input>`
   - `<select>` → use `Select` component or `<Input>` workaround
   - custom toggle div → `<Switch>`
   - raw dialog/modal → `<Dialog>` with `<DialogContent>`, `<DialogHeader>`, `<DialogTitle>`, `<DialogBody>`, `<DialogFooter>`
   - If a needed variant is missing, add it to the existing component file (e.g., new entry in `buttonVariants.variant`). Do not work around it with raw elements.
5. **Dialog structure is mandatory.** Every `<DialogContent>` must contain `<DialogHeader>` + `<DialogTitle>` (accessible title — Radix requirement), `<DialogBody>` (main content), `<DialogFooter>` (action buttons). Body layout inside `DialogBody` may use flex/grid as needed. Override default padding with `className` (twMerge handles conflicts).

5a. **Dialog height is ALWAYS fixed — never auto/content-driven (HARD).** Every `<DialogContent>` must declare a bounded height. The `<DialogBody>` then handles overflow with `overflow-y-auto` (or `overflow-hidden` + an inner scroll area) so long content scrolls *inside* the dialog, not the whole dialog resizing.
   - **Never** omit the height and let the dialog grow/shrink with its content — this causes jarring layout jumps when state changes (e.g. validation errors appearing, list items loading, tabs switching).
   - **Prefer a viewport cap `max-h-[Xvh]` (e.g. `max-h-[80vh]`, `max-h-[88vh]`) over a fixed-px `h-[Npx]`.** The body inside is rem-based, so it grows ~1.13× when the root font goes 16px→18px (and the operator changes the root up/down to taste until the real build — see [Font-relative sizing](#font-relative-sizing)). A fixed `h-[560px]` frame does NOT grow with it → the content overflows the frame. `vh` is tied to the window, not the font, so the frame stays safe at any font size while `1fr`/`overflow` scroll the body. Avoid `h-[Nvh]` *forced* full-height too unless the dialog is genuinely meant to fill — `max-h` lets it shrink to content when short. (Confirmed-broken examples we fixed: POS payment/adjust/return + AdjustStock all moved `h-[Npx]`→`max-h-[Xvh]`.)
   - If a dialog's height is deliberately tied to a **row count** (e.g. "show ~10 rows then scroll"), use a **rem** height (`h-[25rem]`), not px — rem scales with the rows (which are also rem) so the visible row count stays constant at every font size. (Example: `SaleDetailDialog` table container.)
   - For dialogs with multiple steps or tabs, cap the height to the tallest expected step so the dialog frame stays still.
   - The one exception is a dead-simple confirm/alert dialog (no body content, just a message + 2 buttons) — those may be `h-auto` but must still have `max-h-[80vh]`.

6. **Modal interaction contract (HARD).** Applies to every modal — no exceptions.
   - **Outside-click does NOT close.** Already enforced inside `dialog.tsx` via `onPointerDownOutside`/`onInteractOutside` `preventDefault()`. Do NOT pass replacements that re-enable closing.
   - **Esc closes** (Radix default — leave on).
   - **Enter triggers the primary OK action** when the modal has one. For multi-step modals where Enter on a working input advances to the next step (e.g. POS return/adjust qty → "เพิ่มในรายการ"), that's fine; the final confirm still needs a click.
   - When adding a new modal, wire Enter on the primary input or via `onKeyDown` on the dialog body — call the same handler the OK button calls.
7. Tailwind utilities for layout/spacing/typography (`flex`, `gap-2`, `text-sm`, `rounded-xl`) are encouraged — only **color literals** are banned. **Do NOT use `tabular-nums`** (project decision — fully removed from the codebase as of 2026-06-05; don't reintroduce it).
8. **Icon sizing inside `<Button>` — use `size-N`, never `h-N w-N`.** `button.tsx` has `[&_svg:not([class*='size-'])]:size-4`, which silently snaps any descendant svg without `size-` in its className to 16px. `h-7 w-7` does not contain `size-`, so the rule still matches and — being more specific — overrides your value. Always write `<Icon className="size-7" />`, including arbitrary values (`size-[22px]`, not `h-[22px] w-[22px]`). Doesn't apply to icons in `<Input>`/`<Label>`/`<DialogTitle>`/plain `<div>`/raw `<button>` (not the Button component), or to the Button element's own outer dimensions.
9. **ขนาดตัวอักษร — ลำดับชั้นตามบทบาท (ไม่ใช่ห้าม `text-xs` อีกต่อไป).** ใช้ขนาดตามบทบาทของข้อความ ไม่ใช่ตาม "อันไหนดูดี":
   - **หัวข้อ / title → `text-base` ขึ้นไป** (`text-base`, `text-lg`, `text-xl`, …)
   - **เนื้อหาหลัก (body, ค่าในตาราง, label, ปุ่ม) → `text-sm`** — ขนาดมาตรฐานของเนื้อหา
   - **`text-xs` = ข้อความที่ *รองจากเนื้อหา*** — อนุญาตให้ใช้ได้กับ: คำอธิบายย่อย/helper text, caption, status bar แสดงสถานะ, meta/timestamp, chip & status ใน `<Badge>`. อย่าใช้ `text-xs` กับเนื้อหาหลักหรือหัวข้อ.
   - ห้ามใช้เล็กกว่า `text-xs` (เช่น `text-[10px]`, `text-[11px]`, `text-[13px]`) — `text-xs` คือเล็กสุด.

10. **Scrollbar — บาง(6px) ทั้งโปรแกรม ขนาดเดียว ห้ามมีขนาดอื่น (HARD).** global `::-webkit-scrollbar` ใน `src/index.css` ตั้งเป็น `w-[6px] h-[6px]` แล้ว ทั้งแอปจึงบางโดยอัตโนมัติ — ไม่ต้องคอยใส่คลาสเอง. utility `.scrollbar-thin` (6px เท่ากัน, ใช้อยู่ ~40 จุด) ใช้ต่อได้เพื่อความชัดเจน. **ห้าม** กำหนดความกว้าง scrollbar อื่น หรือเขียน `::-webkit-scrollbar` ขนาดอื่นที่ใดก็ตาม.

11. **รูปแบบวันที่ — `DD/MM/YYYY` รูปแบบเดียวทั้งโปรแกรม (HARD).** วันที่ที่แสดงต่อผู้ใช้ **ต้อง** ผ่าน `formatDate()` (`src/lib/utils`, default `DD/MM/YYYY`) เสมอ — หรือ `formatDateTime()` เมื่อมีเวลา (`DD/MM/YYYY HH:mm`). ใช้ **ค.ศ.** ไม่ใช่ พ.ศ.
    - **ห้าม** render ISO ดิบ (เช่น `{row.expiry_date}` → โชว์ `2026-06-13`), ห้าม `toLocaleDateString`, ห้ามใส่ `formatDate(x, '…')` ด้วย pattern แสดงผลอื่น (เช่น `'D MMMM BBBB'`, `'D MMM BB'`) สำหรับ date field.
    - **Incident:** หน้าสรุปใน GR wizard เคยโชว์วันหมดอายุเป็น `2026-06-13` (ISO ดิบ) เพราะ render `{row.expiry_date}` ตรง ๆ — ต้องเป็น `{formatDate(row.expiry_date)}`.
    - **ข้อยกเว้นโดยตั้งใจ (ไม่ใช่ date field):** label ของ *date picker* / แกนกราฟ ใช้ชื่อเดือนไทย (เช่น `multi-date-picker`, `trend-chart` — `BBBB`/`MMM BB`) เพื่อการนำทาง; เอกสารพิมพ์ (ใบเสร็จ/ใบกำกับภาษี/ใบรับสินค้า — แผ่นพิมพ์ React `taxInvoiceSheet.tsx` + `GoodsReceiptPrintDialog.tsx` ใช้ `'D MMMM BBBB'`) ใช้วันที่แบบทางการไทย. สองกลุ่มนี้คงไว้ตามเดิม.

12. **สัญญาของ `DateInput` (input วันที่) — invalid = `''`, เตือนด้วยกรอบแดง, required เช็คเองที่ parent (HARD).** `src/components/ui/date-input.tsx` ตรวจ "วันที่มีจริง" (เดือน 1-12, วันไม่เกินจำนวนวันของเดือน รองรับ leap year, ปี 1900-9999) ผ่าน `displayToIso()` แล้วบังคับสัญญา 3 ข้อ — **ห้ามถอยกลับ**:
    - **`onChange` คืน ISO เมื่อ valid เท่านั้น; กรณีอื่นทั้งหมด (พิมพ์ค้าง, ครบ 10 ตัวแต่ไม่ใช่วันจริงเช่น `99/99/9999`, ว่าง) คืน `''`.** อย่าปล่อยให้ค่ามั่วค้างใน parent (เคยเป็น: คืนเฉพาะตอนว่าง → เลขมั่วทิ้ง parent ไว้ที่ค่า default/ค่าเก่าที่ valid แล้ว "ผ่าน" submit เงียบ ๆ). สรุป: ค่าที่ commit มีแค่ "ISO ที่ถูกต้อง" หรือ "ว่าง" — ค่ามั่วไม่มีทางไหลลง DB.
    - **กรอบแดง (`aria-invalid` → `border-destructive` ใน `input.tsx`) โชว์เมื่อ:** `rawInvalid` (มีข้อความค้าง && ไม่ใช่วันสมบูรณ์) && (ไม่ได้ focus อยู่ ‖ พิมพ์ครบ 10 ตัว). อิง `focused` (ไม่ใช่ flag `blurred` ที่ reset ทุกคีย์ — เคยเป็นบั๊กกรอบแดงไม่ขึ้นตอนพิมพ์ตกตัวแล้วกดบันทึกเร็ว ๆ). ระหว่างพิมพ์ที่ยัง focus + ยังไม่ครบ 10 → ไม่เตือน (กันกระพริบ); ออกจากช่องแล้วยังไม่ครบ/ผิด → แดง (กันเคส **พิมพ์ตกไป 1 ตัว** `13/06/206` ที่ coerce เป็น `''` แล้ว exp หายเงียบ). `onFocus`/`onBlur` ของ caller ถูก merge ต่อ (destructure ออกแล้วเรียก `?.(e)`). **ห้าม** ใส่ข้อความ error ใต้ช่อง (ดัน layout ของ field สูงคงที่ → UI เสีย) — ใช้กรอบแดงอย่างเดียว.
    - **เพราะ invalid = `''` ช่องที่ required ต้องเช็ค `!value` เองที่ parent ตอน submit** (เช่น `if (!receiveDate) { toast(...); return }`). DateInput ตั้งใจไม่ block submit ให้ (ไม่มีจุดคอขวดกลาง — ปุ่มบันทึกอยู่ในแต่ละฟอร์ม). ช่อง *optional* (วันหมดอายุที่สินค้าไม่มี exp ได้, `manufactured_date`, `dob`, `paidDate`/`orderDate` ตอนยังไม่ชำระ/ซื้อสด) จงใจไม่เช็ค — เว้นว่างได้. เส้นแบ่งคือ "ธุรกิจอนุญาตให้เว้นว่างไหม" ไม่ใช่ "เป็นช่องวันที่หรือเปล่า". ดู [[date-input-validation-contract]].
    - **กรณีลืมกรอก (required แต่ว่าง) `rawInvalid` เป็น `false` → กรอบแดงในตัวไม่ขึ้น** (ต้องมี text ก่อน). prop `error?: boolean` (parent-driven) บังคับกรอบแดงให้ — parent set ตอน submit ที่ขาด, **ล้างตอน `onChange`**. แนวที่ถูก: เก็บ flag ทุกช่องที่ขาด → ติดกรอบแดง **ทุกช่อง**พร้อมกัน + **toast ระบุชื่อช่องชัด ๆ** (เช่น `กรุณาระบุวันที่รับสินค้า · วันครบกำหนดให้ถูกต้อง`) ไม่ใช่ข้อความรวม `'รูปแบบวันที่ไม่ถูกต้อง'` แบบเดิมที่ผู้ใช้ต้องไล่หาช่องเอง. ref: `src/pages/Purchase/index.tsx` (`dateErrors` state). ยังคงกรอบแดงอย่างเดียว ไม่มีข้อความใต้ช่อง.

13. **ขอบกล่อง framed/stat/tinted — ใช้ `border` ทั้งหมด ไม่ใช่ `ring` (HARD).** ทุกกล่องมีกรอบ (stat/profit/cost/แถว setting มีกรอบ, Card, Input, กล่อง tinted) ใช้ `border` (`border border-success/30`, `border-border`, …) — **`ring` สงวนไว้เคสเดียว = TabStrip `toggle`** (ปุ่มต้อง `h-full` เต็ม h-9 bar โดยขอบไม่กินความสูง — มี doc ใน `ui-components.md`). อย่าเอา ring ไปใช้กับกล่อง framed อื่น (ทน print/overflow กว่า + เป็น norm ของแอป).
    - **นิยามความสูง: `h-N` บน element ที่มีขอบ = ความสูง "นอก" รวมขอบแล้ว** (`box-sizing: border-box` ทั้งแอป). ขอบ 1px บน+ล่าง กิน 2px เข้าใน → **content = h−2px เป็นปกติ ไม่ใช่บั๊ก**. ตัวเลข px ของ `h-N` ขึ้นกับ root font-size: ที่ root 16px → `h-9`≈36px, `h-14`≈56px; ที่ root 18px (ค่าปัจจุบัน) → `h-9`≈40.5px, `h-14`≈63px. **ค่า rem คงที่ สัดส่วนคงที่ ตัวเลข px เปลี่ยนตาม font — ดู [Font-relative sizing](#font-relative-sizing)**. เวลาวัด/เทียบความสูงให้เลือก element นอกสุด.
    - **วาง `h-N` ตรงไหน:** กล่องเดี่ยวมีขอบเอง (profitBox/cost box/แถว switch มีกรอบ) → `h-N` บนตัวกล่อง = นอก h-N. แถวใน list `divide-y` (ขอบอยู่ wrapper) → `h-N` บน "แถว" (แถวไม่มีขอบเอง = วัดได้ h-N พอดี), wrapper บวกขอบนอกอีก ~2px. ดู [[feedback_border_over_ring]], [[checkbox-row-conventions]].

## Font-relative sizing (HARD)

**ขนาดทุกอย่างใน UI เป็น font-relative (rem) — ห้าม hardcode px มาชดเชยเวลา font เปลี่ยน.**

root font-size อยู่ที่ `html { font-size: … }` ใน `src/index.css` (ปัจจุบัน **18px**) และ **เจ้าของปรับขึ้น/ลงเรื่อย ๆ ตามความเหมาะกับสายตา จนกว่าจะ build จริง** (เปลี่ยนผ่านหน้า `/css` → `settings:saveThemeFontSize` ซึ่งเขียนทับบรรทัดนี้). ดังนั้น:

- คลาส Tailwind spacing/size/typography (`h-9`, `h-12`, `text-sm`, `size-4`, `gap-2`, `p-4`, …) เป็นหน่วย **rem** → สเกลตาม root อัตโนมัติ. **กฏความสูงทั้งหมด (บาร์ `h-12` / control `h-9`, ดู `ui-table-card.md`) ไม่ต้องแก้เมื่อ font เปลี่ยน** — บาร์กับ control ขยายพร้อมกัน สัดส่วนคงเดิมทุกขนาด.
- **ห้าม hardcode px เพื่อ "ตรึง" ขนาดกลับ** เช่นเห็นปุ่มสูง 40.5px แล้วใส่ `h-[36px]` ให้เท่าเดิม — ตัวนั้นจะกลายเป็นตัวเดียวที่ไม่สเกล แล้วเพี้ยนกับของรอบข้าง. คิดเป็น rem-token เสมอ ไม่ใช่ px.
- **ตัวเลข px ใด ๆ ที่อ้างใน doc/โค้ดคอมเมนต์เป็นค่า "ที่ root 16px" เพื่อยกตัวอย่างเท่านั้น ไม่ใช่กฏ** (`h-9`=36px จริงเฉพาะตอน 16px; ตอนนี้ 18px → 40.5px). กฏคือชื่อคลาส rem ไม่ใช่ตัวเลข px.
- **px ที่ถูกต้องใช้ได้** = ค่าที่ตั้งใจให้ "ไม่สเกลตาม font" เท่านั้น: งานพิมพ์ A4/สลิป/label (px/pt เชิงกายภาพ), เส้นขอบ/divider 1-2px, scrollbar 6px, ความสูงกราฟ, มิติ window chrome (TitleBar). อย่าเอา px ไปใช้กับโครง layout ที่มีตัวอักษร rem อยู่ข้างใน.
- **เลือกหน่วยเมื่อต้อง bound ขนาด:** modal/dialog ต้องไม่ล้นจอ → `max-h-[Xvh]` (อิง viewport ไม่อิง font); กล่องที่ล็อกจำนวนแถว → `h-[Nrem]` (สเกลพร้อมแถว, คงจำนวนแถวที่เห็น). ดู §5a.

> Incident (2026-06-23): เปลี่ยน root 16px→18px แล้ว Dialog ที่ตั้ง `h-[Npx]` คงที่ (POS payment/adjust/return + AdjustStock) เนื้อในล้นกรอบ; แก้เป็น `max-h-[Xvh]` + ตาราง 10 แถวใน `SaleDetailDialog` เป็น `h-[25rem]`; `TitleBar` `text-[10px]`→`text-xs`. รากเหง้า = px ตายตัวปนกับเนื้อหา rem.

## ELEVATED — the primary surface treatment (HARD)

The house style for controls and panels is the elevated look: `bg-card` + `border border-border` + `shadow-sm`. It reads as a raised card sitting on the background.

**This is now the DEFAULT for inputs — `Input` / `Textarea` / `SelectTrigger` render elevated when you pass no variant.** The migration flipped each primitive's `default` code to the elevated styling and added a separate `variant="filled"` for the old flat `bg-input`/`bg-muted` look. So:
- A bare `<Input>` / `<Textarea>` / `<SelectTrigger>` (and `SearchInput`) is already correct — **do NOT hand-add `variant="elevated"`** any more (it's a kept alias, identical to default; redundant on new code, harmless on old).
- The bare flat look is the *exception*, opt in with `variant="filled"`, only where a recessed/inset field is deliberately wanted (e.g. dense inline-edit cells). When you spot a field that looks wrong after the flip (was intentionally flat), add `variant="filled"`.
- Why flip the `default` value instead of deleting the `"default"` token? Non-breaking: no call site hardcoded `variant="default"` on these three (all bare inputs just omit the variant), and `"default"`/`"elevated"` both still compile. See [[input-elevated-default-flip]].

Secondary action **Buttons** (the one paired *next to* a primary action, e.g. "ยกเลิก/กลับ" beside "บันทึก") still use `variant="elevated"` explicitly — Button was NOT part of the flip. See [[dialog-button-convention]]. **`elevated` is never used as the only button** — a lone footer button takes the primary role (`default` for neutral/close/OK, `destructive` for negative). Filter-strip controls are the `h-9` cluster (search + category select + filter/column popovers).

**The live reference is `src/pages/Products/EditProduct/GeneralTab.tsx`.**

**The one exception — Button `default`.** Button's `default` variant is the primary teal CTA (save / confirm / pay) and must stay that way. The default-flip above is about *inputs/surfaces*, not action buttons. Do NOT swap Button defaults to elevated.

> **Why not just make `elevated` the literal default value of the variant prop?** Considered and rejected: (1) Button's default can't move (it's the CTA). (2) Flipping Input/Select/Textarea defaults would silently restyle every existing call site that relies on `bg-input`, with no type-checker to catch regressions — you'd have to audit and re-tag every inset field by hand. The convention + showcase + copying from EditProduct is the lower-risk enforcement. If the codebase ever reaches ~95% elevated, revisit as a deliberate migration (rename `default`→`inset`/`filled`, flip the default value, sweep call sites).

## Color palette & variants — USE THE FULL RANGE (HARD)

We have a rich palette far beyond `primary` / `secondary` / `destructive`. **Don't default to those three everywhere — the app should feel colorful and varied.** Pick variants by *role*, not "what's the most neutral option."

### `<Button>` variants (`button.tsx`) — current set

Solid / primary roles:
- `default` — primary teal · main CTA, save, confirm
- `secondary` — white/gray with border · cancel, dismiss
- `accent` — yellow `#F5C24A` · accent CTA, attention (this is the variant formerly called `tertiary`)
- `success` — green · positive confirm (e.g. "เพิ่มสต็อก")
- `warning` — solid orange · caution CTA
- `info` — solid blue
- `destructive` — solid red · delete, void
- `violet` / `teal` — decorative solids (cool)
- `amber` / `sand` — warm decorative solids (`amber` = deep gold, distinct from yellow `accent`; `sand` = warm-neutral tan, an alternative to cool greys)

Soft / tinted:
- `primary-soft` — light teal soft · subtle brand emphasis (this absorbed the old `brand-soft`)
- `info-soft` — light blue · info-style action, e.g. "ปรับสต็อก"
- `accent-soft` — soft amber/yellow · warm secondary (this is the former `warm`, renamed)
- `destructive-soft` — soft red tint · destructive secondary (the slot next to a `destructive` primary; this is the real variant — the old `destructive2` name does NOT exist in `button.tsx`)
- `success-soft` / `violet-soft` / `teal-soft` / `amber-soft` / `sand-soft`

Outline family (soft fill + role-colored hairline border) — `primary-outline`, `accent-outline`, `success-outline`, `info-outline`, `warning-outline`, `destructive-outline`, `violet-outline`, `teal-outline`, `amber-outline`, `sand-outline`, `neutral-outline`, `muted-outline`.

Neutral / low-emphasis:
- `outline` — muted bg, transparent border · neutral icon buttons · **the standard for row "แก้ไข" (edit) action buttons**
- `mutedborder` — muted bg with a stronger border
- `ghost` — transparent · minor actions
- `link` — text-only

Elevated (the house raised look — only as the **secondary** beside a primary, never lone): `elevated`, `elevated-destructive`, `elevated-warning`.

> **Renames (do not use the old names):** `tertiary` → `accent`; `brand-soft` → `primary-soft`; `warm` → `accent-soft` (cream/amber soft token, role name `accent-soft`); the old ordinals `quaternary/quinary/senary` → `primary-soft/info-soft/accent-soft`. Token values are unchanged.

### `<Badge>` variants (`badge.tsx`)

Badge shares the same role names as Button (minus the `elevated*` / `mutedborder` button-only ones), including the full `*-soft` and `*-outline` families and `neutral-outline` / `muted-outline`. Use for tags, statuses, FDA labels (`ข.ย.13`), tier markers.

### Semantic color tokens (`index.css` — defined in both `:root` and `.dark`)

- Warm decorative: `amber` (deep gold) + `sand` (warm-neutral tan) — each with `-foreground` / `-soft` / `-strong`, same 4-token shape as `violet`/`teal`. Soft variants render `text-amber-strong`/`text-sand-strong` on the soft surface.
- Brand: `primary`, `primary-soft`, `primary-soft-hover`, `primary-soft-border`, `primary-strong`, `primary-hover`, `primary-foreground`
- Accent (yellow): `accent`, `accent-foreground` (no `tertiary` — that name is gone). `accent-soft`/`accent-soft-hover`/`accent-soft-foreground` = the soft cream/amber surface (formerly `warm`)
- Neutrals: `background`, `card`, `muted`, `muted-hover`, `popover`, `secondary`
- Decorative surfaces: `primary-soft` (light teal), `info-soft` (light blue), `accent-soft` (warm amber, formerly `warm`) — each with `-foreground` / `-hover`
- Radius: `--radius-card` (→ `rounded-card`, the single source of truth for card/panel corners) and `--radius-control` (→ `rounded-control`, buttons/inputs). Change card roundness app-wide by editing `--radius-card` in `index.css` only.
- Status: `success`/`success-soft`, `warning`/`warning-soft`/`warning-strong`, `destructive`/`destructive-soft`/`destructive-strong`
- Text: `foreground`, `muted-foreground`, `foreground-subtle`
- Sidebar: `sidebar`, `sidebar-accent`, `sidebar-primary`, `sidebar-ring`

### When writing new UI — guidelines

1. **Differentiate actions by tint.** "Edit" `outline`, info/details icon `accent-soft`, external-link icon `primary-soft`, "Adjust stock" `info-soft`, "Delete" `destructive`, primary save `default`, secondary toggle `accent`. See the row-action rule in `ui-table-card.md` for the canonical square icon-button pattern.
2. **Decorative chips/status badges** → reach for `accent`/`primary-soft`/`info-soft`/`accent-soft` before falling back to `secondary` or grey.
3. **Section accents / soft backgrounds** → `bg-primary-soft`, `bg-info-soft`, `bg-accent-soft` (NOT `bg-muted` for everything).
4. **Hover states** → use the matching `-hover` token (`primary-hover`, `primary-soft-hover`, etc.) — already wired into the Button variants.
5. **Missing role?** Add a new variant to `buttonVariants`/`badgeVariants` AND a matching token to `:root` + `.dark` in `index.css`. Never hardcode hex or Tailwind palette literals.

## Canonical primitive defaults

These are baked into the components — **no override needed**:

- **`Tabs`** — default variant = segmented (equal-width grid, sliding `primary` pill via `framer-motion` `layoutId` per-`TabsList` `useId()`). `pill` for sub-nav, `line` for tight underline. All variants use `primary` as the active color. Three variants only — `segmented` was renamed to `default`.
- **`Select`** — popper position with `sideOffset={6}`, chevron rotates 180° when open (via `group-data-[state=open]:rotate-180`), panel width = trigger width, items have inset highlight (panel `p-2`), check icon on the right when selected (`pr-9` on items).
- **`Table`** — `TableHead` is `sticky top-0 z-10 bg-muted text-foreground-subtle shadow-[0_1px_0_var(--border)]`. `TableRow` hover `bg-primary-soft/60`, selected `bg-primary-soft`. `TableCell` `py-1 px-2`. `<Table containerClassName="max-h-[NNNpx]">` makes the body scroll while the header stays.
- **`Dialog`** — `DialogTitle` `text-xl` aligned with the X close button (`min-h-8 flex items-center`). Footer buttons commonly `size="xl"`. **Button roles by footer shape:** a *lone* button = primary role → `default` for neutral/positive ("ปิด/ตกลง/บันทึก/รับทราบ"), `destructive` for negative; *two* buttons = primary (`default`/`destructive`) + a secondary `elevated` ("ยกเลิก/กลับ"). `elevated` is never the only button; `destructive-soft` is the soft-red tinted secondary slot beside a `destructive` primary (the old `destructive2` name does NOT exist in `button.tsx`). `Switch` inside modals = `size="lg"`. → see [[dialog-button-convention]] in `docs/claude/ui-theming.md`.
- **`DateInput` / `DateRangePicker`** — `h-10` wrapper default, `bg-input rounded-lg`, calendar icon absolute on the right (`right-2.5`). **`className` targets the wrapper** (sizes the whole component); the inner Input/Button is `h-full w-full`. Don't pass `className="h-X"` to the Input — it'll desync the calendar button position.
- **Card radius** — every floating panel-card uses `rounded-card` (`--radius-card`, 1rem). Every control / control-panel (Button, Input, SelectContent, PopoverContent) uses `rounded-lg` / `rounded-control` (`--radius`, 0.5rem). Don't mix `rounded-xl` / `rounded-2xl` literals; reach for the tokens.
