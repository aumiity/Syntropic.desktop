# Claude Code "Terminal" Dark Theme — Reference Template

ถอดมาจาก skill `session-report` ของ Anthropic
(`~/.claude/plugins/marketplaces/claude-plugins-official/plugins/session-report/skills/session-report/template.html`)
เก็บไว้เป็น reference เผื่อใช้ทำ dark mode ของ Syntropic — **อ้างอิงเฉย ๆ ยังไม่ผูกกับโค้ดจริง**

> หมายเหตุ: ของเขาเป็นหน้า HTML รายงานสแตนด์อโลน ใช้ฟอนต์ mono ล้วน + ธีม "หน้าจอ terminal".
> ถ้าจะหยิบมาใช้ ให้เอา **ระบบสี + แนวการจัดโครงสร้าง** มา map เข้ากับ semantic token ของเรา
> (`src/index.css` `:root`/`.dark` + `tailwind.config.js`) อย่าก๊อป hex ดิบ ๆ ลงใน component ตรง ๆ
> (ผิดกฎ HARD: ห้าม Tailwind palette literal / ต้องใช้ semantic token).

---

## 1. Palette (CSS variables ต้นฉบับ)

ทั้งหมดนิยามใน `:root` ของ template เดียว (ไม่มีโหมดสลับ — มันเป็น dark ตายตัว):

| ตัวแปร | ค่า | บทบาท | เทียบ token เราโดยประมาณ |
|--------|-----|--------|----------------------------|
| `--ivory` | `#FAF9F5` | พื้นนอกสุดของหน้า (รอบ ๆ กล่อง terminal) สีครีมสว่าง | `background` (light) |
| `--term-bg` | `#1a1918` | พื้นกล่อง terminal (ตัวเนื้อหา) — ดำอมน้ำตาล | `background`/`card` (dark) |
| `--titlebar` | `#252321` | แถบหัวหน้าต่าง (titlebar) เข้มกว่า body นิด | `muted`/`secondary` (dark) |
| `--term-fg` | `#d1cfc5` | ตัวอักษรหลัก สีครีมหม่น | `foreground` (dark) |
| `--dim` | `rgb(136,136,136)` | ตัวอักษรรอง / label | `muted-foreground` |
| `--subtle` | `rgb(80,80,80)` | ตัวอักษรจางสุด / เส้นคั่น / placeholder | `muted-foreground` จาง / `border` |
| `--outline` | `rgba(255,255,255,0.08)` | เส้นขอบ / เส้นแบ่งตาราง | `border` (dark, แบบโปร่ง) |
| `--hover` | `rgba(255,255,255,0.035)` | พื้น hover ของแถว/ปุ่ม | `accent`/hover overlay |
| **`--clay`** | **`#D97757`** | **accent หลัก (ส้มอิฐ Anthropic)** — heading, ตัวเลขเด่น, link, selection | `primary` / brand accent |
| `--green` | `rgb(78,186,101)` | สำเร็จ / สัญญาณดี | `success` |
| `--red` | `rgb(255,107,128)` | เสีย / anomaly | `destructive` |
| `--blue` | `rgb(177,185,249)` | ข้อมูลเป็นกลาง / `code` | `info` |
| `--yellow` | `rgb(255,193,7)` | เตือน | `warning`/`accent(yellow)` |

ฟอนต์: `--mono: 'JetBrains Mono', 'SF Mono', ui-monospace, Menlo, Monaco, monospace;`
ตัวเลขใช้ `font-variant-numeric: tabular-nums;` (⚠️ ของเรากฎห้าม `tabular-nums` — ข้ามตรงนี้)

### สีเสริม (palette สำหรับ chart หลายชุด — ใช้กับ gantt/legend)
```
rgb(177,185,249)  #4eba65(green)  #D97757(clay)  rgb(255,193,7)
rgb(255,107,128)  #9b8cff         #6ec1d6        #c792ea
```
ชุดนี้คือ "categorical palette" — เวลามีหลายโปรเจกต์/ซีรีส์ วนสีจากลิสต์นี้

### โทนแทรกพื้นสว่าง (inset card บนพื้นเข้ม)
ใช้กับกล่อง transcript ที่อยากให้อ่านง่ายแบบกระดาษ:
| ตัวแปร/ค่า | ใช้ทำ |
|-----------|--------|
| `#F0EEE6` | พื้นกล่อง inset (ครีม) |
| `#1a1918` | ตัวอักษรในกล่อง inset |
| `#87867F` | meta/timestamp ในกล่อง inset |
| `#BD5E6D` / `#A63244` | เส้น+ตัวอักษร highlight แบบ "cache break" (โทนแดงอมชมพู) |

---

## 2. แนวคิดดีไซน์ (สิ่งที่ทำให้มัน "สวยแบบ terminal")

