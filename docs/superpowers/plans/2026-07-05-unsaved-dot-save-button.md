# จุดส้มบอกสถานะ "ยังไม่บันทึก" บนปุ่มบันทึก — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** เพิ่มจุดกลมสีส้มนำหน้าไอคอนในปุ่ม "บันทึก" ของหน้าฟอร์มใหญ่ เมื่อฟอร์มถูกแก้แต่ยังไม่บันทึก (dirty state)

**Architecture:** เพิ่ม prop `dirty?: boolean` ให้ primitive `Button` (แสดง/ซ่อนจุด) แล้วเดินสาย `isDirty` ในแต่ละหน้า — หน้าฟอร์ม setter จุดเดียวใช้ตั้งธง, `LabelDesigner` (setter หลายทาง) ใช้เทียบ snapshot, EditProduct/EditBundle ใช้ธงเดิมที่มีอยู่

**Tech Stack:** React 18 + TypeScript, Tailwind v3 (semantic tokens), CVA button variants, lucide-react

## Global Constraints

- **ไม่มี emoji** ในโค้ด/UI — จุดคือ `<span>` วงกลม ไม่ใช่อักขระ emoji
- **สีเป็น semantic token เท่านั้น** — จุดใช้ `bg-warning` (ห้าม `bg-orange-*`/literal ใด ๆ)
- **ขนาดเป็น rem** — จุด `size-2` (ห้าม hardcode px)
- **จุด: 8px · สีส้ม warning · นิ่ง ไม่มี animation** (ยืนยันจาก mockup 2026-07-05)
- **แก้ primitive → ต้องอัปเดตโชว์เคส `/theme`** ในการเปลี่ยนแปลงเดียวกัน
- **`setIsDirty(false)` ต้องอยู่ใน path สำเร็จเท่านั้น** ห้ามใส่ใน `finally` (finally รันตอน error ด้วย → จะลบจุดทั้งที่ยังไม่บันทึกจริง)
- **การโหลดค่าเริ่มต้นต้องไม่ทำให้ dirty** (โหลดผ่าน `setForm` ตรง ไม่ผ่าน `setF`)
- **Backward compatible** — `dirty` เป็น optional, call site เดิมทุกจุดไม่กระทบ
- **Typecheck gate:** ทุก task จบด้วย `npx tsc --noEmit -p tsconfig.json` ต้องผ่าน (exit 0) + ตรวจในแอปด้วยตา (`npm run electron:dev`)
- **ไม่แตะ schema / IPC / payload** — งานนี้ renderer ล้วน

---

### Task 1: เพิ่ม prop `dirty` ให้ `Button` + โชว์เคส `/theme`

**Files:**
- Modify: `src/components/ui/button.tsx` (type `ButtonProps` ~197-204, component body ~206-232)
- Modify: `src/pages/Theme/index.tsx` (Button showcase ~425-467; import lucide ~ต้นไฟล์)

**Interfaces:**
- Produces: `Button` รับ prop ใหม่ `dirty?: boolean` — `true` = แสดงจุด `bg-warning size-2` นำหน้า children; `false`/undefined = ปุ่มปกติ; จุดไม่แสดงเมื่อ `asChild` (Slot รับลูกเดี่ยว)

- [ ] **Step 1: เพิ่ม `dirty` เข้า type `ButtonProps`**

ใน `src/components/ui/button.tsx` แก้บล็อก type (เดิม ~197-204) เพิ่มบรรทัด `dirty`:

```tsx
type ButtonProps = React.ComponentProps<"button"> &
  VariantProps<typeof buttonVariants> & {
    asChild?: boolean
    /** When set, the button is wrapped in a styled <Tooltip>. A string also sets aria-label for icon-only buttons. */
    tooltip?: React.ReactNode
    /** Side the tooltip pops out toward. Defaults to "top". */
    tooltipSide?: React.ComponentProps<typeof TooltipContent>["side"]
    /** Unsaved-changes indicator — shows an orange dot before the content. Ignored when asChild (Slot takes a single child). */
    dirty?: boolean
  }
```

- [ ] **Step 2: เรนเดอร์จุดใน component body**

