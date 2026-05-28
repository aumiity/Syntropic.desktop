// One-off: reorder section blocks in the /theme Components tab into 6 groups,
// inserting <SectionGroup title=... /> headings before each group.
// Run via: node scripts/reorder-theme.mjs
import fs from 'node:fs'

const PATH = 'src/pages/Theme/index.tsx'
const raw = fs.readFileSync(PATH)
const hasBom = raw[0] === 0xef && raw[1] === 0xbb && raw[2] === 0xbf
const text = raw.toString('utf8').replace(/^﻿/, '')

const MARKERS = [
  '{/* ── BUTTON ── */}',
  '{/* ── BADGE ── */}',
  '{/* ── LABEL ── */}',
  '{/* ── INPUT ── */}',
  '{/* ── PRICE INPUT ── */}',
  '{/* ── TEXTAREA ── */}',
  '{/* ── SELECT ── */}',
  '{/* ── CHECKBOX ── */}',
  '{/* ── SWITCH ── */}',
  '{/* ── TABS ── */}',
  '{/* ── CARD ── */}',
  '{/* ── TINT ICON BOX ── */}',
  '{/* ── DASHBOARD CARDS ── */}',
  '{/* ── STANDARD TABLE-CARD ── */}',
  '{/* ── SORTABLE (DRAG REORDER) ── */}',
  '{/* ── MODAL LAYOUT ── */}',
  '{/* ── DIALOG PATTERNS (จากระบบจริง) ── */}',
  '{/* ── DIALOG ── */}',
  '{/* ── CONFIRM DIALOG ── */}',
  '{/* ── UNIT PICKER DIALOG ── */}',
  '{/* ── POPOVER ── */}',
  '{/* ── COMBOBOX ── */}',
  '{/* ── PAGINATION ── */}',
  '{/* ── TOAST ── */}',
  '{/* ── DATE INPUT ── */}',
  '{/* ── DATE RANGE PICKER ── */}',
  '{/* ── PERIOD PICKER ── */}',
  '{/* ── CALENDAR ── */}',
]

function lineStartOf(idx) {
  let p = idx
  while (p > 0 && text[p - 1] !== '\n') p--
  return p
}

const positions = MARKERS.map(m => {
  const idx = text.indexOf(m)
  if (idx < 0) throw new Error(`Marker not found: ${m}`)
  return { marker: m, idx }
})
positions.sort((a, b) => a.idx - b.idx)

// File uses CRLF on disk; build sentinel with the same line endings used in `text`.
const EOL = text.includes('\r\n') ? '\r\n' : '\n'
const GRID_END_SENTINEL = `${EOL}            </div>${EOL}          </TabsContent>`
const lastEnd = text.indexOf(GRID_END_SENTINEL, positions[0].idx)
if (lastEnd < 0) throw new Error('Grid closing div not found')

const blocks = positions.map((p, i) => {
  const start = lineStartOf(p.idx)
  const end = i + 1 < positions.length ? lineStartOf(positions[i + 1].idx) : lastEnd + 1
  return { marker: p.marker, content: text.slice(start, end) }
})
const byMarker = Object.fromEntries(blocks.map(b => [b.marker, b.content]))

const GROUPS = [
  ['พื้นฐาน', [
    '{/* ── BUTTON ── */}',
    '{/* ── BADGE ── */}',
    '{/* ── LABEL ── */}',
  ]],
  ['ฟอร์มและอินพุต', [
    '{/* ── INPUT ── */}',
    '{/* ── PRICE INPUT ── */}',
    '{/* ── TEXTAREA ── */}',
    '{/* ── SELECT ── */}',
    '{/* ── COMBOBOX ── */}',
    '{/* ── CHECKBOX ── */}',
    '{/* ── SWITCH ── */}',
  ]],
  ['วันที่และเวลา', [
    '{/* ── DATE INPUT ── */}',
    '{/* ── DATE RANGE PICKER ── */}',
    '{/* ── PERIOD PICKER ── */}',
    '{/* ── CALENDAR ── */}',
  ]],
  ['Layout & Container', [
    '{/* ── TABS ── */}',
    '{/* ── CARD ── */}',
    '{/* ── TINT ICON BOX ── */}',
    '{/* ── DASHBOARD CARDS ── */}',
  ]],
  ['ตารางและข้อมูล', [
    '{/* ── STANDARD TABLE-CARD ── */}',
    '{/* ── SORTABLE (DRAG REORDER) ── */}',
    '{/* ── PAGINATION ── */}',
  ]],
  ['Dialog & Overlay', [
    '{/* ── MODAL LAYOUT ── */}',
    '{/* ── DIALOG PATTERNS (จากระบบจริง) ── */}',
    '{/* ── DIALOG ── */}',
    '{/* ── CONFIRM DIALOG ── */}',
    '{/* ── UNIT PICKER DIALOG ── */}',
    '{/* ── POPOVER ── */}',
    '{/* ── TOAST ── */}',
  ]],
]

const allOriginal = new Set(MARKERS)
const allReordered = new Set(GROUPS.flatMap(([, ms]) => ms))
for (const m of allOriginal) if (!allReordered.has(m)) throw new Error(`Missing in groups: ${m}`)
for (const m of allReordered) if (!allOriginal.has(m)) throw new Error(`Extra in groups: ${m}`)

const INDENT = '              ' // 14 spaces
let reordered = ''
for (const [title, markers] of GROUPS) {
  reordered += `${INDENT}<SectionGroup title="${title}" />${EOL}${EOL}`
  for (const m of markers) reordered += byMarker[m]
}

const firstStart = lineStartOf(positions[0].idx)
const newText = text.slice(0, firstStart) + reordered + text.slice(lastEnd + 1)

const out = hasBom ? '﻿' + newText : newText
fs.writeFileSync(PATH, out, 'utf8')
console.log(`Rewrote ${PATH}: ${blocks.length} sections → ${GROUPS.length} groups`)
