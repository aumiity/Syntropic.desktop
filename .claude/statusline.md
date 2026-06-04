# Claude Code statusline — คู่มือ path / การวางไฟล์ / แก้ error

คู่มือกันลืมสำหรับ statusline custom ของโปรเจกต์นี้ (แถบล่างสุดของ Claude Code CLI)
ถ้ามัน error ขึ้นมาหรือย้ายไปเครื่องใหม่ → อ่านไฟล์นี้

---

## ภาพรวม: มีแค่ 2 ไฟล์

| ไฟล์ | หน้าที่ | ติด git? |
|------|---------|----------|
| `.claude/statusline.mjs` | ตัว script จริง (วาดแถบ — Node.js, อ่าน session JSON จาก stdin) | ✅ commit (travel ทุกเครื่อง) |
| `.claude/settings.json` | บอก Claude Code ให้รัน script ตัวบน ผ่าน key `statusLine` | ✅ commit |

> **ไฟล์ canonical คือ `.claude/statusline.mjs` ใน repo นี้** — แก้ที่นี่ที่เดียว
> (เมื่อก่อนเคยอยู่ที่ `~/.claude/statusline.mjs` แบบ per-machine + path hardcode → **เลิกใช้แล้ว**)

---

## การ wiring path (สำคัญสุด)

statusLine ถูกตั้งไว้ **2 ที่** ด้วยเหตุผลต่างกัน:

### 1) Project settings (travel ทุกเครื่อง) — `.claude/settings.json`
```json
"statusLine": {
  "type": "command",
  "command": "node .claude/statusline.mjs",
  "padding": 0,
  "refreshInterval": 10
}
```
- ใช้ **path สัมพัทธ์** `node .claude/statusline.mjs` → ใช้ได้ทั้ง Windows และ Mac
- ติด git → `git pull` ที่เครื่องไหนก็ขึ้นเอง ไม่ต้องตั้งอะไรเพิ่ม
- ทำงานเฉพาะตอนเปิด **โปรเจกต์นี้**
- **ห้ามใส่ absolute path ตรงนี้** (เช่น `C:\Users\...` หรือ `/Users/...`) ไม่งั้นข้ามเครื่องพัง

### 2) Global settings (เฉพาะเครื่องนี้, ทุกโปรเจกต์) — `~/.claude/settings.json`
```json
"statusLine": {
  "command": "node \"D:\\Syntropic.Project\\Syntropic.desktop\\.claude\\statusline.mjs\""
}
```
- ใช้ **absolute path** ชี้มาที่ไฟล์ใน repo → เครื่องนี้ใช้ statusline เดียวกันทุกโปรเจกต์
- **ไม่ travel** (global settings เป็นของแต่ละเครื่อง, อยู่นอก repo)
- path นี้ของ **PC** เท่านั้น — เครื่องอื่น path คนละแบบ (ดูหัวข้อ "ตั้งบนเครื่องใหม่")

> เวลาเปิดโปรเจกต์นี้ → ตัว (1) override (2) (ทั้งคู่ชี้ไฟล์เดียวกัน ผลเหมือนกัน)
> เปิดโปรเจกต์อื่นบนเครื่องนี้ → ใช้ (2)

---

## ตั้งบนเครื่องใหม่ (MacBook / Mac mini)

1. `git pull` → ได้ `.claude/statusline.mjs` + project settings มาเอง
   → **เปิดโปรเจกต์นี้ statusline ขึ้นเลย ไม่ต้องทำอะไรต่อ**
2. (ทางเลือก) อยากให้ขึ้น**ทุกโปรเจกต์**บนเครื่องนั้น → แก้ global `~/.claude/settings.json`
   เพิ่ม `statusLine` ชี้ absolute path ของเครื่องนั้น เช่น Mac:
   ```json
   "statusLine": {
     "type": "command",
     "command": "node \"/Users/anya/Documents/GitHub/Syntropic.desktop/.claude/statusline.mjs\""
   }
   ```
   (เช็ค path repo จริงด้วย `pwd` ในโฟลเดอร์โปรเจกต์)

