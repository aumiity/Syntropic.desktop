---
name: project_gr_draft_persistence
description: GR (รับสินค้า) form survives navigation via grDraftStore + red count badge on sidebar
metadata:
  type: project
---

**DONE 2026-06-13 (tsc PASS; in-app verify pending)** — หน้ารับสินค้า (`src/pages/Purchase/index.tsx`) เดิม state เป็น local `useState` → สลับไปหน้าขายของแล้วกลับมา ข้อมูลหายหมด ต้องกรอกใหม่ทุกครั้ง. แก้โดยยก **เฉพาะ subset ที่ต้อง persist** ขึ้น Zustand store ใหม่ `src/stores/grDraftStore.ts` (`useGRDraftStore`, in-memory ล้วน — bridge การสลับแท็บในเซสชัน ไม่ใช่ข้าม app restart) — แนวเดียวกับ [[project_pos_redesign]]/cartStore ที่ทำให้ตะกร้า POS รอดการ navigate.

**กลไกใน Purchase/index.tsx:**
- `initialDraft = useRef(useGRDraftStore.getState().draft).current` จับ snapshot ครั้งเดียว → ทุก `useState` lazy-init จากมัน (`() => initialDraft?.x ?? default`).
- sync effect เขียน `setDraft({...})` ทุกครั้งที่ field เปลี่ยน (deps ครบทุกตัว persistable) → badge live + รอด navigate.
- mount effect: `if (!initialDraft || initialDraft.rows.length === 0) loadNextGR()` — มี draft ที่มีรายการ = คงเลข GR เดิม, ว่าง = ดึงเลขล่าสุด.
- `clearDraft()` ทั้งใน save-success และ resetForm (และ save-success ตอนนี้ reset adjust state ครบเหมือน resetForm แล้ว กัน footer สรุปค้าง).
- **Persist:** invoiceNo/supplier×3/dates/paymentType/dueDate/vatMode/isPaid/paidDate/grNote/rows/searchQueries + applied bill-adjust (adjustSubtotal/Discount/Surcharge, appliedDiscount/Surcharge, baseRowTotals). **Ephemeral (คงเป็น local, re-seed ตาม rows.length):** suggestions/searchTimers/activeRow/focusedCell/showMfg/modals/wizard/suppliers.

**Sidebar badge** (`src/components/layout/Sidebar.tsx`): เพิ่ม prop ใหม่ `countBadge?: number` บน `NavItem` = pill สีแดง (`bg-destructive text-destructive-foreground`, text-xs) โชว์ "เลข" จริง — **มุมไอคอนทั้งยุบและขยาย** (ตามที่เจ้าของขอ 2026-06-13) + ใส่ในวงเล็บ tooltip; ต่างจาก `hasBadge` (จุด dot สถานะ) เดิม. wire `countBadge={item.to === '/purchase' ? grDraftCount : undefined}`, `grDraftCount = useGRDraftStore(s => s.draft?.rows.length ?? 0)` (selector คืน number → re-render เฉพาะตอนเลขเปลี่ยน ไม่ใช่ทุก keystroke). `>99` แสดง `99+`.

⚠️ ยังไม่ได้ verify ในแอปจริง (สลับหน้าจริง + badge จริง).
