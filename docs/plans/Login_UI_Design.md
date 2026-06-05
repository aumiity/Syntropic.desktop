# Design Brief — หน้า Login (เลือกผู้ใช้ + Password)

> สถานะ: **SHAPE v2 (เปลี่ยนเป็น password + ซึมซับ audit)** — เขียน 2026-06-04 (ผ่าน impeccable shape)
> ขอบเขต: ออกแบบ UX/UI หน้าเข้าสู่ระบบ (ชั้น C) — ยังไม่เขียนโค้ด
> ยึด: `/theme` เป็น source of truth, `src/components/ui/*` เท่านั้น, DESIGN.md/CLAUDE.md invariants, ไทยทั้งหมด
> เกี่ยวข้อง: `User_Login_System.md` (logic), `License_Activation_System.md` (gate ชั้นนอก)

---

## 1. Feature Summary
หน้าจอเต็ม (frameless + TitleBar) คั่นก่อนเข้าแอป หลังผ่าน License + Setup พนักงาน 1–5 คน **เลือกชื่อตัวเองจากรายการ แล้วใส่ password** เพื่อยืนยันตัวตน — ให้ทุกบิล/ใบรับเข้าผูกกับคนที่ทำจริง และ gate สิทธิ์ตาม role ใช้สองจังหวะ: เปิดแอป + "ล็อกหน้าจอ/สลับผู้ใช้" ระหว่างวัน

## 2. Primary User Action
**เลือกตัวเอง → พิมพ์ password → Enter → เข้า** เคาน์เตอร์มีคีย์บอร์ด (เครื่องสแกน) อยู่แล้ว การพิมพ์จึงไม่เป็นภาระ; คนเดียวในร้านข้ามหน้าเลือก โฟกัสที่ช่อง password ทันที

> **ตัดสินใจแล้ว (2026-06-04):** ใช้ **password** ไม่ใช่ PIN — ตรงกับคอลัมน์ `users.password` ที่มีอยู่, แข็งแรงกว่า, แก้ bootstrap วันแรก (seed plaintext พิมพ์เข้าได้), และ **ไม่ต้องสร้าง PinPad primitive** (ใช้ `Input type=password`). `email` เป็นแค่ identifier ไม่ต้องพิมพ์

## 3. Design Direction
- **Color strategy: Restrained** — พื้น near-white neutral, teal เป็น accent เฉพาะ "ผู้ใช้ที่เลือก" + ปุ่มเข้าสู่ระบบ, ที่เหลือ neutral
- **Scene sentence:** "ผู้ช่วยเภสัชยืนหลังเคาน์เตอร์ใต้ไฟ LED ขาว เปิดเครื่องตอนเช้า/สลับกะ อยากกดเข้าให้ไวเพื่อรับลูกค้าคนแรก" → สว่าง, รีบ, โฟกัส → **light เป็นค่าเริ่ม** (เคารพ theme ที่ตั้งไว้)
- **Anchor references:** (1) **iPadOS / macOS login** — เลือก user + ช่องรหัส, นิ่ง เชื่อถือได้ (2) **เครื่อง POS ตอนสลับพนักงาน** — เร็ว เป็นงาน (3) **SetupWizard ของเราเอง** (`src/pages/Setup/SetupWizard.tsx`) — โครง full-screen + TitleBar + SectionCard กลางจอ ใช้ภาษาภาพเดียวกันเป๊ะ
- ปฏิเสธ: illustration เล่น ๆ, blob มน, gradient, glassmorphism, การ์ดซ้อนการ์ด

## 4. Scope
- **Fidelity:** production-ready
- **Breadth:** (ก) หน้า Login เต็มจอ, (ข) เมนูผู้ใช้/ล็อก/สลับ ใน TitleBar, (ค) dialog "ขอสิทธิ์ผู้ดูแล" (manager override)
- ไม่รวม: หน้าจัดการพนักงาน (มีแล้ว StaffTab), การตั้ง/เปลี่ยน password (ผูกกับ StaffTab/Phase หลัง), bootstrap password เจ้าของ (อยู่ใน Setup wizard — ดู logic plan Phase 0)

## 5. Layout Strategy
คอลัมน์เดียว จัดกึ่งกลางจอ บน `bg-background` (TitleBar ลอยบนสุดเหมือน SetupWizard):

