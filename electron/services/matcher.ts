import type Database from 'better-sqlite3'
import dayjs from 'dayjs'

// ---------------------------------------------------------------------------
// Invoice Matcher service
//
// Given a supplier's free-text invoice line, return the most likely Hygeia
// product (and its barcode) so the operator doesn't have to scan the box.
//
// 4-tier strategy (only 1-3 implemented; tier 4 = LLM rerank, deferred):
//   1. alias cache   — exact hit on (supplier_id, normalized text) -> 1.0
//   2. token exact   — token-set F1 over trade_name + search_keywords + code
//   3. fuzzy         — trigram Dice similarity (pure JS, no deps)
// ---------------------------------------------------------------------------

export interface MatchCandidate {
  productId: number
  code: string | null
  name: string            // trade_name
  generic: string | null  // search_keywords (generic name)
  barcode: string | null  // resolved with barcode -> 2 -> 3 -> 4 fallback
  unitName: string | null
  score: number           // 0..1
}

export type MatchTier = 'alias' | 'token' | 'fuzzy' | 'none'

export interface MatchResult {
  supplierText: string          // original text, trimmed (display)
  normalized: string            // normalized key (alias storage / dedupe)
  tier: MatchTier
  candidates: MatchCandidate[]  // up to 3, best first
}

// Auto-confirm threshold: at/above this, the UI may pre-pick without a manual
// click. (Decision: 0.95.)
export const AUTO_CONFIRM_THRESHOLD = 0.95

// Normalize supplier text for the alias key: trim, collapse internal
// whitespace, uppercase. "PARA 500" and " para  500 " collide here.
export function normalize(text: string): string {
  return text.replace(/\s+/g, ' ').trim().toUpperCase()
}

// First non-empty barcode, primary first. (Decision: fall back 2/3/4.)
function resolveBarcode(p: {
  barcode?: string | null; barcode2?: string | null
  barcode3?: string | null; barcode4?: string | null
}): string | null {
  for (const b of [p.barcode, p.barcode2, p.barcode3, p.barcode4]) {
    const v = (b ?? '').trim()
    if (v) return v
  }
  return null
}

// Tokenize: lowercase, split on whitespace/punctuation, and glue a number to a
// trailing unit so "500 mg" and "500mg" tokenize the same. Keeps Thai letters,
// latin letters and digits.
function tokenize(text: string): string[] {
  const cleaned = text
    .toLowerCase()
    .replace(/(\d)\s+(mg|g|ml|mcg|iu|%|cc|l|kg)\b/g, '$1$2')
  const raw = cleaned.split(/[^0-9a-z฀-๿%]+/i).filter(Boolean)
  return raw.filter((t) => t.length > 1 || /\d/.test(t))
}

function tokenF1(query: Set<string>, doc: Set<string>): number {
  if (query.size === 0 || doc.size === 0) return 0
  let inter = 0
  query.forEach((t) => {
    if (doc.has(t)) inter++
  })
  if (inter === 0) return 0
  const recall = inter / query.size
  const precision = inter / doc.size
  return (2 * recall * precision) / (recall + precision)
}

// Character trigram Dice coefficient (0..1).
function trigrams(s: string): Set<string> {
  const t = ` ${s.toLowerCase().replace(/\s+/g, ' ').trim()} `
  const g = new Set<string>()
  for (let i = 0; i < t.length - 2; i++) g.add(t.slice(i, i + 3))
  return g
}
function diceSimilarity(a: string, b: string): number {
  const A = trigrams(a)
  const B = trigrams(b)
  if (A.size === 0 || B.size === 0) return 0
  let inter = 0
  A.forEach((g) => {
    if (B.has(g)) inter++
  })
  return (2 * inter) / (A.size + B.size)
}

interface ProductRow {
  id: number
  code: string | null
  trade_name: string
  search_keywords: string | null
  barcode: string | null
  barcode2: string | null
  barcode3: string | null
  barcode4: string | null
  unit_name: string | null
}

function toCandidate(p: ProductRow, score: number): MatchCandidate {
  return {
    productId: p.id,
    code: p.code,
    name: p.trade_name,
    generic: p.search_keywords,
    barcode: resolveBarcode(p),
    unitName: p.unit_name,
    score: Math.round(score * 1000) / 1000,
  }
}

const TOKEN_TIER_MIN = 0.7 // below this, fall through to fuzzy
const FUZZY_FLOOR = 0.3 // below this, tier = 'none' (still surfaced for manual pick)

/**
 * Match supplier invoice lines to products.
 * Empty / whitespace-only lines are skipped silently (decision).
 */
