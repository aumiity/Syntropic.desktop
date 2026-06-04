# Design Brief — หน้า Login (เลือกผู้ใช้ + PIN)

> สถานะ: **SHAPE / รอยืนยัน direction** — เขียน 2026-06-04 (ผ่าน impeccable shape)
> ขอบเขต: ออกแบบ UX/UI หน้าเข้าสู่ระบบ (ชั้น C) — ยังไม่เขียนโค้ด
> ยึด: `/theme` เป็น source of truth, `src/components/ui/*` เท่านั้น, DESIGN.md/CLAUDE.md invariants, ไทยทั้งหมด
> เกี่ยวข้อง: `User_Login_System.md` (logic), `License_Activation_System.md` (gate ชั้นนอก)

---

## 1. Feature Summary
หน้าจอเต็ม (frameless + TitleBar) ที่คั่นก่อนเข้าแอป หลังผ่าน License + Setup แล้ว พนักงานในร้าน 1–5 คน **เลือกชื่อตัวเองจากรายการ แล้วกด PIN** เพื่อยืนยันตัวตน — เพื่อให้ทุกบิล/ใบรับเข้าผูกกับคนที่ทำจริง และ gate สิทธิ์ตาม role ใช้ในสองจังหวะ: เปิดแอป และ "ล็อกหน้าจอ/สลับผู้ใช้" ระหว่างวัน

## 2. Primary User Action
**เลือกตัวเอง → กด PIN 6 หลัก → เข้า** ให้จบใน ~2 วินาที โดยไม่ต้องแตะคีย์บอร์ดถ้าไม่อยากแตะ (รองรับทั้งเมาส์/จอสัมผัสที่เคาน์เตอร์ และพิมพ์เลขจากคีย์บอร์ด)

> **ตัดสินใจหลัก (assert):** ใช้ **PIN** ไม่ใช่ email+password — เพราะ PRODUCT.md ระบุบริบทเคาน์เตอร์ "fast, zero-misclick, มีคิวรอ" การพิมพ์อีเมลทุกครั้งคือ friction ที่ผิดงาน → **ข้อนี้รอยืนยัน (ดู Open Questions Q1)**

## 3. Design Direction
- **Color strategy: Restrained** (ตาม product default) — พื้น near-white neutral, teal เป็น accent เฉพาะ "ผู้ใช้ที่เลือก" + ปุ่มยืนยัน, ที่เหลือ neutral ทั้งหมด ไม่มีสีฉูดฉาด
- **Scene sentence:** "ผู้ช่วยเภสัชยืนอยู่หลังเคาน์เตอร์ใต้ไฟ LED ขาวของร้านยา เปิดเครื่องตอนเช้า/สลับกะ อยากกดเข้าให้ไวที่สุดเพื่อรับลูกค้าคนแรก" → บริบทสว่าง, รีบ, โฟกัส → **light mode เป็นค่าเริ่ม** (เคารพ theme ที่ผู้ใช้ตั้งไว้; ไม่บังคับ dark)
- **Anchor references:** (1) **iPadOS lock screen** — เลือก user + เลขกลม ๆ, นิ่ง เชื่อถือได้ (2) **เครื่อง POS Square/Loyverse** ตอนสลับพนักงาน — เร็ว เป็นงาน (3) **SetupWizard ของเราเอง** (`src/pages/Setup/SetupWizard.tsx`) — โครง full-screen + TitleBar + SectionCard กลางจอ ใช้ภาษาภาพเดียวกันเป๊ะ
- ปฏิเสธ: ภาพ illustration เล่น ๆ, blob มน ๆ, gradient, glassmorphism, การ์ดซ้อนการ์ด (ตรง anti-references ของโปรเจกต์)

## 4. Scope
- **Fidelity:** production-ready (จะใช้จริง ไม่ใช่ sketch)
- **Breadth:** 2 surface — (ก) หน้า Login เต็มจอ, (ข) เมนูผู้ใช้/ล็อก/สลับ ใน TitleBar; + (ค) dialog "ขอสิทธิ์ผู้ดูแล" (manager override) แชร์กับ flow อื่น
- **Interactivity:** shipped component จริง
- ไม่รวม: หน้าจัดการพนักงาน (มีแล้วใน People → StaffTab), การตั้ง/รีเซ็ต PIN (เฟสหลัง)

## 5. Layout Strategy
หน้า Login = **คอลัมน์เดียว จัดกึ่งกลางจอ** บนพื้น `bg-background` (มี `TitleBar` ลอยบนสุดเหมือน SetupWizard):