```
┌──────────────────── TitleBar (frameless, drag) ────────────────────┐
│                      [ ชื่อร้าน · teal ]                             │
│                         เข้าสู่ระบบ                                   │
│   ┌─────────── การ์ดกลาง (rounded-card, shadow-card, max-w-md) ───┐  │
│   │  สถานะ A: เลือกผู้ใช้        |  สถานะ B: ใส่ password           │  │
│   │  ┌─ avatar list ─┐          |   [Avatar] อุ้ม  · ผู้ดูแล        │  │
│   │  │ [A] อุ้ม  ผู้ดูแล│          |   ┌─────────────────────────┐   │  │
│   │  │ [B] บี   พนักงาน│          |   │ รหัสผ่าน      [Input]  👁 │   │  │
│   │  │ [+] อื่น ๆ...   │          |   └─────────────────────────┘   │  │
│   │  └───────────────┘          |   [ ← เปลี่ยนผู้ใช้ ] [ เข้าสู่ระบบ ] │  │
│   └─────────────────────────────────────────────────────────────┘  │
│                  ปุ่ม "ตั้งค่า" / สลับ theme (มุมล่าง, ghost)         │
└─────────────────────────────────────────────────────────────────────┘
```

**ลำดับความสำคัญ:** ผู้ใช้ที่เลือก + ช่อง password กลางจอ; ชื่อร้านรอง; chrome อื่นจาง `ghost` มุมจอ
**Rhythm:** สองสเต็ป A→B สไลด์แทนที่กันใน card เดียว (ไม่เด้ง modal ใหม่) — โฟกัสไม่หลุด, auto-focus ช่อง password เมื่อเข้าสเต็ป B

## 6. Key States
| state | ผู้ใช้เห็น/รู้สึก |
|-------|------------------|
| **เลือกผู้ใช้ (default)** | list avatar ของ user ที่เปิดใช้งาน + ชื่อ + badge role; คนเดียว → ข้ามไปสเต็ป B เลย |
| **ใส่ password** | avatar+ชื่อคนที่เลือกบนสุด, `Input type=password` (auto-focus) + ปุ่มสลับแสดง/ซ่อน, ปุ่ม "← เปลี่ยนผู้ใช้" |
| **กำลังตรวจ** | spinner สั้นบนปุ่ม "เข้าสู่ระบบ" (150–250ms feel) ไม่ block ทั้งจอ |
| **password ผิด** | ช่อง **สั่นแนวนอน (shake)** + ขอบ `border-destructive` + ข้อความ `text-destructive` "รหัสผ่านไม่ถูกต้อง"; ไม่เด้ง toast |
| **lockout** | หลังผิด N ครั้ง (เช่น 5, นับฝั่ง main process) → ปุ่ม disabled + "ลองใหม่ใน Xs" |
| **สำเร็จ** | เช็คเขียวสั้น → fade เข้าแอป |
| **โหลด** | skeleton avatar list (ไม่ใช่ spinner กลางจอ) |
| **ไม่มี user เลย** | ปกติไม่เกิด (Setup wizard ตั้ง admin แล้ว); เผื่อไว้: ข้อความ + ปุ่ม `default` ไปตั้งค่าพนักงาน |
| **Manager override (dialog)** | Dialog มาตรฐาน: "ต้องการสิทธิ์ผู้ดูแล" + ช่อง password admin, ปุ่ม [ยกเลิก `elevated`] [ยืนยัน `default`]; **ผลลัพธ์ไปทำรายการผ่าน IPC ที่ยืนยันแล้ว ไม่ใช่แค่ปลดล็อกปุ่ม** (audit R2); ใช้ lockout เดียวกับ login (G3) |
| **ลืมรหัสผ่าน (ชั้น 1)** | จากลิงก์ "ลืมรหัสผ่าน" → ช่องใส่ **recovery code** → ถูก → ฟอร์มตั้ง password ใหม่ + โชว์ recovery code ใหม่ครั้งเดียว |
| **ลืมรหัสผ่าน (ชั้น 2, vendor reset)** | ลิงก์ "ลืม recovery code ด้วย?" → โชว์ **machine code + license id** (อ่านให้ผู้ขาย) + ช่องกรอก "รหัสปลดล็อก" จากผู้ขาย → verify → ตั้ง password ใหม่ |