แก้ signature + body (เดิม ~206-220) ให้ destructure `dirty` และ `children`, แล้วประกอบ `content`:

```tsx
const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = "default", size = "default", asChild = false, dirty = false, tooltip, tooltipSide = "top", "aria-label": ariaLabel, children, ...props }, ref) => {
  const Comp = asChild ? Slot.Root : "button"

  // asChild → Slot requires exactly one child element, so never inject the dot there.
  const showDot = !!dirty && !asChild
  const content = asChild
    ? children
    : (
      <>
        {showDot && (
          <span
            data-slot="button-dirty-dot"
            aria-hidden="true"
            className="size-2 shrink-0 rounded-full bg-warning"
          />
        )}
        {children}
      </>
    )

  const button = (
    <Comp
        ref={ref} // <-- ส่ง ref มาที่นี่
      data-slot="button"
      data-variant={variant}
      data-size={size}
      aria-label={ariaLabel ?? (typeof tooltip === "string" ? tooltip : undefined)}
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    >
      {content}
    </Comp>
  )

  if (tooltip == null) return button
```

หมายเหตุ: ส่วน tooltip return (เดิม ~222-229) และ `Button.displayName` คงเดิมทุกอย่าง — แก้เฉพาะ signature + การเปลี่ยน `<Comp ... />` แบบ self-closing เป็นมีลูก `{content}`

- [ ] **Step 3: typecheck**

Run: `npx tsc --noEmit -p tsconfig.json`
Expected: exit 0 (ไม่มี error ใหม่)

- [ ] **Step 4: เพิ่มโชว์เคสใน `/theme`**

ตรวจว่า `Save` ถูก import จาก lucide-react ที่ต้นไฟล์ `src/pages/Theme/index.tsx` แล้วหรือยัง — ถ้ายัง ให้เพิ่ม `Save` เข้า import ของ lucide-react

จากนั้นแทรก `DemoRow` ใหม่ใต้ `DemoRow label="Status — solid"` (ปิดที่บรรทัด ~432) โดยเพิ่มก่อน `<DemoRow label="Status — soft">`:

```tsx
                <DemoRow label="Unsaved indicator (prop dirty) — จุดส้ม = ยังไม่บันทึก">
                  <Button dirty><Save className="size-4" /> บันทึก</Button>
                  <Button><Save className="size-4" /> บันทึก</Button>
                  <Button variant="elevated" dirty><Save className="size-4" /> บันทึก</Button>
                </DemoRow>
```

- [ ] **Step 5: typecheck + ตรวจตา**

Run: `npx tsc --noEmit -p tsconfig.json` → exit 0
เปิดแอป (`npm run electron:dev`) ไปหน้า `/theme` แท็บ Components → เห็นปุ่ม "บันทึก" ที่มีจุดส้มนำหน้า (dirty) เทียบกับปุ่มปกติ, จุดกลม สีส้ม อยู่ก่อนไอคอน

- [ ] **Step 6: commit**

```bash
git add src/components/ui/button.tsx src/pages/Theme/index.tsx
git commit -m "feat(ui): Button prop dirty — จุดส้มบอกยังไม่บันทึก + โชว์เคส /theme"
```

---

### Task 2: ต่อจุดที่ EditProduct + EditBundle (มีธง isDirty อยู่แล้ว)

**Files:**
- Modify: `src/pages/Products/EditProduct/index.tsx:402-406`
- Modify: `src/pages/Products/EditBundle/index.tsx:412-422`

**Interfaces:**
- Consumes: `Button` prop `dirty` (Task 1); state `isDirty` ที่มีอยู่แล้วในทั้งสองไฟล์

- [ ] **Step 1: EditProduct — เติม `dirty={isDirty}`**

แก้ปุ่มบันทึก (เดิม ~402-406):

```tsx
          {tab === 'general' && (
            <Button size="lg" className="h-10 px-3" dirty={isDirty} onClick={handleSave} disabled={saving}>
              <Save className="size-4" /> {saving ? 'กำลังบันทึก...' : isNew ? 'เพิ่มสินค้า' : 'บันทึก'}
            </Button>
          )}
```

