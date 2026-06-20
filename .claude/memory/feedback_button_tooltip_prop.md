---
name: feedback_button_tooltip_prop
description: Button has a `tooltip` prop — use it for icon-only buttons instead of raw native `title`
metadata:
  type: feedback
---

**2026-06-12** — `Button` (`src/components/ui/button.tsx`) ตอนนี้มี prop `tooltip?: React.ReactNode` (+ `tooltipSide`, default `"top"`). ถ้าใส่ `tooltip` ปุ่มจะ auto-ครอบ `<Tooltip>` (styled, เด้งไว 200ms) ให้เอง และถ้า `tooltip` เป็น string จะตั้ง `aria-label` ให้ด้วย (accessibility ของ icon button).

**Why:** ปุ่มไอคอนล้วนในตารางเดิมใช้ native `title=` → tooltip ของเบราว์เซอร์ช้า ~1 วิ + หน้าตาดิบ ทำให้ผู้ใช้ "ไม่รู้ว่าปุ่มอะไรจนกว่าจะกด". เจ้าของขอ tooltip ทุกปุ่มในตาราง → flip มาใช้ prop เดียวให้เป็น pattern เดียวทั้งแอป (21 ไฟล์ converted: ProductsList/BundlesList/People/Settings tabs/EditProduct+EditBundle tabs/Manage tables/KhorYor9).

**How to apply:**
- ปุ่มไอคอน row-action: `<Button size="icon-lg" variant="elevated" tooltip="แก้ไข" …>` — อย่าใช้ `title=` ดิบอีก.
- **ห้ามใส่ `tooltip` บนปุ่มที่เป็นลูกของ `asChild` trigger** (`<PopoverTrigger asChild>`, `DialogTrigger`) — prop จะแทน Button ด้วย `<Tooltip>` wrapper → trigger clone ผิดตัว → พัง. พวกนี้ (ตัวกรอง/จัดการตาราง/kebab "ตัวเลือก") คง `title` ไว้.
- ปุ่ม **disabled** = `pointer-events-none` → tooltip/title ไม่เด้งทั้งคู่; ถ้าต้องอธิบายให้ wrap `<span>` ใน `<Tooltip>` เอง (ดู PrintTab preset).
- trigger ที่ไม่ใช่ `<Button>` (`<Badge>`/`<span>`, หรือ rich content เช่นช่องต้นทุน/กำไร) คงเป็น manual `<Tooltip>` wrap — `Badge` ไม่มี `forwardRef` เป็น asChild ตรงๆ ไม่ได้.

SSOT doc = `docs/claude/ui-table-card.md` (section "Action buttons in rows"). เกี่ยวกับ [[feedback_button_icon_size]] (icon ใน Button ใช้ `size-N`).
