---
name: project-invoice-matcher-csv
description: "Invoice Matcher CSV export — verified correct; Power Automate fix is user-side, do not add xlsx writer"
metadata: 
  node_type: memory
  type: project
  originSessionId: 2a2a958e-33d4-4d39-93f0-859eaad96225
---

Invoice Matcher (จับคู่ใบส่งของ) export path: the CSV produced by `electron/services/matcher.ts` `buildCsv` + the BOM write in `electron/ipc/matcher.ts` is **verified correct by hex dump** (BOM, full barcode, zero-padded DD/MM/YYYY, leading-zero DDMMYY lot, CRLF, all cells quoted).

**Why:** User reported barcode as `8.40165E+11` and dates losing leading zeros — that is Excel mangling the *display* on double-click, NOT a file/code bug. The file bytes are spec-correct.

**How to apply:** Do NOT "fix" the CSV formatting code and do NOT add an xlsx-writing library (would risk `npm install` breaking better-sqlite3). The agreed fix is **user-side**: the Power Automate flow must read the CSV as plain text (split CRLF, split `,`, strip surrounding `"`) and NOT use an Excel connector. Full context + resume point in `sideproject.md` "Status (updated 2026-05-17)". The matcher feature nav lives in bottom-nav (auxiliary/test, may be removed before prod). Related: [[project-kho10-kho11]].
