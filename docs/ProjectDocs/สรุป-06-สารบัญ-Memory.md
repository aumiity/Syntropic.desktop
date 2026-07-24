# 🧠 สารบัญ Memory

> กลับไป [[สรุป-00-สารบัญ]] · ดัชนีไฟล์ความรู้ใน `.claude/memory/` (อ่านรายละเอียดในไฟล์จริง)
> สถานะ: ✅ DONE · 🟠 ACTIVE · ⏸️ paused · 🟡 deferred

---

## 📦 ระบบหลัก (project)

| Memory | สถานะ | สรุป |
|--------|-------|------|
| `project_ui_redesign_pass` | 🟠 ACTIVE | ปรับ UI ทีละหน้าตาม journey — ดู [[สรุป-04-งานที่ค้างอยู่]] |
| `project_user_login_licensing` | ✅/🟡 | login+session+role+recovery DONE; License เลื่อน |
| `project_hygeia_import` | ⏸️ paused | migration .mdb เสร็จ commit แล้ว; รอแอป prod-ready |
| `project_db_backup` | ✅ DONE | backup/export/restore แบบ stage-then-relaunch |
| `project_expenses` | ✅ DONE | bookkeeping + Finance KPI |
| `project_sales_documents` | 🟡 PIVOT | quotation ซ่อน; offload ไป FlowAccount (ยังไม่เริ่ม) |
| `project_vat_phasing` | 🟠 | Phase 1 DONE; Phase 2/3 + purchase VAT ค้าง |
| `project_drug_label` | ✅ DONE | section SSOT + dual-render; per-product print ค้าง |
| `project_receipt_sections` | ✅ DONE | thermal slip สไตล์รายกลุ่ม |
| `project_multi_date_picker` | ✅ DONE | picker วันที่มาตรฐานใหม่ |
| `project_printer_settings` | ✅ DONE | แท็บเครื่องพิมพ์รวม |
| `project_pos_qty_multiplier` | ✅ DONE | `5*`-then-scan |
| `project_login_mockup` | ✅ | LoginScreen wire IPC จริง |
| `project_cost_model` | 🟡 | 3-cost model; Reports audit + GR-cancel ค้าง |
| `project_next_systems_backlog` | 📋 | backlog เก่า 2026-05-30 (ส่วนใหญ่ทำไปแล้ว) |

## 🔧 Refactor (ส่วนใหญ่ paused — ดู [[สรุป-04-งานที่ค้างอยู่]] ข้อ 7)

| Memory | สถานะ |
|--------|-------|
| `project_box_border_audit` | ⏸️ ACTIVE paused |
| `project_pos_redesign` | ⏸️ ACTIVE paused |
| `project_edit_parity_pass` | ⏸️ ACTIVE paused |
| `project_table_pattern_refactor` | ⏸️ ACTIVE paused |
| `project_column_visibility` | ⏸️ ACTIVE paused |
| `theme_tokenization` | ⏸️ paused (~449 literals ค้าง) |
| `project_manage_restructure` | 🟠 ACTIVE priority |

## 🟡 Deferred / side

| Memory | สถานะ |
|--------|-------|
| `project_kho10_kho11` | 🟡 DEFERRED รอ spec อย. |
| `project_invoice_matcher_csv` | 🔧 side project (fix ฝั่ง Power Automate) |
| `project_studio_architecture` | ℹ️ Syntropic.Studio cross-platform infra |
| `project_design_doc_consolidation` | ✅ DONE — docs/claude/ui-*.md = SSOT |

## 🎨 Feedback / กฎดีไซน์ (ดู [[สรุป-05-กฎเหล็กสถาปัตยกรรม]])

| Memory | เนื้อหา |
|--------|---------|
| `feedback_design_rules_2026-06` | no tertiary/brand-soft; tabular-nums BANNED; animation ต้องขออนุญาต |
| `ipc-role-enforcement` | session map + requireAdmin + HashRouter gate |
| `input-elevated-default-flip` | Input default = ELEVATED |
| `card-border-default` | base Card มี border default |
| `feedback_modal_behavior` | no outside-click; Esc ปิด; Enter = OK |
| `feedback_button_icon_size` | icon ใน Button ใช้ `size-N` |
| `feedback_text_size` | min = text-sm |
| `feedback_scrollbar_thin` | scrollbar 10px |
| `feedback_confirm_dialog_content_pattern` | confirm dialog ใช้ info-card ใน content slot |
| `feedback_tsc_discipline` | ไม่ต้อง tsc ทุก edit |
| `feedback_read_doc_before_ui_edit` | อ่าน docs/claude/ui-*.md ก่อนแตะ UI + กฎ h-12/h-9 |
| `feedback_animation_reduced_motion` | ใช้ setTimeout ไม่ใช่ onAnimationEnd |
| `project_box_border_audit` | border = accent token opacity ต่ำ |

---

## 📁 โครงสร้างเอกสารในโปรเจค

```
docs/
├─ claude/          ← เอกสารละเอียดราย domain (SSOT ดีไซน์ + business logic)
│  ├─ database.md · business-logic.md · ipc-api.md
│  └─ ui-theming.md · ui-table-card.md · ui-components.md · pos.md
├─ plans/           ← แผนงาน (done/ = เสร็จแล้ว)
│  ├─ ui-redesign-pass.md   ← tracker งานปัจจุบัน
│  ├─ License_Activation_System.md · Hygeia_Import.md · sideproject.md
├─ audits/          ← ผล audit แผนก่อน implement
└─ สรุป-*.md         ← ⭐ ชุดสรุปนี้

.claude/memory/     ← ความรู้โปรเจค (repo-tracked, travels with git)
└─ MEMORY.md        ← ดัชนีหลัก (import เข้าทุก session ผ่าน CLAUDE.md)
```
