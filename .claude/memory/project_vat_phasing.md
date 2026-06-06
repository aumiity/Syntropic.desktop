---
name: project_vat_phasing
description: "VAT redesign as 3 phases — single codebase, VAT decided at install not toggled; Phase 1 (setup wizard) DONE 2026-05-31"
metadata: 
  node_type: memory
  type: project
  originSessionId: c7d6b00d-b07d-4ffe-8cde-081ec601f91f
---

VAT is being reworked because the old free on/off toggle in Settings let an operator disable VAT for one bill then re-enable — leaving an auditable gap in the continuous RC- invoice sequence (สรรพากร tax-evasion red flag). Operator-agreed direction:

- **Do NOT fork the app** into separate VAT / NO-VAT builds (rejected — double maintenance). One codebase, a shop-status flag.
- VAT is a **one-time decision made at install**, not a daily toggle. A VAT shop charges VAT from bill #1 and cannot silently turn it off.
- Per-product VAT-exempt is **NOT** being built — operator confirmed all goods are taxable. (Off-the-books / "ขายนอกระบบ" mode was requested once and **refused** — tax evasion; do not build.)

**Phasing:**
- **Phase 1 — DONE 2026-05-31:** first-run setup wizard forces shop identity (name/address/phone required — print on labels) + the one-time VAT choice, gated in `App.tsx` via `settings.setup_completed`. See PROGRESS.md block + [[project_next_systems_backlog]]. Plan `docs/plans/first-run-setup.md`, audit `docs/audits/first-run-setup-audit.md`. **NOT click-tested yet.**
- **VAT-registered path BLOCKED at setup (2026-06-06):** ในระหว่าง [[project_ui_redesign_pass]] เจ้าของสั่ง — ขั้น "ภาษี (VAT)" ของ `SetupWizard.tsx` เลือก "จดทะเบียน VAT" **ไม่ผ่าน**: `validateStep2` คืน false + toast "ระบบยังไม่สามารถใช้งานได้" และ UI แทนช่อง tax-id/branch/rate/date ด้วยกล่อง warning. เหตุผล: VAT subsystem (Phase 2/3) ยังไม่พร้อม ร้านจึง onboard เป็น VAT ไม่ได้ตอนนี้ (ใช้ร้านตัวเอง = NO-VAT ก่อน). **state vars (taxId/branch/vatRate/vatDate) + payload completeSetup คงไว้** (vatChoice='yes' เป็น dead path) → re-enable = เอา field กลับ + ปลด early-return ใน validateStep2 (มี comment ชี้ทางในไฟล์)
- **Phase 2 — pending:** hide ALL VAT UI throughout when shop is NO-VAT mode.
- **Phase 3 — pending:** lock/remove the Settings VAT toggle + a guarded "upgrade to VAT" flow (re-enter registration data + effective date + audit log) so VAT can never be flipped off mid-stream.

**NOTE — purchase-side VAT NOT built yet.** Current VAT is **output/sales VAT only** (`sales.total_vat`, extracted at POS). There is no **input/purchase VAT** (ภาษีซื้อ) captured on goods received — so we can't yet produce ภ.พ.30 (VAT payable = output VAT − input VAT) or a ภาษีซื้อ report. Building purchase VAT (capture VAT on GR/purchase, then the ภ.พ.30 netting + ภาษีซื้อ-ภาษีขาย reports) is an outstanding TODO, separate from the Phase 1–3 above.

Key fact confirmed while designing: VAT is **snapshotted per-sale** (`sales.total_vat` / `sale_items.unit_vat` written at sale time from the then-current `sales_settings.vat_enabled`/`vat_rate`; reprints read the stored value via `normalizeSale.ts`). So enabling VAT never retroactively re-VATs old bills — correct per tax law.