1. **กล่อง terminal กลางจอ** — `max-width: 1180px`, `border-radius: 8px`, `outline: 1px solid` (โปร่งขาว 8%), เงานุ่มลึก `0 20px 60px rgba(20,20,19,.22)` ลอยอยู่บนพื้นครีม
2. **Titlebar จุดสามจุด** — จุดกลม 11px สีเทาเข้ม (ไม่ใช่ traffic-light สี) + path ชิดซ้าย สีจาง
3. **บรรทัดคำสั่ง** — `> claude usage --since 7d` โดย `>` = clay, flag = blue เลียนแบบ prompt
4. **Hero ตัวเลขใหญ่** — ตัวเลขรวม 56px หนา 700, หน่วย (M/B) เป็นสี clay, label เป็นสีจาง
5. **หัวข้อ section แบบ ASCII** — เส้นคั่น `.hr` วาดด้วยตัวอักษร `─` ยาวเต็มบรรทัด แล้ว overflow ตัด; heading `h2` มี `▸` นำหน้า สี clay + hint สีจางต่อท้าย
6. **บาร์แบบ block-char** — วาดด้วยตัวอักษร `█` (เต็ม) + `░` (ว่าง) ไม่ใช่ `<div>` ความกว้าง — ได้ลุค terminal แท้
7. **Drill-down ด้วย `<details>/<summary>`** — คลิกกางดู context ไม่ใช้ JS modal
8. **ตาราง sticky + คลิกหัวเรียง** — หัวตาราง sticky, คลิกสลับ asc/desc, คอลัมน์ที่เรียงอยู่เป็นสี clay + ลูกศร ↓/↑
9. **`::selection` = พื้น clay ตัวอักษร term-bg** — ไฮไลต์เลือกข้อความก็ยังอยู่ในธีม

---

## 3. โครงสร้าง layout (ลำดับ section)

```
.term  (กล่อง terminal)
├─ .titlebar          ● ● ●   ~/.claude — session-report
└─ .term-body
   ├─ .cmd            > claude usage --since 7d
   ├─ #meta-line      ช่วงวันที่ · root path
   ├─ #hero          ┌ ตัวเลขรวมใหญ่ + บรรทัดสรุป input/output/cache
   │
   ├─ section: findings        (.hr + ▸ + การ์ด .take สี bad/good/info)
   ├─ section: summary         (#overall-grid — stat grid)
   ├─ section: tokens by project (block-char .bar)
   ├─ section: session timeline  (.days pills + .gantt)
   ├─ section: most expensive prompts (.drill <details>)
   ├─ section: cache breaks    (.drill <details>)
   ├─ section: projects        (ตาราง sortable)
   ├─ section: subagent types  (ตาราง sortable)
   ├─ section: skills          (ตาราง sortable)
   ├─ section: recommendations (.callout)
   └─ footer                   generated … · N sessions
```

แต่ละ section มี pattern เดียวกัน:
```html
<section>
  <div class="hr"></div>           <!-- เส้น ─── เต็มบรรทัด -->
  <h2>ชื่อ<span class="hint">คำอธิบายจาง</span></h2>
  <div class="section-body">…</div>
</section>
```

---

## 4. ชิ้นส่วน UI ที่หยิบไปใช้ซ้ำได้ (CSS ย่อ)

### 4.1 Takeaway / finding card (เขียว/แดง/น้ำเงิน)
```css
.take { display:grid; grid-template-columns:9ch 1fr; gap:18px; padding:6px 0; align-items:baseline; }
.take .fig { text-align:right; font-weight:700; font-size:15px; }   /* ตัวเลขเด่น */
.take .txt { color:var(--dim); }
.take .txt b { color:var(--term-fg); font-weight:500; }
.take.bad  .fig { color:var(--red);   }   /* ของเสีย/anomaly */
.take.good .fig { color:var(--green); }   /* สัญญาณดี */
.take.info .fig { color:var(--blue);  }   /* กลาง */
```
```html
<div class="take bad"><div class="fig">41.2%</div>
  <div class="txt"><b>cc-monitor</b> กิน 41% ของทั้งสัปดาห์</div></div>
```

### 4.2 Stat grid (สรุปตัวเลข auto-fit)
```css
#overall-grid { display:grid; gap:4px 28px; grid-template-columns:repeat(auto-fit,minmax(150px,1fr)); }
.stat .label  { font-size:11px; color:var(--dim); }
.stat .val    { font-size:20px; font-weight:500; }
.stat .detail { font-size:11px; color:var(--subtle); }
```

