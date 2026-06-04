#!/usr/bin/env node
// Custom Claude Code statusline — gradient "tube" bars + emoji, 3 lines.
// Reads the session JSON on stdin (see https://code.claude.com/docs/en/statusline)
// and prints an ANSI status bar. Falls back gracefully on missing fields.
import { readFileSync, existsSync } from 'fs';
import { join, basename, dirname } from 'path';

// ---------- read stdin ----------
let raw = '';
try { raw = readFileSync(0, 'utf8'); } catch { /* no stdin */ }
let d = {};
try { d = JSON.parse(raw || '{}'); } catch { d = {}; }

// ---------- ANSI helpers (24-bit truecolor) ----------
const RST = '\x1b[0m';
const fg = (c) => `\x1b[38;2;${c[0]};${c[1]};${c[2]}m`;
const bg = (c) => `\x1b[48;2;${c[0]};${c[1]};${c[2]}m`;
const bold = (s) => `\x1b[1m${s}\x1b[22m`;

// palette (Tokyo-Night-ish)
const TRACK = [59, 66, 82];      // dark slate track
const TEXT  = [192, 202, 245];   // soft white
const MUTE  = [120, 130, 175];   // muted blue-grey (labels)
const TEAL  = [125, 207, 255];   // accent
const GREEN = [158, 206, 106];
const GOLD  = [224, 175, 104];
const PIPE  = fg([72, 80, 116]) + ' | ' + RST;

// gradient green -> yellow -> red
const lerp = (a, b, t) => Math.round(a + (b - a) * t);
function grad(t) {
  const s = [[158, 206, 106], [224, 175, 104], [247, 118, 142]];
  if (t <= 0) return s[0];
  if (t >= 1) return s[2];
  if (t < 0.5) { const u = t / 0.5; return s[0].map((v, i) => lerp(v, s[1][i], u)); }
  const u = (t - 0.5) / 0.5; return s[1].map((v, i) => lerp(v, s[2][i], u));
}

// rounded nerd-font caps -> capsule / tube shape
const CAP_L = '';
const CAP_R = '';
const PARTIALS = ['', '▏', '▎', '▍', '▌', '▋', '▊', '▉'];

// build one gradient tube bar; fill colour follows the gradient across its length
function bar(pct, width) {
  pct = Math.max(0, Math.min(100, Number(pct) || 0));
  const exact = (pct / 100) * width;
  const full = Math.floor(exact);
  const rem = exact - full;
  let cells = '';
  for (let i = 0; i < width; i++) {
    const color = grad((i + 0.5) / width); // per-cell gradient = smooth liquid look
    if (i < full) cells += fg(color) + bg(TRACK) + '█';
    else if (i === full && rem > 0) cells += fg(color) + bg(TRACK) + PARTIALS[Math.max(1, Math.round(rem * 7))];
    else cells += bg(TRACK) + ' ';
  }
  return fg(TRACK) + CAP_L + RST + cells + RST + fg(TRACK) + CAP_R + RST;
}

// ---------- data extraction ----------
const cwd = (d.workspace && d.workspace.current_dir) || d.cwd || process.cwd();
const dirName = basename(cwd || '') || cwd;

// model -> "Opus 4.8" from id "claude-opus-4-8"
function prettyModel(id, display) {
  if (id) {
    const m = id.match(/(opus|sonnet|haiku)-(\d+)-(\d+)/i);
    if (m) return m[1][0].toUpperCase() + m[1].slice(1) + ' ' + m[2] + '.' + m[3];
  }
  return display || id || 'Claude';
}
const model = prettyModel(d.model && d.model.id, d.model && d.model.display_name);
const effort = d.effort && d.effort.level;

const cost = d.cost || {};
const usd = typeof cost.total_cost_usd === 'number' ? cost.total_cost_usd : null;

const ctx = d.context_window || {};
const ctxPct = typeof ctx.used_percentage === 'number' ? ctx.used_percentage : null;

const rl = d.rate_limits || {};
const fiveH = rl.five_hour;
const sevenD = rl.seven_day;

// time remaining as h:mm  (e.g. 2:30)
function remHM(epoch) {
  if (!epoch) return null;
  const s = epoch - Math.floor(Date.now() / 1000);
  if (s <= 0) return 'now';
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60);
  return `${h}:${String(m).padStart(2, '0')}`;
}
// absolute reset time, e.g. "Wed 10:00 AM"
function atTime(epoch) {
  if (!epoch) return null;
  const dt = new Date(epoch * 1000);
  const wd = dt.toLocaleDateString('en-US', { weekday: 'short' });
  let h = dt.getHours(); const m = dt.getMinutes();
  const ap = h >= 12 ? 'PM' : 'AM'; h = h % 12 || 12;
  return `${wd} ${h}:${String(m).padStart(2, '0')} ${ap}`;
}

// ---------- compose ----------
const out = [];

// line 1: location | model | cost
const l1 = [];
l1.push(fg(GOLD) + '📁⏵ ' + RST + fg(TEXT) + bold(dirName) + RST);
l1.push(fg(GOLD) + '🧠⏵ ' + RST + fg(TEXT) + model + RST + (effort ? fg(MUTE) + ` (${effort})` + RST : ''));
if (usd != null) l1.push(fg(GOLD) + '💵⏵ ' + RST + fg(TEXT) + '$' + usd.toFixed(2) + RST);
out.push(l1.join(PIPE));


// line 2: usage  5H | WK
const u = [];
if (fiveH && typeof fiveH.used_percentage === 'number') {
  const t = remHM(fiveH.resets_at);
  u.push(fg(GOLD) + '5H⏵ ' + RST + bar(fiveH.used_percentage, 17) + ' ' + fg(grad(fiveH.used_percentage / 100)) + Math.round(fiveH.used_percentage) + '%' + RST + (t ? fg(MUTE) + ' 🔄' + t + RST : ''));
}
if (sevenD && typeof sevenD.used_percentage === 'number') {
  const a = atTime(sevenD.resets_at);
  u.push(fg(GOLD) + 'WK⏵ ' + RST + bar(sevenD.used_percentage, 17) + ' ' + fg(grad(sevenD.used_percentage / 100)) + Math.round(sevenD.used_percentage) + '%' + RST + (a ? fg(MUTE) + ' 🔄' + a + RST : ''));
}
if (u.length) out.push(fg(TEAL) + '📊 ' + RST + fg(MUTE) + 'USAGE: ' + RST + u.join(PIPE));

// line 3: context (long bar)
if (ctxPct != null) {
  out.push(fg(TEAL) + '📃 ' + RST + fg(MUTE) + 'CONTEXT:   ' + RST + bar(ctxPct, 52) + ' ' + fg(grad(ctxPct / 100)) + bold(ctxPct + '%') + RST);
}

process.stdout.write(out.join('\n'));