- [ ] **Step 2: EditBundle — เติม `dirty={isDirty}`**

แก้ปุ่มบันทึก (เดิม ~413-421):

```tsx
            <Button
              size="lg"
              className="h-10 px-3"
              dirty={isDirty}
              onClick={handleSave}
              disabled={saving || draftItems.length < 2}
              title={draftItems.length < 2 ? 'ต้องเพิ่มรายการอย่างน้อย 2 รายการก่อน' : undefined}
            >
              <Save className="size-4" /> {saving ? 'กำลังบันทึก...' : (isNew ? 'สร้างชุดสินค้า' : 'บันทึก')}
            </Button>
```

- [ ] **Step 3: typecheck + ตรวจตา**

Run: `npx tsc --noEmit -p tsconfig.json` → exit 0
ในแอป: เปิดแก้สินค้า → แก้ 1 ช่อง → จุดส้มขึ้นบนปุ่มบันทึก → กดบันทึก → จุดหาย. เปิดแก้ชุดสินค้า → เช่นเดียวกัน

- [ ] **Step 4: commit**

```bash
git add src/pages/Products/EditProduct/index.tsx src/pages/Products/EditBundle/index.tsx
git commit -m "feat(products): จุดยังไม่บันทึกบนปุ่มบันทึก EditProduct/EditBundle"
```

---

### Task 3: ShopTab — ตั้งธง isDirty ใหม่

**Files:**
- Modify: `src/pages/Settings/ShopTab.tsx` (state ~19, setF ~30, handleSave ~32-40, ปุ่ม ~59-61)

**Interfaces:**
- Consumes: `Button` prop `dirty` (Task 1)

- [ ] **Step 1: เพิ่ม state `isDirty`**

หลังบรรทัด `const [saving, setSaving] = useState(false)` (~20) เพิ่ม:

```tsx
  const [isDirty, setIsDirty] = useState(false)
```

- [ ] **Step 2: ตั้ง dirty ใน setF**

แก้ `setF` (เดิม ~30):

```tsx
  const setF = (k: keyof Setting, v: string) => { setForm(f => ({ ...f, [k]: v })); setIsDirty(true) }
```

- [ ] **Step 3: ล้าง dirty เมื่อบันทึกสำเร็จ**

ใน `handleSave` เพิ่ม `setIsDirty(false)` หลังบรรทัด toast สำเร็จ (ในบล็อก try, ไม่ใช่ finally):

```tsx
  const handleSave = async () => {
    setSaving(true)
    try {
      await window.api.settings.saveShop(form)
      setIsDirty(false)
      toast({ title: 'บันทึกข้อมูลร้านสำเร็จ', variant: 'success' })
    } catch (e: any) {
      toast({ title: 'บันทึกไม่สำเร็จ', description: e?.message ?? '', variant: 'error' })
    } finally { setSaving(false) }
  }
```

- [ ] **Step 4: ต่อจุดที่ปุ่ม**

แก้ปุ่มบันทึก (เดิม ~59):

```tsx
            <Button dirty={isDirty} onClick={handleSave} disabled={saving}>
              <Save className="size-4" />{saving ? 'กำลังบันทึก...' : 'บันทึก'}
            </Button>
```

- [ ] **Step 5: typecheck + ตรวจตา**

Run: `npx tsc --noEmit -p tsconfig.json` → exit 0
ในแอป: ตั้งค่า › ข้อมูลร้าน → โหลดมาไม่มีจุด → แก้ชื่อร้าน → จุดขึ้น → บันทึก → จุดหาย

- [ ] **Step 6: commit**

```bash
git add src/pages/Settings/ShopTab.tsx
git commit -m "feat(settings): จุดยังไม่บันทึกบนปุ่มบันทึก ShopTab"
```

---

### Task 4: SalesTab — ตั้งธง + ยก dirty ขึ้นพ่อ (ปุ่มอยู่ที่ Settings/index.tsx)

**Files:**
- Modify: `src/pages/Settings/SalesTab.tsx` (props ~29-33, state ~35, setF ~78-79, handleSave ~81-96)
- Modify: `src/pages/Settings/index.tsx` (state ~22, ปุ่ม sales ~61-65, `<SalesTab>` ~85-89)

