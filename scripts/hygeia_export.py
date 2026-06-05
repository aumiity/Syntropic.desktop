r"""Stage A of the Hygeia migration (Windows): read the password-protected Jet
.mdb via access_parser (which bypasses the Jet database password the same way
mdbtools does) and dump each needed table to JSON, one file per table, into a
folder OUTSIDE the repo — real shop data must never enter git.

Stage B (`scripts/import-hygeia.mjs`) consumes these JSON files, transforms per
the audited mapping, and loads a fresh test sqlite DB.

Values are kept RAW (strings / null, booleans as "True"/"False") — all coercion
and normalization lives in Stage B so the transform rules have a single home.

Run:  C:\laragon\bin\python\python-3.13\python.exe scripts\hygeia_export.py [Table ...]
      (no args = export the default Phase 1-6 + reconcile set)
"""
import sys, os, json
from access_parser import AccessParser

MDB = r"D:\Syntropic.Project\hygeia.data.mdb"
OUT_DIR = r"D:\Syntropic.Project\hygeia-export"

# Phase 1-6 (master data) + reconcile. Phase 7-8 (huge sale/purchase tables) are
# exported separately with a date filter — see export_sales() later.
DEFAULT_TABLES = [
    "ItemType", "Item", "ItemUnit", "ItemSet", "ItemSetItem",
    "Lot", "Customer", "Person", "LegalEntity", "StockCurrentBalance",
]


def export_table(db, name):
    data = db.parse_table(name)            # dict: column -> list[value]
    cols = list(data.keys())
    nrows = len(data[cols[0]]) if cols else 0
    rows = []
    for i in range(nrows):
        row = {}
        for c in cols:
            v = data[c][i]
            row[c] = None if v is None else (v if isinstance(v, (int, float, bool)) else str(v))
        rows.append(row)
    path = os.path.join(OUT_DIR, name + ".json")
    with open(path, "w", encoding="utf-8") as f:
        json.dump(rows, f, ensure_ascii=False, default=str)
    return nrows, len(cols)


def main():
    os.makedirs(OUT_DIR, exist_ok=True)
    tables = sys.argv[1:] or DEFAULT_TABLES
    db = AccessParser(MDB)
    available = set(db.catalog.keys())
    for t in tables:
        if t not in available:
            print(f"SKIP {t}: not in mdb")
            continue
        n, c = export_table(db, t)
        print(f"OK   {t}: {n} rows, {c} cols -> {t}.json")
    print("DONE ->", OUT_DIR)


if __name__ == "__main__":
    main()
