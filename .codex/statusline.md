# Codex statusline

Statusline ฝั่ง Codex ของโปรเจกต์นี้มี 2 ส่วน:

- `.codex/config.toml` ตั้งค่า footer/status line ที่ Codex TUI รองรับโดยตรง
- `.codex/statusline.mjs` เป็น renderer standalone สำหรับทดลองหรือใช้กับ workflow ภายนอก

Codex ไม่ใช้รูปแบบ `statusLine.command` แบบ Claude Code ดังนั้น `.codex/statusline.mjs` จะไม่ขึ้นเองใน footer เว้นแต่มี client/hook ภายนอกเรียกมันเอง

## Footer ที่ Codex อ่านเอง

เมื่อเปิด repo นี้เป็น trusted project, Codex จะอ่าน:

```toml
[tui]
status_line = [
  "model-with-reasoning",
  "context-remaining",
  "git-branch",
  "current-dir",
]
```

ถ้ายังไม่ขึ้น ให้เริ่ม session ใหม่ หรือใช้ `/debug-config` เพื่อตรวจว่า project `.codex/config.toml` ถูกโหลดหรือไม่ และใช้ `/statusline` เพื่อปรับ item ใน TUI โดยตรง

## ใช้งานสคริปต์ standalone

รันจาก root repo:

```bash
node .codex/statusline.mjs
```

ถ้าส่ง JSON เข้า stdin สคริปต์จะใช้ข้อมูล session ที่ส่งมา เช่น model, context, budget, cost และ rate limit:

```bash
node .codex/statusline.mjs < .codex/statusline.sample.json
```

## ข้อมูลที่สคริปต์อ่านเอง

- `package.json` เพื่อแสดงชื่อ package
- `git branch --show-current`
- `git status --short` เพื่อสรุปจำนวนไฟล์ modified / untracked
- `cwd` ปัจจุบัน ถ้า JSON ไม่ส่ง workspace มา

## JSON fields ที่รองรับ

สคริปต์รับหลาย shape เพื่อให้ใช้ได้กับ runner หลายแบบ:

- `workspace.current_dir`, `workspace.cwd`, `cwd`
- `model.id`, `model.display_name`, `model_id`
- `effort.level`, `reasoning.effort`
- `context_window.used_percentage`
- `context_window.used_tokens`, `context_window.total_tokens`
- `context.used_percentage`, `context.used_tokens`, `context.total_tokens`
- `usage.input_tokens`, `usage.output_tokens`, `usage.total_tokens`
- `limits.context_window_tokens`
- `goal.tokens_used`, `goal.token_budget`
- `token_budget`, `budget.used_tokens`, `budget.token_budget`
- `cost.total_cost_usd`, `cost_usd`
- `rate_limits.five_hour`, `rate_limits.seven_day` แบบเดียวกับ Claude statusline

## Env override

- `CODEX_CWD` ใช้แทน cwd
- `CODEX_MODEL` ใช้เป็น model ถ้า JSON ไม่ส่งมา
- `CODEX_EFFORT` ใช้เป็น reasoning effort ถ้า JSON ไม่ส่งมา

## หมายเหตุ

สคริปต์นี้เป็น standalone renderer ก่อน ถ้าวันหลัง Codex client รองรับ statusline hook ใน config ค่อย wire ให้เรียก `node .codex/statusline.mjs` ได้โดยตรง