export function matchLines(
  db: Database.Database,
  supplierId: number,
  lines: string[],
): MatchResult[] {
  const products = db
    .prepare(
      `SELECT p.id, p.code, p.trade_name, p.search_keywords,
              p.barcode, p.barcode2, p.barcode3, p.barcode4,
              u.name AS unit_name
         FROM products p
         LEFT JOIN item_units u ON u.id = p.unit_id
        WHERE p.is_disabled = 0`,
    )
    .all() as ProductRow[]

  // Pre-tokenize the product corpus once per call.
  const docTokens = products.map((p) =>
    new Set(tokenize(`${p.trade_name} ${p.search_keywords ?? ''} ${p.code ?? ''}`)),
  )

  const aliasStmt = db.prepare(
    `SELECT product_id FROM supplier_product_alias
      WHERE supplier_id = ? AND supplier_text = ?`,
  )
  const byId = new Map(products.map((p) => [p.id, p]))

  const results: MatchResult[] = []

  for (const rawLine of lines) {
    const supplierText = rawLine.trim()
    if (!supplierText) continue // skip blank lines silently
    const norm = normalize(supplierText)

    // Tier 1 — alias cache
    const hit = aliasStmt.get(supplierId, norm) as { product_id: number } | undefined
    if (hit && byId.has(hit.product_id)) {
      results.push({
        supplierText,
        normalized: norm,
        tier: 'alias',
        candidates: [toCandidate(byId.get(hit.product_id)!, 1.0)],
      })
      continue
    }

    // Tier 2 — token-set F1
    const qTokens = new Set(tokenize(supplierText))
    const tokenScored = products
      .map((p, i) => ({ p, s: tokenF1(qTokens, docTokens[i]) }))
      .filter((x) => x.s > 0)
      .sort((a, b) => b.s - a.s || a.p.trade_name.length - b.p.trade_name.length)

    if (tokenScored.length && tokenScored[0].s >= TOKEN_TIER_MIN) {
      results.push({
        supplierText,
        normalized: norm,
        tier: 'token',
        candidates: tokenScored.slice(0, 3).map((x) => toCandidate(x.p, x.s)),
      })
      continue
    }

    // Tier 3 — fuzzy trigram
    const fuzzyScored = products
      .map((p) => ({
        p,
        s: Math.max(
          diceSimilarity(norm, p.trade_name),
          p.search_keywords ? diceSimilarity(norm, p.search_keywords) : 0,
        ),
      }))
      .sort((a, b) => b.s - a.s || a.p.trade_name.length - b.p.trade_name.length)

    const best = fuzzyScored[0]?.s ?? 0
    results.push({
      supplierText,
      normalized: norm,
      tier: best >= FUZZY_FLOOR ? 'fuzzy' : 'none',
      candidates: fuzzyScored.slice(0, 3).map((x) => toCandidate(x.p, x.s)),
    })
  }

  return results
}

// ---------------------------------------------------------------------------
// CSV export formatting (Power Automate consumes a 6-column CSV)
// ---------------------------------------------------------------------------

export interface ExportRow {
  barcode: string
  qty: number | string
  expiry: string // 'YYYY-MM-DD'
}

// ล็อต = DDMMYY derived from expiry (leading zero preserved as literal chars).
export function formatLot(expiry: string): string {
  const d = dayjs(expiry)
  return d.isValid() ? d.format('DDMMYY') : ''
}

// วันผลิต / วันหมดอายุ = DD/MM/YYYY (both columns get the expiry value).
export function formatDate(expiry: string): string {
  const d = dayjs(expiry)
  return d.isValid() ? d.format('DD/MM/YYYY') : ''
}

const CSV_HEADER = ['Barcode', 'จำนวน', 'ล็อต', 'วันผลิต', 'วันหมดอายุ', 'ราคารวม']

function csvCell(v: string | number): string {
  const s = String(v)
  return `"${s.replace(/"/g, '""')}"`
}

/**
 * Build the Power Automate CSV. UTF-8 BOM is prepended by the caller that
 * writes the file. Columns: Barcode | จำนวน | ล็อต | วันผลิต | วันหมดอายุ | ราคารวม
 * - วันผลิต and วันหมดอายุ both carry the expiry value (by design).
 * - ราคารวม is the line total (qty × unit cost), passed in pre-computed.
 */
export function buildCsv(
  rows: Array<ExportRow & { lineTotal: number | string }>,
): string {
  const lines = [CSV_HEADER.map(csvCell).join(',')]
  for (const r of rows) {
    lines.push(
      [
        csvCell(r.barcode),
        csvCell(r.qty),
        csvCell(formatLot(r.expiry)),
        csvCell(formatDate(r.expiry)),
        csvCell(formatDate(r.expiry)),
        csvCell(r.lineTotal),
      ].join(','),
    )
  }
  return lines.join('\r\n')
}
