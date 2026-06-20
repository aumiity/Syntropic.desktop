---
name: feedback_button_tooltip_prop
description: Button has a `tooltip` prop — use it for icon-only buttons instead of raw native `title`
metadata:
  type: feedback
---

**2026-06-12** — `Button` (`src/components/ui/button.tsx`) ตอนนี้มี prop `tooltip?: React.ReactNode` (+ `tooltipSide`, default `"top"`). ถ้าใส่ `tooltip` ปุ่มจะ auto-ครอบ `<Tooltip>` (styled, เด้งไว 200ms) ให้เอง และถ้า `tooltip` เป็น string จะตั้ง `aria-label` ให้ด้วย (accessibility ของ icon button).

**Why:** ปุ่มไอคอนล้วนในตารางเดิมใช้ native `title=` → tooltip ของเบราว์เซอร์ช้า ~1 วิ + หน้าตาดิบ ทำให้ผู้ใช้ "ไม่รู้ว่าปุ่มอะไรจนกว่าจะกด". เจ้าของขอ tooltip ทุกปุ่มในตาราง → flip มาใช้ prop เดียวให้เป็น pattern เดียวทั้งแอป (21 ไฟล์ converted: ProductsList/BundlesList/People/Settings tabs/EditProduct+EditBundle tabs/Manage tables/KhorYor9).

**How to apply:**
- ปุ่มไอคอน row-action ธรรมดา (onClick, ไม่ใช่ลูก asChild trigger): `<Button size="icon-lg" variant="elevated" tooltip="แก้ไข" …>` — อย่าใช้ `title=` ดิบอีก. ปุ่มที่ `disabled` แบบ **dynamic** (`disabled={state}`) ยังใช้ `tooltip` ได้ (เด้งตอน enabled).
- **ห้ามใส่ prop `tooltip` ตรงๆ บนปุ่มที่เป็นลูกของ `asChild` trigger** (`<PopoverTrigger asChild>` / `DropdownMenuTrigger` / `DialogTrigger`) — prop จะแทน Button ด้วย `<Tooltip>` wrapper → Slot clone ผิดตัว → พัง. **แต่ไม่ต้องคง `title` ดิบ** — ให้ **wrap nested Tooltip** แทน (ทำทั้งแอปแล้ว 2026-06-20, ~25 จุด ตัวกรอง/จัดการตาราง/ตัวเลือก/ดูหมายเหตุ):
  ```tsx
  <Popover>
    <Tooltip>
      <PopoverTrigger asChild>
        <TooltipTrigger asChild>
          <Button …>…</Button>   {/* ไม่มี title= */}
        </TooltipTrigger>
      </PopoverTrigger>
      <TooltipContent>ตัวกรอง</TooltipContent>
    </Tooltip>
    <PopoverContent>…</PopoverContent>
  </Popover>
  ```
  Tooltip = root นอกสุดใน Popover; TooltipTrigger+PopoverTrigger asChild ซ้อนกัน compose ลง Button ตัวเดียว (Radix รองรับ). import `{ Tooltip, TooltipTrigger, TooltipContent } from '@/components/ui/tooltip'`.
- ปุ่ม **disabled ถาวร** (`disabled` ตายตัว เช่น "ไม่มีหมายเหตุ"/"ไม่มีบิล/เอกสาร" ใน HistoryTab) = Radix Tooltip ไม่เด้งบน disabled (แต่ native `title` เด้งได้) → **คง native `title` ไว้** (อย่าแปลง). ถ้าจำเป็นต้อง styled ให้ wrap `<span>` ใน `<Tooltip>` เอง.
- trigger ที่ไม่ใช่ `<Button>` (`<Badge>`/`<span>`, หรือ rich content เช่นช่องต้นทุน/กำไร) คงเป็น manual `<Tooltip>` wrap — `Badge` ไม่มี `forwardRef` เป็น asChild ตรงๆ ไม่ได้.
- shared primitives ที่ migrate แล้ว: `NumInput` stepper + `zoom-control` + `period-picker` (ปุ่มธรรมดา→`tooltip`), `status-filter` (nested Tooltip → ครอบทุกหน้าที่ใช้ปุ่มกรองสถานะทีเดียว).

SSOT doc = `docs/claude/ui-table-card.md` (section "Action buttons in rows"). เกี่ยวกับ [[feedback_button_icon_size]] (icon ใน Button ใช้ `size-N`).
