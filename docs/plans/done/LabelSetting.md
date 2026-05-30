Here is Claude's plan:
╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌
 LabelSettingsTab redesign — make the label template actually printable

 Context

 src/pages/Settings/LabelSettingsTab.tsx today is config-only: it edits paper / font /
 spacing rows in the label_settings singleton and renders a static HTML preview with
 hardcoded "Paracetamol 500mg" sample text. The page has no print button — and the repo
  has no label-printing pipeline at all (only an ESC/POS receipt pipeline at
 electron/ipc/printer.ts that talks TCP to a thermal printer, which is the wrong fit
 for mm+pt labels).

 The schema is otherwise ready: label_settings holds the template, product_labels
 already holds per-product dosage/frequency/timing/indication/note (TH/MM/ZH), and
 settings.shop_* provides the shop header. Per-product label content is edited in
 src/pages/Products/EditProduct/LabelsTab.tsx — that page is out of scope here.

 This change turns LabelSettings into a usable template editor + test printer:

 1. Each label line (shop header, product name, dosage, indication, notes, lot/expiry,
 barcode) becomes individually toggleable AND independently nudgeable in X/Y (mm).
 2. A "ทดสอบพิมพ์" button silently prints one sample label via the system print pipeline
 to a user-selected printer (Electron webContents.print({silent:true, deviceName,
 pageSize})).
 3. Sample data stays hardcoded — preview composition matches the actual print output
 1:1, so what you see is what comes out of the printer.

 Workflow integration (POS / EditProduct triggering a real label print) is out of scope
  for this PR per the user. Only the settings page + test print.

 ---
 Implementation

 1. Schema additions — electron/db/schema.ts

 Append to the existing label_settings CREATE TABLE (around line 405–424) for fresh
 installs, AND add matching ALTER TABLE ... ADD COLUMN entries to the existing
 safe-migration array (around line 527) so existing DBs upgrade silently — that array's
  try/catch pattern is the project's standard migration mechanism (line 569ff. is a
 recent example).

 New columns on label_settings — all sized to match the existing column convention:

 printer_name TEXT NOT NULL DEFAULT '',          -- selected OS printer device name; ''
  = system default

 -- per-section visibility
 show_shop          INTEGER NOT NULL DEFAULT 1,
 show_product       INTEGER NOT NULL DEFAULT 1,
 show_dosage        INTEGER NOT NULL DEFAULT 1,
 show_indication    INTEGER NOT NULL DEFAULT 1,
 show_notes         INTEGER NOT NULL DEFAULT 1,
 show_lot_expiry    INTEGER NOT NULL DEFAULT 1,
 show_barcode       INTEGER NOT NULL DEFAULT 0,

 -- per-section X/Y nudge (mm). 0 = flow position; positive = right/down.
 offset_x_shop       REAL NOT NULL DEFAULT 0,
 offset_y_shop       REAL NOT NULL DEFAULT 0,
 offset_x_product    REAL NOT NULL DEFAULT 0,
 offset_y_product    REAL NOT NULL DEFAULT 0,
 offset_x_dosage     REAL NOT NULL DEFAULT 0,
 offset_y_dosage     REAL NOT NULL DEFAULT 0,
 offset_x_indication REAL NOT NULL DEFAULT 0,
 offset_y_indication REAL NOT NULL DEFAULT 0,
 offset_x_notes      REAL NOT NULL DEFAULT 0,
 offset_y_notes      REAL NOT NULL DEFAULT 0,
 offset_x_lot_expiry REAL NOT NULL DEFAULT 0,
 offset_y_lot_expiry REAL NOT NULL DEFAULT 0,
 offset_x_barcode    REAL NOT NULL DEFAULT 0,
 offset_y_barcode    REAL NOT NULL DEFAULT 0,

 No IPC change needed in electron/ipc/settings.ts — saveLabelSettings already builds
 dynamic SQL from Object.keys(data) (line 181), so any new column flows through
 automatically once the schema knows it.

 2. Printer IPC handlers — electron/ipc/printer.ts

 Append two new handlers to registerPrinterHandlers(). Both reuse the existing
 main-window webContents (no hidden BrowserWindow needed for getPrintersAsync; the
 print handler builds a one-shot hidden window from the rendered HTML).

 // list system printers for the dropdown
 ipcMain.handle('printer:listPrinters', async () => {
   const win = BrowserWindow.getAllWindows()[0]
   if (!win) return []
   return await win.webContents.getPrintersAsync()
   // returns Array<{ name, displayName, description, status, isDefault }>
 })

 // silent print one label
 ipcMain.handle('printer:printLabel', async (_e, args: {
   html: string                 // full HTML document, including <style> with @page
   printerName: string          // '' = system default
   paperWidthMm: number
   paperHeightMm: number
 }) => {
   const w = new BrowserWindow({ show: false, webPreferences: { offscreen: false } })
   try {
     await w.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(args.html))
     await new Promise<void>((resolve, reject) => {
       w.webContents.print({
         silent: true,
         deviceName: args.printerName || undefined,
         // Electron pageSize is in microns: 1 mm = 1000 µm
         pageSize: { width: args.paperWidthMm * 1000, height: args.paperHeightMm * 1000
  },
         margins: { marginType: 'none' },
         printBackground: false,
         color: false,
       }, (success, failureReason) => success ? resolve() : reject(new
 Error(failureReason)))
     })
     return { success: true }
   } catch (e: any) {
     return { success: false, error: e.message }
   } finally {
     w.destroy()
   }
 })

 Note: must import { BrowserWindow } from 'electron' at top of file.

 3. Preload bridge — electron/preload.ts

 Extend window.api.printer (currently around line 130–133, alongside
 printReceipt/openCashDrawer):

 listPrinters: () => ipcRenderer.invoke('printer:listPrinters'),
 printLabel: (args: { html: string; printerName: string; paperWidthMm: number;
 paperHeightMm: number })
   => ipcRenderer.invoke('printer:printLabel', args),

 Update the matching TS type declaration (same file — the d.ts-style block for
 window.api).

 4. Page redesign — src/pages/Settings/LabelSettingsTab.tsx

 Keep the two-column layout. LEFT column gains a printer card and a per-section
 "บรรทัดบนฉลาก" card; RIGHT column gains a printer dropdown and Test Print button beside
  the preview.

 Form state shape — extend the existing form object with the new fields above. Defaults
  from LABEL_SETTINGS_DEFAULTS constant (already implicit in useState initialization at
  line 24); merge over data from the IPC load just like today.

 LEFT column cards (in order):

 1. เครื่องพิมพ์ & กระดาษ (icon: Printer, tint: primary) — new card combining printer
 choice and paper size.
   - Printer <Select> populated from window.api.printer.listPrinters() on mount (effect
  that runs once). First item = "เครื่องพิมพ์ระบบ (ค่าเริ่มต้น)" mapping to ''.
   - Paper W × H (mm) — moved from the old "ขนาดกระดาษ" card.
   - Padding T/R/B/L (mm) — same row pattern as today.
   - The "บันทึก" button stays on this card's right slot (top-right header), as today.
 2. ฟอนต์ (Type, warm) — unchanged from current implementation.
 3. บรรทัดบนฉลาก (AlignLeft or LayoutList, info-soft) — new card. One row per section,
 each row:

 [Toggle show] [Section label "ชื่อร้าน"] [X (mm) input w-16] [Y (mm) input w-16]

 3. Sections (in render order): shop, product, dosage, indication, notes, lot_expiry,
 barcode. Use a SECTION_ROWS constant array to drive both this card and the preview, so
  they stay in sync. X/Y inputs allow negative values; step 0.5.
 4. ระยะห่าง (MoveVertical, info-soft) — unchanged.

 RIGHT column (preview card):

 - Header right slot: printer name shown as a Badge + <Button
 onClick={handleTestPrint}> "ทดสอบพิมพ์" (icon: Printer).
 - Preview wrapper renders at true mm scale: outer div with width:
 ${form.paper_width}mm; height: ${form.paper_height || 'auto'}mm and CSS class
 providing the dashed border (border lives on a parent so the inner div's mm size is
 exact). If the paper exceeds the panel width, wrap in transform: scale(...) with
 transform-origin: top left and a clamp so the preview never overflows visibly — but
 the inner HTML used for printing must NOT be scaled (see handleTestPrint below).
 - Each section rendered conditionally on show_*, positioned via position: relative;
 transform: translate(${offset_x_*}mm, ${offset_y_*}mm) so flow-stacking still works
 but each line can be nudged independently. Hardcoded sample text stays as it is today;
  add indication, notes, lot_expiry, and barcode sections that don't exist yet (barcode
  = a placeholder <div> with monospace bars, or a simple text "▮▮▮ 8851234567890"; real
  barcode rendering is not in scope).

 Test-print handler — composes a standalone HTML document and invokes the silent-print
 IPC:

 const handleTestPrint = async () => {
   const html = `<!doctype html><html><head><meta charset="utf-8">
     <style>
       @page { size: ${form.paper_width}mm ${form.paper_height || 'auto'}mm; margin: 0;
  }
       html, body { margin: 0; padding: 0; }
       body {
         width: ${form.paper_width}mm;
         ${form.paper_height ? `height: ${form.paper_height}mm;` : ''}
         padding: ${form.padding_top}mm ${form.padding_right}mm
 ${form.padding_bottom}mm ${form.padding_left}mm;
         font-family: ${form.font_family}, sans-serif;
         line-height: ${form.line_spacing};
         color: #000; background: #fff;
         box-sizing: border-box;
       }
       .sec { position: relative; }
     </style></head><body>
     ${renderSectionsAsHtml(form)}
   </body></html>`

   const res = await window.api.printer.printLabel({
     html,
     printerName: form.printer_name,
     paperWidthMm: form.paper_width,
     paperHeightMm: form.paper_height || form.paper_width, // 0 = let printer auto, but
  Electron requires a number → fall back to width
   })
   if (res.success) toast({ title: 'ส่งงานพิมพ์แล้ว', variant: 'success' })
   else            toast({ title: 'พิมพ์ไม่สำเร็จ', description: res.error, variant:
 'error' })
 }

 Extract a renderSectionsAsHtml(form) helper alongside the JSX preview so both paths
 emit identical markup. Each section emits <div class="sec" style="transform:
 translate(Xmm, Ymm); font-size: ...pt; font-weight: ...">…</div> gated by its show_*
 flag.

 Cleanup of the existing preview: today's preview hardcodes a 2.5× scale
 (Math.min(form.paper_width * 2.5, 400)px). That diverges from print output. Replace
 with the true-mm + optional scale-down approach above so preview matches print.

 ---
 Files to modify

 ┌─────────────────────────────────────────┬────────────────────────────────────────┐
 │                  File                   │                 Change                 │
 ├─────────────────────────────────────────┼────────────────────────────────────────┤
 │                                         │ Add columns to label_settings CREATE   │
 │ electron/db/schema.ts                   │ TABLE; add matching ALTER TABLE        │
 │                                         │ entries to the safe-migration array    │
 │                                         │ (~line 527)                            │
 ├─────────────────────────────────────────┼────────────────────────────────────────┤
 │                                         │ Import BrowserWindow; add              │
 │ electron/ipc/printer.ts                 │ printer:listPrinters and               │
 │                                         │ printer:printLabel handlers            │
 ├─────────────────────────────────────────┼────────────────────────────────────────┤
 │                                         │ Expose listPrinters and printLabel on  │
 │ electron/preload.ts                     │ window.api.printer; update TS type     │
 │                                         │ block                                  │
 ├─────────────────────────────────────────┼────────────────────────────────────────┤
 │ src/pages/Settings/LabelSettingsTab.tsx │ Full redesign per section 4 above      │
 └─────────────────────────────────────────┴────────────────────────────────────────┘

 No changes to src/pages/Products/EditProduct/LabelsTab.tsx (per-product content is
 already wired and out of scope).

 ---
 Verification

 1. Start dev: npm run electron:dev (per CLAUDE.md — never npm install).
 2. Schema migration: open the app on an existing DB; check no error in main-process
 console. Open SQLite (or run a quick SELECT * FROM label_settings) — confirm new
 columns exist with default values.
 3. Printer list: open Settings → Label tab. Printer dropdown should populate with the
 OS printers (on macOS this includes "PDF Printer" and physical printers; on Windows
 includes "Microsoft Print to PDF").
 4. Toggles: tick/untick each "show" toggle — the matching section must
 disappear/reappear from the preview immediately.
 5. Offsets: change X/Y for one section to e.g. 5, 2 — section visibly shifts 5mm right
  and 2mm down in the preview without moving the others.
 6. Save: click "บันทึกการตั้งค่า"; reload the page; all values persist.
 7. Test print:
   - Pick "Microsoft Print to PDF" (Win) or "Save as PDF" (macOS) for a safe paper-free
  test.
   - Click "ทดสอบพิมพ์" — a PDF file dialog appears (silent print to PDF still pops a
 save dialog on most OSes; physical printers go silent).
   - Open the resulting PDF — confirm paper dimensions match paper_width ×
 paper_height, padding is correct, sections appear/disappear per toggles, and section
 offsets match preview at 1:1 scale.
 8. Real printer (if available): pick a physical label printer, click "ทดสอบพิมพ์" —
 sticker comes out matching preview.
 9. Failure path: temporarily unplug the selected printer (or pick a stale device
 name), click "ทดสอบพิมพ์" — error toast with the OS failure reason should appear; UI
 doesn't crash.