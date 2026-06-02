---
name: project_sales_documents
description: Sales-documents roadmap — quotation status overhaul (Phase A DONE) + planned Invoice subsystem (Phase B/C)
metadata:
  type: project
---

Operator wants a 3-stage B2B sales-document flow: **ใบเสนอราคา (Quotation) → ใบแจ้งหนี้ (Invoice) → บิลขาย (Sale)**, surfaced under one menu "เอกสารการขาย" with tabs (ใบเสนอราคา | ใบแจ้งหนี้). Decided 2026-06-02.

**Phase A — quotation status overhaul — DONE 2026-06-02.** Statuses are now: `ร่าง(draft)` → `รอตอบรับ(sent)` → `ยอมรับ(accepted)` ; plus `ปฏิเสธ(rejected)`, `พ้นกำหนด(expired)`, `ยกเลิก(canceled)`. Relabels: sent ส่งแล้ว→รอตอบรับ, accepted ตอบรับ→ยอมรับ, field ยืนราคา→**ครบกำหนด**.
- `expired` is **derived, not stored** — draft/sent past `valid_until` (ครบกำหนด). Predicate `EXPIRED` lives in `electron/ipc/quotation.ts` list handler; draft/sent buckets EXCLUDE expired so counts are mutually exclusive. Frontend `effectiveStatus()`/`displayStatus()` mirror it.
- `canceled` is a real terminal status (no migration — `status` is plain TEXT, no CHECK). Cancel allowed from draft/sent/accepted (`CANCELABLE`), via ConfirmDialog. setStatus guard in IPC updated.
- `converting`/`converted` (the quote→POS-sale conversion flow) were KEPT unchanged — they sit behind the 6 user-facing statuses.
- Touched: `src/types/index.ts`, `electron/ipc/quotation.ts` (setStatus transitions + list filter/summary), `src/pages/Quotation/QuotationList.tsx` (labels/tabs/cards/cancel), `src/pages/Quotation/EditQuotation.tsx`. List cards stayed at 5 (relabeled); expired/canceled are tabs only, not cards.

**PIVOT 2026-06-02 — offload documents to FlowAccount; Phase B/C CANCELLED.** Operator decided NOT to build the in-app invoice/document subsystem. Sales documents (quotation, invoice) will be pushed to **FlowAccount** (cloud accounting, has an Open API: OAuth2 client-credentials, sandbox `https://openapi.flowaccount.com/sandbox` + prod `/v3-alpha`, client-id/secret from MyCompany→Connection, SDKs on github.com/flowaccount). The app keeps only: POS, บิลเงินสด, ใบกำกับภาษี, financial summaries.
- **Quotation module HIDDEN, not deleted** — Sidebar link commented out (`src/components/layout/Sidebar.tsx`), routes still in `App.tsx`. All code kept. Documented in CLAUDE.md "Hidden / parked features".
- **FlowAccount integration NOT STARTED — operator has no account yet.** When ready: call from Electron MAIN process (Node https, not renderer — CORS + secret safety, use safeStorage for tokens); push model (sale → create FlowAccount doc); MUST queue+retry in SQLite since app is offline-capable (network down ≠ sale blocked); FlowAccount owns official doc numbers. Verify before building: their plan/tier allows Open API, which doc types API can create (cash sale + tax invoice), rate limits, VAT mapping (our model is inclusive). Do a sandbox spike (auth → create 1 cash bill) first.
- **Phase B (in-app Invoice subsystem) and Phase C (เอกสารการขาย nav tabs) are CANCELLED** in favour of FlowAccount.

Also in flight: quotation **print template redesign** (`src/lib/receipt/buildQuotationHtml.ts`) — gold-accent layout, shop info top-left, signatures footer, `bahtText()` added to `src/lib/utils.ts`. User iterating on layout (tried GrapesJS, will send Pages PDF/PNG for me to port).
