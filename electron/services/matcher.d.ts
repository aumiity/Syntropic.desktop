import type Database from 'better-sqlite3';
export interface MatchCandidate {
    productId: number;
    code: string | null;
    name: string;
    generic: string | null;
    barcode: string | null;
    unitName: string | null;
    score: number;
}
export type MatchTier = 'alias' | 'token' | 'fuzzy' | 'none';
export interface MatchResult {
    supplierText: string;
    normalized: string;
    tier: MatchTier;
    candidates: MatchCandidate[];
}
export declare const AUTO_CONFIRM_THRESHOLD = 0.95;
export declare function normalize(text: string): string;
/**
 * Match supplier invoice lines to products.
 * Empty / whitespace-only lines are skipped silently (decision).
 */
export declare function matchLines(db: Database.Database, supplierId: number, lines: string[]): MatchResult[];
export interface ExportRow {
    barcode: string;
    qty: number | string;
    expiry: string;
}
export declare function formatLot(expiry: string): string;
export declare function formatDate(expiry: string): string;
/**
 * Build the Power Automate CSV. UTF-8 BOM is prepended by the caller that
 * writes the file. Columns: Barcode | จำนวน | ล็อต | วันผลิต | วันหมดอายุ | ราคารวม
 * - วันผลิต and วันหมดอายุ both carry the expiry value (by design).
 * - ราคารวม is the line total (qty × unit cost), passed in pre-computed.
 */
export declare function buildCsv(rows: Array<ExportRow & {
    lineTotal: number | string;
}>): string;