**Interfaces:**
- Consumes: `Button` prop `dirty` (Task 1)
- Produces: `SalesTab` รับ prop ใหม่ `setDirty?: (v: boolean) => void`

- [ ] **Step 1: SalesTab — เพิ่ม prop `setDirty` + state isDirty**

แก้ signature (เดิม ~29-33):

```tsx
export function SalesTab({ registerSave, saving, setSaving, setDirty }: {
  registerSave: (fn: () => void) => void
  saving: boolean
  setSaving: (v: boolean) => void
  setDirty?: (v: boolean) => void
}) {
```

หลัง `const [form, setForm] = useState<SalesForm>(DEFAULT_FORM)` (~35) เพิ่ม:

```tsx
  const [isDirty, setIsDirty] = useState(false)
```

- [ ] **Step 2: ตั้ง dirty ใน setF และ autoPrint**

แก้ `setF` (เดิม ~78-79):

```tsx
  const setF = <K extends keyof SalesForm>(k: K, v: SalesForm[K]) => { setForm(f => ({ ...f, [k]: v })); setIsDirty(true) }
```

autoPrint แก้ผ่าน `setAutoPrint` ตรง ๆ (ช่อง "พิมพ์ใบเสร็จอัตโนมัติ" ~223) ก็ถือเป็นการแก้ค่าที่ต้องบันทึก — แก้ CheckRow นั้นให้ตั้ง dirty ด้วย:

```tsx
                onChange={v => { setAutoPrint(v ? 1 : 0); setIsDirty(true) }}
```

- [ ] **Step 3: ล้าง dirty เมื่อบันทึกสำเร็จ + ยกขึ้นพ่อ**

ใน `handleSave` เพิ่ม `setIsDirty(false)` หลัง `await Promise.all([...])` สำเร็จ (ก่อน toast, ในบล็อก try):

```tsx
      await Promise.all([
        window.api.settings.saveSalesSettings(form),
        window.api.settings.saveReceiptSettings({ auto_print: autoPrint }),
      ])
      setIsDirty(false)
      toast({ title: 'บันทึกการตั้งค่าการขายสำเร็จ', variant: 'success' })
```

จากนั้นเพิ่ม effect ยก isDirty ขึ้นพ่อ (วางถัดจาก `useEffect(() => { registerSave(handleSave) }, ...)` ~98):

```tsx
  useEffect(() => { setDirty?.(isDirty) }, [isDirty, setDirty])
```

- [ ] **Step 4: Settings/index.tsx — เพิ่ม state + ส่ง prop + ต่อจุด**

หลัง `const [salesSaving, setSalesSaving] = useState(false)` (~22) เพิ่ม:

```tsx
  const [salesDirty, setSalesDirty] = useState(false)
```

แก้ปุ่มบันทึก sales (เดิม ~62):

```tsx
          <Button className="h-10 ml-auto" dirty={salesDirty} onClick={() => salesSaveFn.current?.()} disabled={salesSaving}>
            <Save className="size-4" />{salesSaving ? 'กำลังบันทึก...' : 'บันทึก'}
          </Button>
```

แก้การเรียก `<SalesTab>` (เดิม ~85-89) เพิ่ม `setDirty`:

```tsx
              <SalesTab
                registerSave={fn => { salesSaveFn.current = fn }}
                saving={salesSaving}
                setSaving={setSalesSaving}
                setDirty={setSalesDirty}
              />
```

- [ ] **Step 5: typecheck + ตรวจตา**

Run: `npx tsc --noEmit -p tsconfig.json` → exit 0
ในแอป: ตั้งค่า › การขาย → ติ๊ก/เปลี่ยน checkbox ใด ๆ → จุดส้มขึ้นบนปุ่มบันทึกที่แถบแม่ → กดบันทึก → จุดหาย

- [ ] **Step 6: commit**

```bash
git add src/pages/Settings/SalesTab.tsx src/pages/Settings/index.tsx
git commit -m "feat(settings): จุดยังไม่บันทึกบนปุ่มบันทึก SalesTab (ยก dirty ขึ้นแถบแม่)"
```