```
┌──────────────────── TitleBar (frameless, drag) ────────────────────┐
│                                                                     │
│                      [ โลโก้/ชื่อร้าน  ·  teal ]                      │
│                         เข้าสู่ระบบ                                   │
│                                                                     │
│   ┌─────────── การ์ดกลาง (rounded-card, shadow-card, max-w-md) ───┐  │
│   │  สถานะ A: เลือกผู้ใช้        |  สถานะ B: ใส่ PIN              │  │
│   │  ┌─ avatar grid ─┐          |   ← Avatar + ชื่อ คนที่เลือก    │  │
│   │  │ [A] อุ้ม  admin│          |   ● ● ● ○ ○ ○  (PIN dots)      │  │
│   │  │ [B] บี   staff │          |   ┌───┬───┬───┐                │  │
│   │  │ [+] อื่น ๆ...  │          |   │ 1 │ 2 │ 3 │  numpad        │  │
│   │  └───────────────┘          |   │ 4 │ 5 │ 6 │                │  │
│   │                             |   │ 7 │ 8 │ 9 │                │  │
│   │                             |   │ ← │ 0 │ ⏎ │                │  │
│   └─────────────────────────────────────────────────────────────┘  │
│                  ปุ่ม "ตั้งค่า" / สลับ theme (มุมล่าง, ghost)         │
└─────────────────────────────────────────────────────────────────────┘
```

**ลำดับความสำคัญ:** ผู้ใช้ที่เลือก + numpad ใหญ่สุด/กลางจอ; ชื่อร้านรอง; chrome อื่น (theme/ตั้งค่า) จาง `ghost` มุมจอ
**Rhythm:** สองสเต็ป A→B สไลด์แทนที่กันใน card เดียว (ไม่เด้ง modal ใหม่) — ลื่น, โฟกัสไม่หลุด

## 6. Key States
| state | ผู้ใช้เห็น/รู้สึก |
|-------|------------------|
| **เลือกผู้ใช้ (default)** | grid avatar ของ user ที่เปิดใช้งาน + ชื่อ + badge role; คนเดียวในร้าน → ข้ามไปหน้า PIN เลย |
| **ใส่ PIN** | avatar+ชื่อคนที่เลือกอยู่บนสุด, PIN dots เติมทีละจุด, numpad; ปุ่ม "← เปลี่ยนผู้ใช้" กลับ |
| **กำลังตรวจ** | dots เต็ม → spinner สั้น ๆ บนปุ่มยืนยัน (150–250ms feel) ไม่ block ทั้งจอ |
| **PIN ผิด** | dots **สั่นแนวนอน (shake)** + ล้างเป็นว่าง + ข้อความ `text-destructive` "PIN ไม่ถูกต้อง"; ไม่เด้ง toast (อยู่ในที่เดียว) |
| **ล็อก/ลองถี่เกิน** | หลังผิด N ครั้ง (เช่น 5) → หน่วงเวลา + ข้อความ "ลองใหม่ใน Xs" (กันสุ่ม PIN) |
| **สำเร็จ** | เช็คเขียวสั้น ๆ → fade เข้าแอป |
| **ไม่มี user เลย / โหลด** | skeleton avatar (ไม่ใช่ spinner กลางจอ); ถ้า DB ไม่มี user → ข้อความนำไปหน้าตั้งค่าพนักงาน |
| **Manager override (dialog)** | Dialog มาตรฐาน: หัวข้อ "ต้องการสิทธิ์ผู้ดูแล", mini numpad/ช่อง PIN, ปุ่ม [ยกเลิก `elevated`] [ยืนยัน `default`] |

## 7. Interaction Model
- **คีย์บอร์ด + เมาส์/สัมผัส เท่ากัน:** เลข 0–9 = กดปุ่ม, Backspace = ลบ, Enter = ยืนยันเมื่อครบ, Esc = กลับเลือกผู้ใช้
- **auto-submit เมื่อครบ 6 หลัก** (ไม่ต้องกด Enter) — ลด 1 จังหวะ; ปุ่ม ⏎ ใน numpad ไว้เผื่อ PIN < 6 หลัก (Q3)
- PIN เป็น **dots ไม่โชว์ตัวเลข** (มีคนยืนข้างหลังที่เคาน์เตอร์) — ไม่มีปุ่ม "แสดง PIN"
- **เข้าจาก TitleBar ระหว่างวัน:** ปุ่ม avatar+ชื่อผู้ใช้ปัจจุบันด้านขวาของ TitleBar → popover เมนู: **ล็อกหน้าจอ / สลับผู้ใช้ / ออกจากระบบ** (ใช้ `Popover` ที่ TitleBar มีอยู่แล้ว)
- **ล็อกหน้าจอ** = กลับหน้า Login โดยไม่ปิดแอป/ไม่ล้าง state งานที่ค้าง (cart ไม่หาย)
- **reduced-motion:** shake/slide/fade → crossfade หรือทันที