## 7. Interaction Model
- **คีย์บอร์ดเป็นหลัก:** สเต็ป A เลือกด้วยลูกศร/คลิก; สเต็ป B พิมพ์ password, **Enter = เข้าสู่ระบบ**, Esc = กลับเลือกผู้ใช้
- ปุ่ม **แสดง/ซ่อน password** (lucide `Eye`/`EyeOff`, `size-N`) — ระวังคนยืนข้างหลัง default ซ่อน
- **TitleBar ระหว่างวัน:** ปุ่ม avatar+ชื่อผู้ใช้ปัจจุบันขวาของ TitleBar → Popover: **ล็อกหน้าจอ / สลับผู้ใช้ / ออกจากระบบ**
- **ล็อกหน้าจอ** = กลับหน้า Login ไม่ปิดแอป/ไม่ล้าง cart
- **reduced-motion:** shake/slide/fade → crossfade/ทันที

## 8. Content Requirements (ไทย, no-emoji + lucide icons)
- หัวข้อ **"เข้าสู่ระบบ"** · ใต้ชื่อร้าน (จาก `settings.shop_name`)
- หน้าเลือก: avatar + ชื่อ + Badge role (`admin`=badge `primary-soft` "ผู้ดูแล", `staff`=badge `secondary` "พนักงาน")
- หน้า password: label "รหัสผ่าน", helper "เข้าสู่ระบบในชื่อ {ชื่อ}" (`text-xs text-muted-foreground`)
- error: "รหัสผ่านไม่ถูกต้อง" / "ลองใหม่อีกครั้งใน {n} วินาที"
- override dialog: title "ต้องการสิทธิ์ผู้ดูแล", body "รายการนี้ต้องให้ผู้ดูแลยืนยัน — ใส่รหัสผ่านผู้ดูแล", ปุ่ม "ยืนยัน"
- avatar fallback: อักษรแรกของชื่อบนพื้น token (`avatar` primitive)

## 9. การ map ลง design system (ไม่ต้องสร้าง primitive ใหม่แล้ว)
| ส่วน UI | ใช้ของที่มี |
|---------|-------------|
| โครงเต็มจอ + TitleBar | mirror `SetupWizard.tsx` |
| การ์ดกลาง | `SectionCard` / `Card` (`rounded-card` `shadow-card`) |
| avatar ผู้ใช้ | `avatar` primitive |
| badge role | `Badge` `primary-soft` / `secondary` |
| **ช่องรหัสผ่าน** | **`Input type="password"`** (ELEVATED default, มีอยู่แล้ว) + ปุ่มแสดง/ซ่อน `ghost` icon |
| ปุ่มแสดง/ซ่อน | `Button` `ghost` + lucide `Eye`/`EyeOff` (`size-N`) |
| override | `Dialog` มาตรฐาน (Header/Body/Footer ครบ ตาม modal contract) |
| เมนู TitleBar | `Popover` (มีใน TitleBar แล้ว) + ปุ่ม `ghost` |
| ปุ่มเข้าสู่ระบบ/CTA | `Button` `default` (teal) |

> **ไม่ต้องเพิ่ม primitive ใหม่เลย** (เดิมเคยต้องทำ `PinPad` — ตัดทิ้งเพราะเปลี่ยนเป็น password) ประกอบจากของเดิมล้วน → งานเบาลง, ไม่ต้องแตะ /theme showcase

## 10. Recommended references (impeccable) ตอน implement
- `animate.md` — shake error, slide A→B, fade success (+ reduced-motion)
- `clarify.md` — microcopy error/lockout
- `harden.md` — edge: lockout (main-process), ล็อกจอตอน cart ค้าง, session re-verify

## 11. Open Questions — เหลือข้อเดียว
- ✅ credential = เลือกชื่อ + password · ✅ ปุ่มแสดง/ซ่อน password = มี · ✅ ไม่มี auto-lock · ✅ login ใหม่ทุกครั้งเปิดโปรแกรม · ✅ ลืมรหัส = recovery code + vendor reset
- **Q (เหลือ) — avatar:** อักษรแรก+สี token พอ (assert) หรืออัปโหลดรูปทีหลัง (เฟสหลัง)