---

### Task 5: ReceiptSettingsTab — ตั้งธง + dirty ใน actRef effect

**Files:**
- Modify: `src/pages/Settings/ReceiptSettingsTab.tsx` (state ~97-100, setF ~133-134, handleSave ~148-156, actRef effect ~176-185)

**Interfaces:**
- Consumes: `Button` prop `dirty` (Task 1)

- [ ] **Step 1: เพิ่ม state isDirty**

หลัง `const [saving, setSaving] = useState(false)` (~100) เพิ่ม:

```tsx
  const [isDirty, setIsDirty] = useState(false)
```

- [ ] **Step 2: ตั้ง dirty ใน setF**

แก้ `setF` (เดิม ~133-134):

```tsx
  const setF = <K extends keyof ReceiptForm>(k: K, v: ReceiptForm[K]) => { setForm(f => ({ ...f, [k]: v })); setIsDirty(true) }
```

- [ ] **Step 3: ล้าง dirty เมื่อบันทึกสำเร็จ**

ใน `handleSave` เพิ่ม `setIsDirty(false)` หลัง `await saveReceiptSettings` สำเร็จ (ในบล็อก try):

```tsx
  const handleSave = useCallback(async () => {
    setSaving(true)
    try {
      await window.api.settings.saveReceiptSettings(form)
      setIsDirty(false)
      toast({ title: 'บันทึกการตั้งค่าใบเสร็จสำเร็จ', variant: 'success' })
    } catch (e: any) {
      toast({ title: 'บันทึกไม่สำเร็จ', description: e?.message ?? '', variant: 'error' })
    } finally { setSaving(false) }
  }, [form, toast])
```

- [ ] **Step 4: dirty ที่ปุ่มใน actRef effect + เพิ่ม dep**

แก้ effect (เดิม ~178-185):

```tsx
  useEffect(() => {
    onActions?.(
      <Button className="h-10" dirty={isDirty} onClick={() => actRef.current.handleSave()} disabled={saving}>
        <Save className="size-4" />{saving ? 'กำลังบันทึก...' : 'บันทึก'}
      </Button>
    )
    return () => onActions?.(null)
  }, [onActions, saving, isDirty])
```

- [ ] **Step 5: typecheck + ตรวจตา**

Run: `npx tsc --noEmit -p tsconfig.json` → exit 0
ในแอป: ตั้งค่า › การพิมพ์ › ใบเสร็จ → แก้ค่าใด ๆ → จุดขึ้นบนปุ่มบันทึกแถบแม่ → บันทึก → จุดหาย

- [ ] **Step 6: commit**

```bash
git add src/pages/Settings/ReceiptSettingsTab.tsx
git commit -m "feat(settings): จุดยังไม่บันทึกบนปุ่มบันทึก ReceiptSettingsTab"
```

---

### Task 6: DocumentSettingsTab — ตั้งธง + dirty ใน actRef effect

**Files:**
- Modify: `src/pages/Settings/DocumentSettingsTab.tsx` (state ~64-67, setF ~113-114, handleSave ~116-124, actRef effect ~173-182)

**Interfaces:**
- Consumes: `Button` prop `dirty` (Task 1)

- [ ] **Step 1: เพิ่ม state isDirty**

หลัง `const [saving, setSaving] = useState(false)` (~67) เพิ่ม:

```tsx
  const [isDirty, setIsDirty] = useState(false)
```

- [ ] **Step 2: ตั้ง dirty ใน setF**

แก้ `setF` (เดิม ~113-114):

```tsx
  const setF = <K extends keyof DocumentForm>(k: K, v: DocumentForm[K]) => { setForm(f => ({ ...f, [k]: v })); setIsDirty(true) }
```

- [ ] **Step 3: ล้าง dirty เมื่อบันทึกสำเร็จ**

ใน `handleSave` เพิ่ม `setIsDirty(false)` หลัง `await saveDocumentSettings` สำเร็จ (ในบล็อก try):