## 8. Content Requirements (ไทย, ตาม no-emoji + lucide icons)
- หัวข้อ: **"เข้าสู่ระบบ"** · ใต้ชื่อร้าน (ดึงจาก `settings.shop_name`)
- หน้าเลือก: ไม่ต้องมี label ฟุ่มเฟือย — avatar + ชื่อ + Badge role (`admin` = badge `brand-soft` "ผู้ดูแล", `staff` = badge `secondary` "พนักงาน")
- หน้า PIN: "ใส่ PIN ของ {ชื่อ}" (helper `text-xs text-muted-foreground`)
- error: "PIN ไม่ถูกต้อง" / "ลองใหม่อีกครั้งใน {n} วินาที"
- override dialog: title "ต้องการสิทธิ์ผู้ดูแล", body "รายการนี้ต้องให้ผู้ดูแลยืนยัน — ใส่ PIN ผู้ดูแล", ปุ่ม "ยืนยัน"
- empty: "ยังไม่มีผู้ใช้ในระบบ" + ปุ่ม `default` "ไปตั้งค่าพนักงาน"
- avatar fallback: อักษรแรกของชื่อบนพื้น token (ใช้ `avatar` primitive ที่มีอยู่)

## 9. การ map ลง design system (ห้ามสร้าง primitive ใหม่ถ้าเลี่ยงได้)
| ส่วน UI | ใช้ของที่มี |
|---------|-------------|
| โครงเต็มจอ + TitleBar | mirror `SetupWizard.tsx` (import `TitleBar`, พื้น `bg-background`) |
| การ์ดกลาง | `SectionCard` หรือ `Card` (`rounded-card` `shadow-card`) |
| avatar ผู้ใช้ | `avatar` primitive |
| badge role | `Badge` variant `brand-soft` / `secondary` |
| ปุ่มเลข numpad | **primitive ใหม่ `PinPad` ใน `src/components/ui/`** (ไม่มีของเดิม) — ปุ่มในนั้นคือ `Button` variant `elevated`/`outline` `size` ใหญ่; demo ใน `/theme` ในการเปลี่ยนเดียวกัน (HARD invariant #1) |
| PIN dots | element เล็ก ๆ ใน `PinPad` (วงกลม token `foreground`/`border`) |
| override | `Dialog` มาตรฐาน (Header/Body/Footer ครบ ตาม modal contract) |
| เมนู TitleBar | `Popover` (มีใน TitleBar แล้ว) + ปุ่ม `ghost` |
| ปุ่มยืนยัน/CTA | `Button` `default` (teal) |
| สลับ theme/ตั้งค่ามุมจอ | `Button` `ghost` + lucide icon (`size-N`) |

> **สิ่งเดียวที่ต้องเพิ่มเข้า design system:** `PinPad` primitive (+ showcase ใน `/theme`). ที่เหลือประกอบจากของเดิมล้วน

## 10. Recommended references (impeccable) ตอน implement
- `layout.md` — จัด grid avatar + numpad ให้ได้จังหวะ
- `animate.md` — shake error, slide A→B, fade success (พร้อม reduced-motion)
- `clarify.md` — ขัด microcopy error/empty
- `harden.md` — edge case: 0 user, lockout, ล็อกหน้าจอตอน cart ค้าง

## 11. Open Questions (ต้องยืนยันก่อน craft)
- **Q1 — PIN หรือ password?** *assert: PIN 6 หลัก.* ถ้าพี่อยากได้ password เต็มสำหรับ admin (เช่นเข้า Settings/Finance) บอกได้ จะเพิ่มเป็น hybrid
- **Q2 — จำนวนหลัก PIN:** 6 (assert) หรือ 4? 4 เร็วกว่าแต่เดาง่ายกว่า
- **Q3 — auto-submit:** ครบหลักแล้วเข้าเลย (assert) หรือบังคับกด ⏎?
- **Q4 — auto-lock:** ล็อกอัตโนมัติเมื่อไม่ใช้งาน N นาทีไหม? (assert: มี, default ปิด, ตั้งได้ใน Settings ภายหลัง)
- **Q5 — คนเดียวในร้าน:** ข้ามหน้าเลือกผู้ใช้ไปหน้า PIN เลย (assert: ใช่)
- **Q6 — avatar:** ใช้อักษรแรก+สี token พอ (assert) หรืออยากให้อัปโหลดรูป? (เฟสหลัง)
```