// Bucket-priority SQL ORDER BY fragment for sorting human names.
// Order: digit (0-9) → English (A-Z, a-z) → symbol/other → Thai.
// Within each bucket, COLLATE NOCASE gives case-insensitive natural order.
// Mirrors src/lib/sortName.ts so client and server agree.
//
// Usage:
//   `ORDER BY ${orderByBucket('p.trade_name')}`
//   `ORDER BY ${orderByBucket('s.name', 'DESC')}, s.id`
export function orderByBucket(col, dir) {
    if (dir === void 0) { dir = 'ASC'; }
    return "\n    CASE\n      WHEN unicode(".concat(col, ") BETWEEN 48 AND 57 THEN 0\n      WHEN (unicode(").concat(col, ") BETWEEN 65 AND 90) OR (unicode(").concat(col, ") BETWEEN 97 AND 122) THEN 1\n      WHEN unicode(").concat(col, ") BETWEEN 3584 AND 3711 THEN 3\n      ELSE 2\n    END ").concat(dir, ",\n    ").concat(col, " COLLATE NOCASE ").concat(dir, "\n  ").trim();
}
