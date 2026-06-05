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


CUTOFF = "2023-06-05"  # D1: last 3 years (DocDT >= this)


def _rows(db, name):
    """parse_table -> list[dict] (raw string/None values)."""
    data = db.parse_table(name)
    cols = list(data.keys())
    n = len(data[cols[0]]) if cols else 0
    out = []
    for i in range(n):
        out.append({c: (None if data[c][i] is None else
                        (data[c][i] if isinstance(data[c][i], (int, float, bool)) else str(data[c][i])))
                    for c in cols})
    return out


def _write(name, rows):
    with open(os.path.join(OUT_DIR, name + ".json"), "w", encoding="utf-8") as f:
        json.dump(rows, f, ensure_ascii=False, default=str)
    print(f"OK   {name}: {len(rows)} rows -> {name}.json")


def _date_ok(v):
    return v is not None and str(v)[:10] >= CUTOFF


def export_sales(db):
    """Phase 8: 3-year sales. Filter at the header (DocDT, exclude quotation /
    sale-order docs), then cascade the keep-set down to lines and lots."""
    hdr = [r for r in _rows(db, "SaleBasicHeader")
           if _date_ok(r.get("DocDT")) and r.get("IsQuotation") != "True" and r.get("IsSaleOrder") != "True"]
    keep_hdr = {r["SaleBasicHeaderKey"] for r in hdr}
    _write("SaleBasicHeader", hdr)

    lines = [r for r in _rows(db, "SaleBasic") if r.get("SaleBasicHeaderKey") in keep_hdr]
    keep_line = {r["SaleBasicKey"] for r in lines}
    _write("SaleBasic", lines)

    lots = [r for r in _rows(db, "SaleBasicLot") if r.get("SaleBasicKey") in keep_line]
    _write("SaleBasicLot", lots)


def export_purchase(db):
    """Phase 7: 3-year purchase, same header-filter cascade."""
    hdr = [r for r in _rows(db, "PurchaseReceiveHeader") if _date_ok(r.get("DocDT"))]
    keep_hdr = {r["PurchaseReceiveHeaderKey"] for r in hdr}
    _write("PurchaseReceiveHeader", hdr)

    lines = [r for r in _rows(db, "PurchaseReceive") if r.get("PurchaseReceiveHeaderKey") in keep_hdr]
    keep_line = {r["PurchaseReceiveKey"] for r in lines}
    _write("PurchaseReceive", lines)

    lots = [r for r in _rows(db, "PurchaseReceiveLot") if r.get("PurchaseReceiveKey") in keep_line]
    _write("PurchaseReceiveLot", lots)


def main():
    os.makedirs(OUT_DIR, exist_ok=True)
    args = sys.argv[1:] or DEFAULT_TABLES
    db = AccessParser(MDB)
    available = set(db.catalog.keys())
    for a in args:
        if a == "sales":
            export_sales(db)
        elif a == "purchase":
            export_purchase(db)
        elif a in available:
            n, c = export_table(db, a)
            print(f"OK   {a}: {n} rows, {c} cols -> {a}.json")
        else:
            print(f"SKIP {a}: not in mdb")
    print("DONE ->", OUT_DIR)


if __name__ == "__main__":
    main()
