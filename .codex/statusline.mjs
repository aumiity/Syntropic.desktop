#!/usr/bin/env node
// Custom Codex statusline.
//
// This mirrors the local Claude statusline's compact ANSI layout, but it does
// not depend on Claude Code's statusLine hook. It accepts optional JSON on stdin
// and augments it with repo-local facts such as package name and git state.
import { existsSync, readFileSync } from 'fs';
import { basename, join, resolve } from 'path';
import { execFileSync } from 'child_process';

// ---------- input ----------
let raw = '';
try { raw = readFileSync(0, 'utf8'); } catch { /* no stdin */ }
let d = {};
try { d = JSON.parse(raw || '{}'); } catch { d = {}; }

// ---------- ANSI helpers ----------
const RST = '\x1b[0m';
const fg = (c) => `\x1b[38;2;${c[0]};${c[1]};${c[2]}m`;
const bg = (c) => `\x1b[48;2;${c[0]};${c[1]};${c[2]}m`;
const bold = (s) => `\x1b[1m${s}\x1b[22m`;

const TRACK = [59, 66, 82];
const TEXT = [192, 202, 245];
const MUTE = [120, 130, 175];
const TEAL = [125, 207, 255];
const GREEN = [158, 206, 106];
const GOLD = [224, 175, 104];
const RED = [247, 118, 142];
const PIPE = fg([72, 80, 116]) + ' | ' + RST;
const PARTIALS = ['', '▏', '▎', '▍', '▌', '▋', '▊', '▉'];

const label = (s) => fg(GOLD) + s + '>' + RST + ' ';
const dim = (s) => fg(MUTE) + s + RST;

const lerp = (a, b, t) => Math.round(a + (b - a) * t);
function grad(t) {
  const stops = [GREEN, GOLD, RED];
  if (t <= 0) return stops[0];
  if (t >= 1) return stops[2];
  if (t < 0.5) {
    const u = t / 0.5;
    return stops[0].map((v, i) => lerp(v, stops[1][i], u));
  }
  const u = (t - 0.5) / 0.5;
  return stops[1].map((v, i) => lerp(v, stops[2][i], u));
}

function bar(pct, width) {
  pct = Math.max(0, Math.min(100, Number(pct) || 0));
  const exact = (pct / 100) * width;
  const full = Math.floor(exact);
  const rem = exact - full;
  let cells = '';
  for (let i = 0; i < width; i++) {
    const color = grad((i + 0.5) / width);
    if (i < full) cells += fg(color) + bg(TRACK) + '█';
    else if (i === full && rem > 0) cells += fg(color) + bg(TRACK) + PARTIALS[Math.max(1, Math.round(rem * 7))];
    else cells += bg(TRACK) + ' ';
  }
  return cells + RST;
}

// ---------- repo helpers ----------
const cwdRaw = (
  d.workspace?.current_dir ||
  d.workspace?.cwd ||
  d.cwd ||
  process.env.CODEX_CWD ||
  process.cwd()
);
const cwd = resolve(cwdRaw);
const dirName = basename(cwd || '') || cwd;

function runGit(args) {
  try {
    return execFileSync('git', args, {
      cwd,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
      timeout: 500,
    }).trim();
  } catch {
    return '';
  }
}

function packageName() {
  try {
    const p = join(cwd, 'package.json');
    if (!existsSync(p)) return null;
    const pkg = JSON.parse(readFileSync(p, 'utf8'));
    return pkg.name || null;
  } catch {
    return null;
  }
}

function gitInfo() {
  const branch = runGit(['branch', '--show-current']) || runGit(['rev-parse', '--short', 'HEAD']);
  const status = runGit(['status', '--short']);
  if (!branch && !status) return null;
  const lines = status ? status.split('\n').filter(Boolean) : [];
  const modified = lines.filter((l) => !l.startsWith('??')).length;
  const untracked = lines.filter((l) => l.startsWith('??')).length;
  const parts = [];
  if (modified) parts.push(`mod ${modified}`);
  if (untracked) parts.push(`new ${untracked}`);
  return { branch: branch || 'unknown', dirty: parts.join(', ') };
}

function prettyModel(value) {
  const id = typeof value === 'string' ? value : value?.id || value?.display_name || process.env.CODEX_MODEL;
  if (!id) return 'Codex';
  return String(id)
    .replace(/^gpt-/i, 'GPT-')
    .replace(/-codex/i, ' Codex')
    .replace(/-/g, ' ');
}