```tsx
  const handleSave = useCallback(async () => {
    setSaving(true)
    try {
      await window.api.settings.saveDocumentSettings(form)
      setIsDirty(false)
      toast({ title: 'บันทึกการตั้งค่าเอกสาร A4 สำเร็จ', variant: 'success' })
    } catch (e: any) {
      toast({ title: 'บันทึกไม่สำเร็จ', description: e?.message ?? '', variant: 'error' })
    } finally { setSaving(false) }
  }, [form, toast])
```

- [ ] **Step 4: dirty ที่ปุ่มใน actRef effect + เพิ่ม dep**

แก้ effect (เดิม ~175-182):

```tsx
  useEffect(() => {
    onActions?.(
      <Button className="h-10" dirty={isDirty} onClick={() => actRef.current.handleSave()} disabled={saving}>
        <Save className="size-4" />{saving ? 'กำลังบันทึก...' : 'บันทึก'}
      </Button>
    )
    return () => onActions?.(null)
  }, [onActions, saving, isDirty])
```

- [ ] **Step 5: typecheck + ตรวจตา**

Run: `npx tsc --noEmit -p tsconfig.json` → exit 0
ในแอป: ตั้งค่า › การพิมพ์ › เอกสาร A4 → แก้ค่าใด ๆ → จุดขึ้น → บันทึก → จุดหาย

- [ ] **Step 6: commit**

```bash
git add src/pages/Settings/DocumentSettingsTab.tsx
git commit -m "feat(settings): จุดยังไม่บันทึกบนปุ่มบันทึก DocumentSettingsTab"
```

---

### Task 7: LabelDesigner — เทียบ snapshot (คลุมฉลากยา + ฉลากเปล่า)

**Files:**
- Modify: `src/components/label/LabelDesigner.tsx` (load effect ~143-155, handleSave ~214-222, actRef effect ~269-277, previewActions ~283-298)

**Interfaces:**
- Consumes: `Button` prop `dirty` (Task 1)

**เหตุผลใช้ snapshot:** `form` ถูกแก้จากหลายทาง (`setF`, `nudge` ปุ่มลูกศร, `applySizeTemplate`, reset) การไล่ตั้งธงทุก setter เปราะ → เทียบ `JSON.stringify(form)` กับ baseline แทน จับได้ทุกทาง และรีเซ็ต baseline อัตโนมัติเมื่อสลับ `profile` (drug ↔ blank) เพราะผูกกับ load effect ที่ dep `[profile]`

- [ ] **Step 1: เพิ่ม `savedRef` + คำนวณ isDirty**

หลังบรรทัด `const [previewHtml, setPreviewHtml] = useState('')` (~139) เพิ่ม:

```tsx
  // Baseline snapshot of `form` at load / after save. isDirty = form ต่างจาก baseline.
  // null = ยังไม่โหลด → ถือว่าไม่ dirty (กันจุดเด้งตอนเริ่ม). ผูกกับ load effect [profile]
  // จึงรีเซ็ตเองเมื่อสลับ drug ↔ blank.
  const savedRef = React.useRef<string | null>(null)
  const isDirty = savedRef.current != null && JSON.stringify(form) !== savedRef.current
```

- [ ] **Step 2: จับ baseline ใน load effect**

แก้ load effect (เดิม ~143-155) ให้เซ็ต `savedRef.current` ภายใน updater (จับทั้งกรณีมี/ไม่มี data):

```tsx
  useEffect(() => {
    window.api.settings.getLabelSettings(profile).then(data => {
      setForm(prev => {
        const next = { ...prev }
        if (data) {
          for (const k of Object.keys(prev) as (keyof LabelSettingsForm)[]) {
            const v = (data as any)[k]
            if (v !== undefined && v !== null) (next as any)[k] = v
          }
        }
        savedRef.current = JSON.stringify(next)
        return next
      })
    })
  }, [profile])
```

- [ ] **Step 3: อัปเดต baseline เมื่อบันทึกสำเร็จ**

แก้ `handleSave` (เดิม ~214-222) เพิ่ม `savedRef.current = JSON.stringify(form)` หลังบันทึกสำเร็จ:

```tsx
  const handleSave = async () => {
    setSaving(true)
    try {
      await window.api.settings.saveLabelSettings(form, profile)
      savedRef.current = JSON.stringify(form)
      toast({ title: 'บันทึกการตั้งค่าฉลากสำเร็จ', variant: 'success' })
    } catch (e: any) {
      toast({ title: 'บันทึกไม่สำเร็จ', description: e?.message ?? '', variant: 'error' })
    } finally { setSaving(false) }
  }
```

- [ ] **Step 4: dirty ที่ปุ่ม onActions (ยกขึ้นแถบ) + เพิ่ม dep**

แก้ actRef effect (เดิม ~269-277):

```tsx
  React.useEffect(() => {
    if (!onActions) return
    onActions(
      <Button className="h-10" dirty={isDirty} onClick={() => actRef.current.handleSave()} disabled={saving}>
        <Save className="size-4" />{saving ? 'กำลังบันทึก...' : 'บันทึก'}
      </Button>
    )
    return () => onActions(null)
  }, [onActions, saving, isDirty])
```

- [ ] **Step 5: dirty ที่ปุ่ม previewActions (inline, กรณีฉลากเปล่าใน PrintTab)**

แก้ปุ่มใน `previewActions` (เดิม ~293-295):

```tsx
      {!onActions && (
        <Button className="h-9" dirty={isDirty} onClick={handleSave} disabled={saving}>
          <Save className="size-4" />{saving ? 'กำลังบันทึก...' : 'บันทึก'}
        </Button>
      )}
```

- [ ] **Step 6: typecheck + ตรวจตา**

Run: `npx tsc --noEmit -p tsconfig.json` → exit 0
ในแอป ตรวจ 3 อย่าง:
1. ตั้งค่า › การพิมพ์ › ฉลากยา → แก้ผ่านช่องปกติ / กดปุ่มลูกศร nudge / เปลี่ยนขนาดกระดาษ → จุดขึ้นทุกทาง → บันทึก → จุดหาย
2. หน้าฉลากเปล่า (Products › PrintTab) → แก้ค่า → จุดขึ้นบนปุ่มบันทึก inline → บันทึก → จุดหาย
3. สลับ profile drug ↔ blank → จุดต้องไม่ค้างผิด (baseline รีเซ็ตตาม profile)

- [ ] **Step 7: commit**

```bash
git add src/components/label/LabelDesigner.tsx
git commit -m "feat(label): จุดยังไม่บันทึกบนปุ่มบันทึก LabelDesigner (snapshot; ฉลากยา+เปล่า)"
```

---

## Self-Review

**1. Spec coverage** — ครบทั้ง 7 จุดตามตาราง spec §2: Button primitive+showcase (Task 1), EditProduct/EditBundle (Task 2), ShopTab (Task 3), SalesTab (Task 4), ReceiptSettingsTab (Task 5), DocumentSettingsTab (Task 6), LabelDesigner ครอบฉลากยา+เปล่า (Task 7). PrintersTab = ตัวครอบ ไม่มีฟอร์มแยก (spec §2 หมายเหตุ) — คลุมด้วย Task 5–7 ครบ

**2. Placeholder scan** — ไม่มี TBD/TODO; ทุก step ที่แก้โค้ดมี code block จริง; ค่า/สี/ขนาด ระบุชัด (`bg-warning`, `size-2`)

**3. Type consistency** — prop `dirty?: boolean` (Task 1) ใช้ชื่อเดียวกันทุก call site; prop `setDirty?: (v: boolean) => void` (Task 4) สอดคล้องระหว่าง SalesTab กับ Settings/index.tsx; `savedRef: React.useRef<string | null>` ใช้ตรงกันทั้ง Task 7

**หมายเหตุการทดสอบ:** โปรเจกต์นี้ไม่มี unit test harness สำหรับ UI ชิ้นเล็กแบบนี้ (ธรรมเนียม = tsc + ตรวจในแอป/e2e) แผนจึงใช้ `npx tsc --noEmit -p tsconfig.json` เป็น gate อัตโนมัติ + ขั้นตรวจตาในแอปจริงต่อ task ตามข้อความข้างบน