### 4.3 Block-char bar
```css
.bar { display:grid; grid-template-columns:26ch 1fr 8ch; gap:14px; align-items:center; }
.bar .blocks { color:var(--clay); white-space:pre; overflow:hidden; }
.bar .blocks .empty { color:var(--subtle); }   /* ░ ส่วนที่ว่าง */
.bar .pct { text-align:right; color:var(--dim); }
.bar:hover .name { color:var(--clay); }
```
เติมด้วย JS: `'█'.repeat(n) + '░'.repeat(W-n)` โดย `W=48` ช่อง

### 4.4 Callout (ข้อเสนอแนะ — แท่งซ้าย)
```css
.callout { padding:6px 0 6px 14px; border-left:2px solid var(--subtle); color:var(--dim); }
.callout b, .callout code { color:var(--term-fg); }
```

### 4.5 ตาราง sortable + sticky
```css
.scroll { max-height:440px; overflow:auto; border-top:1px solid var(--outline); border-bottom:1px solid var(--outline); }
th { position:sticky; top:0; background:var(--term-bg); font-size:11px; color:var(--subtle);
     cursor:pointer; border-bottom:1px solid var(--outline); }
th:hover { color:var(--dim); }
th.sorted { color:var(--clay); }
th.sorted::after     { content:' ↓'; }
th.sorted.asc::after { content:' ↑'; }
td { border-top:1px solid rgba(255,255,255,0.04); }
tbody tr:hover td { background:var(--hover); }
```

### 4.6 เส้นคั่น ASCII + heading
```css
.hr::after { content:'────────…────'; }   /* ยาวเกินจอแล้วตัด overflow */
.hr { color:var(--subtle); overflow:hidden; white-space:nowrap; }
h2 { color:var(--clay); font-weight:500; }
h2::before { content:'▸ '; }
h2 .hint { color:var(--subtle); font-size:11px; font-weight:400; margin-left:10px; }
```

---

## 5. วิธีหยิบไปทำ Dark Mode ของ Syntropic (ข้อเสนอ)

**สิ่งที่ "ยืม" ได้ดี:**
- **ระบบบทบาทสี** (accent เดียวเด่น + 4 สีสถานะ green/red/blue/yellow) — ตรงกับแนวเรา (primary + success/destructive/info/warning) อยู่แล้ว แค่ของเขา accent = clay ส้มอิฐ ส่วนเราคือ teal+yellow
- **โทนพื้นเข้มอมอุ่น** `#1a1918` (ไม่ใช่ดำสนิท/น้ำเงินเทา) + ตัวอักษร `#d1cfc5` (ครีมหม่น ไม่ใช่ขาวจัด) — สบายตากว่า dark สีเทากลาง น่าลองปรับ `.dark` `background`/`foreground` ให้อุ่นขึ้น
- **border แบบโปร่งขาว** `rgba(255,255,255,0.08)` + hover `rgba(255,255,255,0.035)` — เทคนิคดี dark mode: เส้น/hover เป็น overlay โปร่งแทนสีตายตัว ปรับตามพื้นได้เอง

**สิ่งที่ "ไม่" เอาตามตรง:**
- ฟอนต์ mono ล้วน + ลุค ASCII (`█ ░ ▸ ─`) — เป็นคาแรกเตอร์ terminal เฉพาะหน้ารายงาน ไม่เข้ากับ POS ที่เป็น Sarabun/Inter
- `tabular-nums` — กฎเราห้าม
- hex ดิบในแต่ละ rule — เราต้องผ่าน semantic token

**ทางลงมือถ้าจะทำจริง (ยังไม่ทำตอนนี้):**
1. เลือกว่าจะคง brand teal/yellow ของเรา หรือทดลอง accent อุ่นแบบ clay
2. ปรับ `.dark` ใน `src/index.css`: ลอง `background` → โทนอมอุ่น (`#1a1918`-ish), `foreground` → ครีมหม่น, `border` → ขาวโปร่ง
3. เทียบกับ `/theme` (SSOT) ทุกจุด — ถ้าเปลี่ยน primitive ต้องอัปเดต showcase ในชุดเดียวกัน
4. อย่าแตะ component หน้าใด ๆ ก่อนผ่าน `docs/claude/ui-theming.md`

---

## 6. ที่อยู่ไฟล์ต้นฉบับ (ไว้เปิดดูเต็ม)
```
~/.claude/plugins/marketplaces/claude-plugins-official/plugins/session-report/skills/session-report/
├─ SKILL.md            ขั้นตอนสร้างรายงาน (รัน analyzer → ก๊อป template → เติม data + findings)
├─ analyze-sessions.mjs สคริปต์อ่าน ~/.claude/projects แล้ว --json
└─ template.html       โครง HTML+CSS+JS ทั้งหมด (อันที่ถอดมานี้)
```
ตัวอย่างผลลัพธ์จริงที่เคยเซฟไว้ในโปรเจกต์เรา: `docs/session-report-20260609-2326.html`