---

## แก้ error ที่เจอบ่อย

### แถบไม่ขึ้นเลย / ว่างเปล่า
- **path script ผิด** → ยืนยันไฟล์อยู่จริง: `ls .claude/statusline.mjs`
- **cwd ไม่ใช่ root โปรเจกต์** (path สัมพัทธ์เลยหาไม่เจอ) → เปิด Claude Code จากโฟลเดอร์ root ของโปรเจกต์
- **เช็คว่า script รันได้** (ก็อป JSON ตัวอย่างไปป์เข้า):
  ```bash
  echo '{"model":{"id":"claude-opus-4-8"},"workspace":{"current_dir":"."},"context_window":{"used_percentage":33},"cost":{"total_cost_usd":1.2},"rate_limits":{"five_hour":{"used_percentage":20,"resets_at":0},"seven_day":{"used_percentage":40,"resets_at":0}}}' | node .claude/statusline.mjs
  ```
  ต้องได้ ANSI 3 บรรทัด ถ้า error จะเห็น stack trace ตรงนี้

### หัว/ท้ายหลอดเป็นกล่องสี่เหลี่ยม ▯ (cap โค้งไม่ขึ้น)
- เทอร์มินัล/ฟอนต์ **ไม่มี Nerd Font** (glyph `` / ``)
- แก้: ติดตั้ง Nerd Font (เช่น "JetBrainsMono Nerd Font") แล้วตั้งเป็นฟอนต์เทอร์มินัล
- หรือแก้ `.claude/statusline.mjs` ที่ `CAP_L` / `CAP_R` ให้เป็น unicode ล้วน เช่น
  `const CAP_L = ''; const CAP_R = '';` (ตัด cap ทิ้ง) หรือใช้ `[` `]`

### emoji เป็นกล่อง / สี่เหลี่ยม
- ฟอนต์เทอร์มินัลไม่รองรับ emoji → เปลี่ยนฟอนต์ หรือลด emoji ใน script

### `node: command not found`
- เครื่องนั้นไม่มี Node ใน PATH → ติดตั้ง Node (โปรเจกต์ Electron รันได้แปลว่ามีอยู่แล้ว)

### สีเพี้ยน / ไม่ไล่เฉด
- เทอร์มินัลไม่รองรับ truecolor (24-bit) → ใช้เทอร์มินัลที่รองรับ (Windows Terminal, iTerm2, VS Code terminal โอเคหมด)

---

## โครงสร้าง script (`statusline.mjs`) — แก้ตรงไหน

| อยากแก้ | ไปที่ |
|---------|-------|
| สีโทนรวม (track / text / accent) | const `TRACK` `TEXT` `MUTE` `TEAL` `GOLD` ด้านบน |
| สีไล่เฉดหลอด (เขียว→เหลือง→แดง) | function `grad()` (แก้ค่า stop 3 จุด) |
| รูปทรงหัว/ท้ายหลอด | const `CAP_L` `CAP_R` |
| ความยาวหลอด | เลข width ใน `bar(pct, <width>)` แต่ละบรรทัด |
| layout / ลำดับบรรทัด / label / emoji | ส่วน `// ---------- compose ----------` ล่างสุด |
| ฟอร์แมตเวลา reset (5H = `2:30`, WK = `Wed 10:00 AM`) | function `remHM()` / `atTime()` |
| แปลงชื่อโมเดล (`claude-opus-4-8` → `Opus 4.8`) | function `prettyModel()` |

ข้อมูลที่ใช้ได้ทั้งหมด (context %, cost, rate_limits ฯลฯ) ดู spec ที่
<https://code.claude.com/docs/en/statusline>

---

## ย้อนกลับไปใช้ ccstatusline (ของเดิม)

แก้ `command` ใน settings (project และ/หรือ global) กลับเป็น:
```json
"command": "npx -y ccstatusline@latest"
```
config nord เดิมยังอยู่ที่ `~/.config/ccstatusline/settings.json` (ไม่ได้ลบ)