function numberOrNull(...values) {
  for (const v of values) {
    if (typeof v === 'number' && Number.isFinite(v)) return v;
  }
  return null;
}

function contextInfo() {
  const usedPct = numberOrNull(
    d.context_window?.used_percentage,
    d.context?.used_percentage,
    d.context?.usage_percentage,
  );
  const usedTokens = numberOrNull(
    d.context_window?.used_tokens,
    d.context?.used_tokens,
    d.usage?.total_tokens,
    (typeof d.usage?.input_tokens === 'number' || typeof d.usage?.output_tokens === 'number')
      ? (d.usage?.input_tokens || 0) + (d.usage?.output_tokens || 0)
      : null,
  );
  const totalTokens = numberOrNull(
    d.context_window?.total_tokens,
    d.context?.total_tokens,
    d.limits?.context_window_tokens,
  );
  const pct = usedPct ?? (usedTokens != null && totalTokens ? Math.round((usedTokens / totalTokens) * 100) : null);
  return { pct, usedTokens, totalTokens };
}

function budgetInfo() {
  const used = numberOrNull(d.goal?.tokens_used, d.token_usage?.used, d.budget?.used_tokens);
  const budget = numberOrNull(d.goal?.token_budget, d.token_budget, d.budget?.token_budget);
  if (used == null && budget == null) return null;
  const pct = budget ? Math.round(((used || 0) / budget) * 100) : null;
  return { used, budget, pct };
}

function compact(n) {
  if (n == null) return '?';
  if (Math.abs(n) >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}m`;
  if (Math.abs(n) >= 1_000) return `${Math.round(n / 100) / 10}k`;
  return String(n);
}

function remHM(epoch) {
  if (!epoch) return null;
  const s = epoch - Math.floor(Date.now() / 1000);
  if (s <= 0) return 'now';
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  return `${h}:${String(m).padStart(2, '0')}`;
}

// ---------- compose ----------
const out = [];
const model = prettyModel(d.model || d.model_id);
const effort = d.effort?.level || d.reasoning?.effort || process.env.CODEX_EFFORT;
const pkg = packageName();
const git = gitInfo();
const cost = numberOrNull(d.cost?.total_cost_usd, d.cost_usd);
const ctx = contextInfo();
const budget = budgetInfo();

const line1 = [];
line1.push(label('DIR') + fg(TEXT) + bold(dirName) + RST);
if (pkg) line1.push(label('PKG') + fg(TEXT) + pkg + RST);
line1.push(label('MODEL') + fg(TEXT) + model + RST + (effort ? dim(` (${effort})`) : ''));
if (git) line1.push(label('GIT') + fg(TEXT) + git.branch + RST + (git.dirty ? dim(` [${git.dirty}]`) : dim(' [clean]')));
if (cost != null) line1.push(label('COST') + fg(TEXT) + `$${cost.toFixed(2)}` + RST);
out.push(line1.join(PIPE));

if (ctx.pct != null) {
  const tokenText = ctx.usedTokens != null
    ? ` ${compact(ctx.usedTokens)}${ctx.totalTokens ? `/${compact(ctx.totalTokens)}` : ''}`
    : '';
  out.push(
    label('CTX') +
    bar(ctx.pct, 44) +
    ' ' +
    fg(grad(ctx.pct / 100)) +
    bold(`${Math.round(ctx.pct)}%`) +
    RST +
    dim(tokenText),
  );
}

const line3 = [];
if (budget) {
  const pctText = budget.pct != null ? `${budget.pct}% ` : '';
  line3.push(label('BUDGET') + fg(budget.pct != null ? grad(budget.pct / 100) : TEXT) + `${pctText}${compact(budget.used)}/${compact(budget.budget)}` + RST);
}
const fiveH = d.rate_limits?.five_hour;
const sevenD = d.rate_limits?.seven_day;
if (fiveH?.used_percentage != null) {
  line3.push(label('5H') + bar(fiveH.used_percentage, 14) + ' ' + fg(grad(fiveH.used_percentage / 100)) + `${Math.round(fiveH.used_percentage)}%` + RST + (fiveH.resets_at ? dim(` reset ${remHM(fiveH.resets_at)}`) : ''));
}
if (sevenD?.used_percentage != null) {
  line3.push(label('WK') + bar(sevenD.used_percentage, 14) + ' ' + fg(grad(sevenD.used_percentage / 100)) + `${Math.round(sevenD.used_percentage)}%` + RST);
}
if (line3.length) out.push(line3.join(PIPE));

process.stdout.write(out.join('\n') + (out.length ? '\n' : ''));
