"""
database.py
-----------
Handles all SQLite database setup and operations.

Tables:
    uploads               — logs every file upload
    restock_snapshots     — per-SKU data on each restock upload
    settings              — persists user settings
    production_runs       — each time a production plan is generated
    production_batches    — batches within a run
    batch_items           — individual SKUs assigned to a batch
    unbatched_items       — SKUs in a run not yet assigned to a batch
"""

import sqlite3
import hashlib
import pandas as pd
from datetime import datetime, timedelta

DB_PATH = "capstone.db"


def get_connection():
    conn = sqlite3.connect(DB_PATH, check_same_thread=False)
    conn.row_factory = sqlite3.Row
    return conn


def init_db():
    conn = get_connection()
    cursor = conn.cursor()

    cursor.execute("""
        CREATE TABLE IF NOT EXISTS uploads (
            id             INTEGER PRIMARY KEY AUTOINCREMENT,
            file_name      TEXT    NOT NULL,
            upload_date    TEXT    NOT NULL,
            rows_processed INTEGER NOT NULL,
            file_hash      TEXT
        )
    """)

    cursor.execute("""
        CREATE TABLE IF NOT EXISTS restock_snapshots (
            id                          INTEGER PRIMARY KEY AUTOINCREMENT,
            upload_id                   INTEGER NOT NULL,
            snapshot_date               TEXT    NOT NULL,
            fnsku                       TEXT,
            merchant_sku                TEXT,
            product_name                TEXT,
            asin                        TEXT,
            available                   INTEGER,
            total_units                 INTEGER,
            inbound                     INTEGER,
            units_sold_last_30          INTEGER,
            sales_last_30_days          REAL,
            alert                       TEXT,
            days_of_supply              TEXT,
            recommended_replenishment   INTEGER,
            recommended_ship_date       TEXT,
            recommended_action          TEXT,
            FOREIGN KEY (upload_id) REFERENCES uploads(id)
        )
    """)

    cursor.execute("""
        CREATE TABLE IF NOT EXISTS settings (
            key          TEXT PRIMARY KEY,
            value        TEXT,
            updated_date TEXT
        )
    """)

    # ── Production runs ───────────────────────────────────────────────────────
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS production_runs (
            id              INTEGER PRIMARY KEY AUTOINCREMENT,
            run_name        TEXT    NOT NULL,
            created_date    TEXT    NOT NULL,
            coverage_weeks  INTEGER NOT NULL,
            total_skus      INTEGER NOT NULL,
            total_units     INTEGER NOT NULL,
            status          TEXT    NOT NULL DEFAULT 'active',
            notes           TEXT    DEFAULT ''
        )
    """)

    cursor.execute("""
        CREATE TABLE IF NOT EXISTS production_batches (
            id              INTEGER PRIMARY KEY AUTOINCREMENT,
            run_id          INTEGER NOT NULL,
            batch_number    INTEGER NOT NULL,
            batch_name      TEXT    NOT NULL,
            created_date    TEXT    NOT NULL,
            total_skus      INTEGER NOT NULL DEFAULT 0,
            total_units     INTEGER NOT NULL DEFAULT 0,
            downloaded      INTEGER NOT NULL DEFAULT 0,
            notes           TEXT    DEFAULT '',
            warehouse_notes TEXT    DEFAULT '',
            status          TEXT    NOT NULL DEFAULT 'active',
            finalized_date  TEXT,
            FOREIGN KEY (run_id) REFERENCES production_runs(id)
        )
    """)

    cursor.execute("""
        CREATE TABLE IF NOT EXISTS batch_items (
            id                  INTEGER PRIMARY KEY AUTOINCREMENT,
            batch_id            INTEGER NOT NULL,
            run_id              INTEGER NOT NULL,
            merchant_sku        TEXT    NOT NULL,
            fnsku               TEXT,
            warehouse_location  TEXT,
            quantity            INTEGER NOT NULL,
            actual_qty          INTEGER,
            box_number          INTEGER,
            color               TEXT,
            size                TEXT,
            FOREIGN KEY (batch_id) REFERENCES production_batches(id)
        )
    """)

    cursor.execute("""
        CREATE TABLE IF NOT EXISTS unbatched_items (
            id                  INTEGER PRIMARY KEY AUTOINCREMENT,
            run_id              INTEGER NOT NULL,
            merchant_sku        TEXT    NOT NULL,
            fnsku               TEXT,
            warehouse_location  TEXT,
            quantity            INTEGER NOT NULL,
            color               TEXT,
            size                TEXT,
            FOREIGN KEY (run_id) REFERENCES production_runs(id)
        )
    """)

    # ── Box splits table ─────────────────────────────────────────────────────
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS box_splits (
            id           INTEGER PRIMARY KEY AUTOINCREMENT,
            batch_item_id INTEGER NOT NULL,
            box_number   INTEGER NOT NULL,
            box_qty      INTEGER NOT NULL,
            FOREIGN KEY (batch_item_id) REFERENCES batch_items(id)
        )
    """)

    # ── Migration: add new columns to existing tables if not present ──────────
    # Safe to run every startup — SQLite ignores if column already exists via try/except
    migrations = [
        "ALTER TABLE production_runs    ADD COLUMN notes          TEXT    DEFAULT ''",
        "ALTER TABLE production_batches ADD COLUMN notes          TEXT    DEFAULT ''",
        "ALTER TABLE production_batches ADD COLUMN status         TEXT    DEFAULT 'active'",
        "ALTER TABLE production_batches ADD COLUMN finalized_date TEXT",
        "ALTER TABLE batch_items        ADD COLUMN actual_qty     INTEGER",
        "ALTER TABLE batch_items        ADD COLUMN box_number     INTEGER",
        "ALTER TABLE production_batches ADD COLUMN warehouse_notes TEXT DEFAULT ''",
    ]
    for migration in migrations:
        try:
            cursor.execute(migration)
        except Exception:
            pass  # column already exists — safe to ignore

    conn.commit()
    conn.close()
    print("✅ Database initialized — capstone.db ready")


# ── File Hash ─────────────────────────────────────────────────────────────────

def compute_file_hash(df) -> str:
    return hashlib.md5(
        pd.util.hash_pandas_object(df, index=True).values.tobytes()
    ).hexdigest()


# ── Upload Logging ────────────────────────────────────────────────────────────

def is_duplicate_upload(file_hash: str) -> bool:
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT id FROM uploads WHERE file_hash = ?", (file_hash,))
    result = cursor.fetchone()
    conn.close()
    return result is not None


def is_stale_report(df) -> bool:
    date_col = "recommended_ship_date"
    if date_col not in df.columns:
        return False
    try:
        dates = pd.to_datetime(df[date_col], errors="coerce").dropna()
        if len(dates) == 0:
            return False
        most_recent = dates.max()
        days_old = (datetime.now() - most_recent).days
        return days_old > 90
    except Exception:
        return False


def get_upload_status():
    uploads = get_all_uploads()
    if not uploads:
        return {
            "has_uploads": False,
            "last_upload": None,
            "next_expected_after": None,
            "message": "No reports saved yet. Upload your first restock report."
        }
    last = uploads[0]
    last_date = datetime.fromisoformat(last["upload_date"])
    next_expected = last_date + timedelta(days=25)
    return {
        "has_uploads": True,
        "last_upload": {
            "file_name": last["file_name"],
            "upload_date": last["upload_date"][:10],
            "window_label": last["window_label"],
            "rows": last["rows_processed"],
        },
        "next_expected_after": next_expected.strftime("%b %d, %Y"),
        "message": f"Last report covers {last['window_label']}. Upload a newer report after {next_expected.strftime('%b %d, %Y')}."
    }


def log_upload(file_name: str, rows_processed: int, file_hash: str) -> int:
    conn = get_connection()
    cursor = conn.cursor()
    now = datetime.now().isoformat()
    cursor.execute("""
        INSERT INTO uploads (file_name, upload_date, rows_processed, file_hash)
        VALUES (?, ?, ?, ?)
    """, (file_name, now, rows_processed, file_hash))
    upload_id = cursor.lastrowid
    conn.commit()
    conn.close()
    return upload_id


def get_all_uploads():
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT * FROM uploads ORDER BY upload_date DESC")
    rows = []
    for r in cursor.fetchall():
        row = dict(r)
        try:
            end_dt = datetime.fromisoformat(row["upload_date"])
            start_dt = end_dt - timedelta(days=30)
            row["window_start"] = start_dt.date().isoformat()
            row["window_end"]   = end_dt.date().isoformat()
            row["window_label"] = f"{start_dt.strftime('%b %d, %Y')} – {end_dt.strftime('%b %d, %Y')}"
        except (ValueError, TypeError):
            row["window_start"] = None
            row["window_end"]   = None
            row["window_label"] = "Unknown"
        rows.append(row)
    conn.close()
    return rows


# ── Restock Snapshots ─────────────────────────────────────────────────────────

def safe_str(val) -> str:
    try:
        if pd.isna(val):
            return ""
    except (TypeError, ValueError):
        pass
    if val is None:
        return ""
    return str(val).strip()


def safe_int(val) -> int:
    try:
        if pd.isna(val):
            return 0
    except (TypeError, ValueError):
        pass
    try:
        return int(val)
    except (TypeError, ValueError):
        return 0


def save_snapshot(upload_id: int, df):
    conn = get_connection()
    cursor = conn.cursor()
    now = datetime.now().date().isoformat()
    DAYS_COL = "total_days_of_supply_(including_units_from_open_shipments)"

    def safe_float(val):
        try:
            if pd.isna(val): return 0.0
        except (TypeError, ValueError): pass
        try:
            return float(val)
        except (TypeError, ValueError):
            return 0.0

    rows_to_insert = []
    for _, row in df.iterrows():
        rows_to_insert.append((
            upload_id, now,
            safe_str(row.get("fnsku")),
            safe_str(row.get("merchant_sku")),
            safe_str(row.get("product_name")),
            safe_str(row.get("asin")),
            safe_int(row.get("available")),
            safe_int(row.get("total_units")),
            safe_int(row.get("inbound")),
            safe_int(row.get("units_sold_last_30_days")),
            safe_float(row.get("sales_last_30_days")),
            safe_str(row.get("alert")),
            safe_str(row.get(DAYS_COL)),
            safe_int(row.get("recommended_replenishment_qty")),
            safe_str(row.get("recommended_ship_date")),
            safe_str(row.get("recommended_action")),
        ))

    cursor.executemany("""
        INSERT INTO restock_snapshots (
            upload_id, snapshot_date, fnsku, merchant_sku,
            product_name, asin, available, total_units, inbound,
            units_sold_last_30, sales_last_30_days,
            alert, days_of_supply,
            recommended_replenishment, recommended_ship_date, recommended_action
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    """, rows_to_insert)

    conn.commit()
    conn.close()
    print(f"✅ Saved {len(rows_to_insert)} rows to restock_snapshots (upload_id={upload_id})")


def get_snapshot_by_upload(upload_id: int):
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT * FROM restock_snapshots WHERE upload_id = ?", (upload_id,))
    rows = [dict(r) for r in cursor.fetchall()]
    conn.close()
    return rows


# ── Production Runs ───────────────────────────────────────────────────────────

def get_active_run():
    """Returns the currently active production run, or None."""
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute("""
        SELECT * FROM production_runs WHERE status = 'active'
        ORDER BY created_date DESC LIMIT 1
    """)
    row = cursor.fetchone()
    conn.close()
    return dict(row) if row else None


def create_production_run(run_name: str, coverage_weeks: int, items: list) -> int:
    """
    Creates a new production run and saves all items as unbatched.
    items = list of dicts with: merchant_sku, fnsku, warehouse_location,
                                 quantity, color, size
    Returns run_id.
    """
    conn = get_connection()
    cursor = conn.cursor()
    now = datetime.now().isoformat()
    total_units = sum(i["quantity"] for i in items)

    cursor.execute("""
        INSERT INTO production_runs (run_name, created_date, coverage_weeks, total_skus, total_units, status)
        VALUES (?, ?, ?, ?, ?, 'active')
    """, (run_name, now, coverage_weeks, len(items), total_units))
    run_id = cursor.lastrowid

    # Save all as unbatched initially
    cursor.executemany("""
        INSERT INTO unbatched_items (run_id, merchant_sku, fnsku, warehouse_location, quantity, color, size)
        VALUES (?, ?, ?, ?, ?, ?, ?)
    """, [(run_id, i["merchant_sku"], i["fnsku"], i["warehouse_location"],
           i["quantity"], i["color"], i["size"]) for i in items])

    conn.commit()
    conn.close()
    return run_id


def get_run_with_batches(run_id: int) -> dict:
    """Returns a full production run with all batches and unbatched items."""
    conn = get_connection()
    cursor = conn.cursor()

    cursor.execute("SELECT * FROM production_runs WHERE id = ?", (run_id,))
    run = dict(cursor.fetchone())

    # Get batches
    cursor.execute("SELECT * FROM production_batches WHERE run_id = ? ORDER BY batch_number", (run_id,))
    batches = []
    for b in cursor.fetchall():
        batch = dict(b)
        cursor.execute("SELECT * FROM batch_items WHERE batch_id = ? ORDER BY warehouse_location", (batch["id"],))
        batch["items"] = [dict(r) for r in cursor.fetchall()]
        batches.append(batch)

    # Get unbatched items
    cursor.execute("SELECT * FROM unbatched_items WHERE run_id = ? ORDER BY warehouse_location", (run_id,))
    unbatched = [dict(r) for r in cursor.fetchall()]

    conn.close()
    run["batches"] = batches
    run["unbatched"] = unbatched
    return run


def create_batch(run_id: int, batch_name: str, item_ids: list) -> dict:
    """
    Moves selected unbatched items into a new batch.
    item_ids = list of unbatched_items.id values.
    Returns the new batch dict.
    """
    conn = get_connection()
    cursor = conn.cursor()
    now = datetime.now().isoformat()

    # Get next batch number
    cursor.execute("SELECT COUNT(*) as cnt FROM production_batches WHERE run_id = ?", (run_id,))
    batch_number = cursor.fetchone()["cnt"] + 1

    # Fetch the selected unbatched items
    placeholders = ",".join("?" * len(item_ids))
    cursor.execute(f"""
        SELECT * FROM unbatched_items WHERE id IN ({placeholders}) AND run_id = ?
    """, (*item_ids, run_id))
    items = [dict(r) for r in cursor.fetchall()]

    if not items:
        conn.close()
        raise ValueError("No valid items found for this batch.")

    total_units = sum(i["quantity"] for i in items)

    # Create batch
    cursor.execute("""
        INSERT INTO production_batches (run_id, batch_number, batch_name, created_date, total_skus, total_units)
        VALUES (?, ?, ?, ?, ?, ?)
    """, (run_id, batch_number, batch_name, now, len(items), total_units))
    batch_id = cursor.lastrowid

    # Move items to batch_items
    cursor.executemany("""
        INSERT INTO batch_items (batch_id, run_id, merchant_sku, fnsku, warehouse_location, quantity, color, size)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    """, [(batch_id, run_id, i["merchant_sku"], i["fnsku"],
           i["warehouse_location"], i["quantity"], i["color"], i["size"]) for i in items])

    # Remove from unbatched
    cursor.execute(f"DELETE FROM unbatched_items WHERE id IN ({placeholders})", item_ids)

    # Check if all items are now batched → mark run complete
    cursor.execute("SELECT COUNT(*) as cnt FROM unbatched_items WHERE run_id = ?", (run_id,))
    remaining = cursor.fetchone()["cnt"]
    if remaining == 0:
        cursor.execute("UPDATE production_runs SET status = 'complete' WHERE id = ?", (run_id,))

    conn.commit()

    # Return the new batch
    cursor.execute("SELECT * FROM production_batches WHERE id = ?", (batch_id,))
    batch = dict(cursor.fetchone())
    batch["items"] = items
    conn.close()
    return batch


def abandon_run(run_id: int):
    """Marks a run as abandoned — clears unbatched items."""
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute("UPDATE production_runs SET status = 'abandoned' WHERE id = ?", (run_id,))
    cursor.execute("DELETE FROM unbatched_items WHERE run_id = ?", (run_id,))
    conn.commit()
    conn.close()


def refresh_unbatched_quantities(run_id: int, items: list):
    """
    Updates quantities of unbatched items from a new restock report.
    Only updates items that are still unbatched in this run.
    items = list of dicts with merchant_sku and quantity.
    """
    conn = get_connection()
    cursor = conn.cursor()
    qty_map = {i["merchant_sku"]: i["quantity"] for i in items}

    cursor.execute("SELECT * FROM unbatched_items WHERE run_id = ?", (run_id,))
    for row in cursor.fetchall():
        sku = row["merchant_sku"]
        if sku in qty_map:
            cursor.execute("""
                UPDATE unbatched_items SET quantity = ? WHERE id = ?
            """, (qty_map[sku], row["id"]))

    conn.commit()
    conn.close()


def get_production_history():
    """Returns all production runs with batch summary, newest first."""
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT * FROM production_runs ORDER BY created_date DESC")
    runs = []
    for r in cursor.fetchall():
        run = dict(r)
        cursor.execute("""
            SELECT COUNT(*) as batch_count, SUM(total_units) as batched_units
            FROM production_batches WHERE run_id = ?
        """, (run["id"],))
        summary = dict(cursor.fetchone())
        run["batch_count"] = summary["batch_count"] or 0
        run["batched_units"] = summary["batched_units"] or 0
        runs.append(run)
    conn.close()
    return runs


def get_batch_items_for_download(batch_id: int) -> list:
    """Returns all items in a batch for Excel generation."""
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute("""
        SELECT * FROM batch_items WHERE batch_id = ? ORDER BY warehouse_location
    """, (batch_id,))
    rows = [dict(r) for r in cursor.fetchall()]
    conn.close()
    return rows


def rename_run(run_id: int, new_name: str):
    """Renames a production run."""
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute("UPDATE production_runs SET run_name = ? WHERE id = ?", (new_name, run_id))
    conn.commit()
    conn.close()


def rename_batch(batch_id: int, new_name: str):
    """Renames a batch."""
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute("UPDATE production_batches SET batch_name = ? WHERE id = ?", (new_name, batch_id))
    conn.commit()
    conn.close()


# ── Smart Upload Pair Finder ──────────────────────────────────────────────────

def find_comparison_pair():
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT id, upload_date FROM uploads ORDER BY upload_date DESC")
    uploads = [dict(r) for r in cursor.fetchall()]
    conn.close()

    if len(uploads) < 2:
        return None

    latest = uploads[0]
    latest_date = datetime.fromisoformat(latest["upload_date"])

    best_match = None
    for upload in uploads[1:]:
        upload_date = datetime.fromisoformat(upload["upload_date"])
        gap = (latest_date - upload_date).days
        if 25 <= gap <= 35:
            best_match = {
                "latest_id": latest["id"],
                "prev_id": upload["id"],
                "latest_date": latest["upload_date"][:10],
                "prev_date": upload["upload_date"][:10],
                "gap_days": gap,
                "is_monthly": True,
            }
            break

    if best_match is None:
        prev = uploads[1]
        prev_date = datetime.fromisoformat(prev["upload_date"])
        gap = (latest_date - prev_date).days
        best_match = {
            "latest_id": latest["id"],
            "prev_id": prev["id"],
            "latest_date": latest["upload_date"][:10],
            "prev_date": prev["upload_date"][:10],
            "gap_days": gap,
            "is_monthly": False,
        }

    return best_match


# ── Velocity Tracking ─────────────────────────────────────────────────────────

def get_velocity_data():
    pair = find_comparison_pair()
    if pair is None:
        return []

    conn = get_connection()
    cursor = conn.cursor()

    cursor.execute("""
        SELECT merchant_sku, product_name, units_sold_last_30
        FROM restock_snapshots WHERE upload_id = ?
    """, (pair["latest_id"],))
    latest = {r["merchant_sku"]: dict(r) for r in cursor.fetchall()}

    cursor.execute("""
        SELECT merchant_sku, units_sold_last_30
        FROM restock_snapshots WHERE upload_id = ?
    """, (pair["prev_id"],))
    previous = {r["merchant_sku"]: dict(r) for r in cursor.fetchall()}
    conn.close()

    results = []
    for sku, data in latest.items():
        prev = previous.get(sku)
        if not prev:
            continue
        current_sales = data["units_sold_last_30"] or 0
        prev_sales = prev["units_sold_last_30"] or 0
        if current_sales == 0 and prev_sales == 0:
            continue
        if prev_sales == 0:
            change_pct = 100.0
        else:
            change_pct = round(((current_sales - prev_sales) / prev_sales) * 100, 1)
        results.append({
            "merchant_sku": sku,
            "product_name": data["product_name"],
            "current_sales": current_sales,
            "prev_sales": prev_sales,
            "change_pct": change_pct,
            "trend": "up" if change_pct > 0 else "down" if change_pct < 0 else "flat",
            "current_date": pair["latest_date"],
            "prev_date": pair["prev_date"],
            "gap_days": pair["gap_days"],
            "is_monthly": pair["is_monthly"],
        })

    results.sort(key=lambda x: abs(x["change_pct"]), reverse=True)
    return results[:10]


# ── Out of Stock Duration ─────────────────────────────────────────────────────

MIN_OOS_GAP_DAYS = 7


def get_last_known_sales(cursor, merchant_sku: str) -> int:
    cursor.execute("""
        SELECT s.units_sold_last_30
        FROM restock_snapshots s
        JOIN uploads u ON s.upload_id = u.id
        WHERE s.merchant_sku = ?
          AND s.alert != 'out_of_stock'
          AND s.units_sold_last_30 > 0
        ORDER BY u.upload_date DESC
        LIMIT 1
    """, (merchant_sku,))
    row = cursor.fetchone()
    return row["units_sold_last_30"] if row else 0


def get_out_of_stock_duration():
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT id, upload_date FROM uploads ORDER BY upload_date ASC")
    uploads = [dict(r) for r in cursor.fetchall()]

    if len(uploads) < 2:
        conn.close()
        return []

    cursor.execute("""
        SELECT DISTINCT merchant_sku FROM restock_snapshots
        WHERE alert = 'out_of_stock'
    """)
    oos_skus = [r["merchant_sku"] for r in cursor.fetchall()]

    results = []
    for sku in oos_skus:
        consecutive = 0
        product_name = ""
        first_oos_date = None
        last_oos_date = None
        last_counted_date = None

        for upload in reversed(uploads):
            upload_date = datetime.fromisoformat(upload["upload_date"])
            if last_counted_date is not None:
                gap = (last_counted_date - upload_date).days
                if gap < MIN_OOS_GAP_DAYS:
                    continue

            cursor.execute("""
                SELECT alert, product_name FROM restock_snapshots
                WHERE upload_id = ? AND merchant_sku = ?
            """, (upload["id"], sku))
            row = cursor.fetchone()

            if row and row["alert"] == "out_of_stock":
                consecutive += 1
                product_name = row["product_name"] or sku
                last_oos_date = last_oos_date or upload["upload_date"][:10]
                first_oos_date = upload["upload_date"][:10]
                last_counted_date = upload_date
            else:
                break

        if consecutive >= 2:
            first_dt = datetime.fromisoformat(first_oos_date)
            last_dt = datetime.fromisoformat(last_oos_date)
            actual_days = (last_dt - first_dt).days or consecutive * 7
            last_known_sales = get_last_known_sales(cursor, sku)
            priority_score = last_known_sales * consecutive
            results.append({
                "merchant_sku": sku,
                "product_name": product_name,
                "consecutive_uploads": consecutive,
                "first_oos_date": first_oos_date,
                "estimated_days_oos": actual_days,
                "last_known_sales": last_known_sales,
                "priority_score": priority_score,
            })

    conn.close()
    results.sort(key=lambda x: x["priority_score"], reverse=True)
    return results[:20]


def get_current_oos():
    uploads = get_all_uploads()
    if not uploads:
        return []

    latest_upload_id = uploads[0]["id"]
    conn = get_connection()
    cursor = conn.cursor()

    cursor.execute("""
        SELECT merchant_sku, product_name, available, units_sold_last_30
        FROM restock_snapshots
        WHERE upload_id = ? AND alert = 'out_of_stock'
    """, (latest_upload_id,))
    oos_rows = [dict(r) for r in cursor.fetchall()]

    results = []
    for row in oos_rows:
        sku = row["merchant_sku"]
        last_known_sales = get_last_known_sales(cursor, sku)
        if last_known_sales == 0:
            last_known_sales = row["units_sold_last_30"] or 0
        results.append({
            "merchant_sku": sku,
            "product_name": row["product_name"] or sku,
            "available": row["available"],
            "last_known_sales": last_known_sales,
            "priority_score": last_known_sales,
        })

    conn.close()
    results.sort(key=lambda x: x["priority_score"], reverse=True)
    return results[:20]


# ── Sales Trend ───────────────────────────────────────────────────────────────

def get_sales_trend(merchant_sku: str):
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute("""
        SELECT u.upload_date, s.units_sold_last_30
        FROM restock_snapshots s
        JOIN uploads u ON s.upload_id = u.id
        WHERE s.merchant_sku = ?
        ORDER BY u.upload_date ASC
    """, (merchant_sku,))
    rows = [{"date": r["upload_date"][:10], "units_sold": r["units_sold_last_30"] or 0}
            for r in cursor.fetchall()]
    conn.close()
    return rows


# ── Settings ──────────────────────────────────────────────────────────────────

def save_setting(key: str, value: str):
    conn = get_connection()
    cursor = conn.cursor()
    now = datetime.now().isoformat()
    cursor.execute("""
        INSERT INTO settings (key, value, updated_date)
        VALUES (?, ?, ?)
        ON CONFLICT(key) DO UPDATE SET
            value = excluded.value,
            updated_date = excluded.updated_date
    """, (key, value, now))
    conn.commit()
    conn.close()


def get_setting(key: str, default=None):
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT value FROM settings WHERE key = ?", (key,))
    row = cursor.fetchone()
    conn.close()
    return row["value"] if row else default


# ── Notes ─────────────────────────────────────────────────────────────────────

def save_run_notes(run_id: int, notes: str):
    """Saves notes for a production run."""
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute("UPDATE production_runs SET notes = ? WHERE id = ?", (notes, run_id))
    conn.commit()
    conn.close()


def save_batch_notes(batch_id: int, notes: str):
    """Saves office notes for a batch."""
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute("UPDATE production_batches SET notes = ? WHERE id = ?", (notes, batch_id))
    conn.commit()
    conn.close()


def save_warehouse_notes(batch_id: int, notes: str):
    """Saves warehouse notes for a batch — separate from office notes."""
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute("UPDATE production_batches SET warehouse_notes = ? WHERE id = ?", (notes, batch_id))
    conn.commit()
    conn.close()


# ── Warehouse Operations ──────────────────────────────────────────────────────

def get_active_batch_for_warehouse():
    """
    Returns the most recently created active batch with all its items.
    Used by the warehouse page to show what needs to be worked on.
    """
    conn = get_connection()
    cursor = conn.cursor()

    # Get the active run first
    cursor.execute("""
        SELECT * FROM production_runs WHERE status = 'active'
        ORDER BY created_date DESC LIMIT 1
    """)
    run = cursor.fetchone()
    if not run:
        conn.close()
        return None

    run = dict(run)

    # Get all batches for this run
    cursor.execute("""
        SELECT * FROM production_batches
        WHERE run_id = ? ORDER BY batch_number
    """, (run["id"],))
    batches = []
    for b in cursor.fetchall():
        batch = dict(b)
        cursor.execute("""
            SELECT * FROM batch_items
            WHERE batch_id = ? ORDER BY warehouse_location
        """, (batch["id"],))
        items = []
        for item in cursor.fetchall():
            i = dict(item)
            if i["actual_qty"] is None:
                i["actual_qty"] = i["quantity"]
            # Load box splits for this item
            cursor.execute("""
                SELECT box_number, box_qty FROM box_splits
                WHERE batch_item_id = ? ORDER BY box_number
            """, (i["id"],))
            i["box_splits"] = [{"box_number": r["box_number"], "box_qty": r["box_qty"]}
                               for r in cursor.fetchall()]
            items.append(i)
        batch["items"] = items
        batches.append(batch)

    conn.close()
    run["batches"] = batches
    return run


def save_warehouse_progress(batch_id: int, items: list, notes: str = ""):
    """
    Saves actual quantities and box splits for batch items.
    Also saves batch notes.
    items = list of dicts: { id, actual_qty, box_splits: [{box_number, box_qty}] }
    """
    conn = get_connection()
    cursor = conn.cursor()

    for item in items:
        cursor.execute("""
            UPDATE batch_items SET actual_qty = ? WHERE id = ? AND batch_id = ?
        """, (item["actual_qty"], item["id"], batch_id))

        # Replace box splits for this item
        cursor.execute("DELETE FROM box_splits WHERE batch_item_id = ?", (item["id"],))
        for split in item.get("box_splits", []):
            cursor.execute("""
                INSERT INTO box_splits (batch_item_id, box_number, box_qty)
                VALUES (?, ?, ?)
            """, (item["id"], split["box_number"], split["box_qty"]))

    if notes is not None:
        cursor.execute("UPDATE production_batches SET warehouse_notes = ? WHERE id = ?", (notes, batch_id))

    conn.commit()
    conn.close()


def finalize_batch(batch_id: int, items: list, notes: str = ""):
    """
    Finalizes a batch — saves actual quantities, box splits, notes,
    marks batch as finalized with current date.
    Still editable after finalization (office can re-finalize).
    items = list of dicts: { id, actual_qty, box_splits: [{box_number, box_qty}] }
    """
    conn = get_connection()
    cursor = conn.cursor()
    now = datetime.now().isoformat()

    for item in items:
        cursor.execute("""
            UPDATE batch_items SET actual_qty = ? WHERE id = ? AND batch_id = ?
        """, (item["actual_qty"], item["id"], batch_id))

        # Replace box splits
        cursor.execute("DELETE FROM box_splits WHERE batch_item_id = ?", (item["id"],))
        for split in item.get("box_splits", []):
            cursor.execute("""
                INSERT INTO box_splits (batch_item_id, box_number, box_qty)
                VALUES (?, ?, ?)
            """, (item["id"], split["box_number"], split["box_qty"]))

    cursor.execute("""
        UPDATE production_batches
        SET status = 'finalized', finalized_date = ?, warehouse_notes = ?
        WHERE id = ?
    """, (now, notes, batch_id))

    # Check if all batches in this run are finalized
    cursor.execute("""
        SELECT run_id FROM production_batches WHERE id = ?
    """, (batch_id,))
    row = cursor.fetchone()
    if row:
        run_id = row["run_id"]
        cursor.execute("""
            SELECT COUNT(*) as cnt FROM production_batches
            WHERE run_id = ? AND status != 'finalized'
        """, (run_id,))
        remaining = cursor.fetchone()["cnt"]
        if remaining == 0:
            cursor.execute("""
                UPDATE production_runs SET status = 'complete' WHERE id = ?
            """, (run_id,))

    conn.commit()
    conn.close()


def get_production_run_history_full():
    """
    Returns all production runs with full batch details and notes.
    Used by the Details page production history section.
    """
    conn = get_connection()
    cursor = conn.cursor()

    cursor.execute("""
        SELECT * FROM production_runs ORDER BY created_date DESC
    """)
    runs = []
    for r in cursor.fetchall():
        run = dict(r)

        cursor.execute("""
            SELECT * FROM production_batches
            WHERE run_id = ? ORDER BY batch_number
        """, (run["id"],))
        batches = []
        for b in cursor.fetchall():
            batch = dict(b)
            cursor.execute("""
                SELECT COUNT(*) as cnt, SUM(COALESCE(actual_qty, quantity)) as actual_total,
                       SUM(quantity) as planned_total
                FROM batch_items WHERE batch_id = ?
            """, (batch["id"],))
            stats = dict(cursor.fetchone())
            batch["actual_units"] = stats["actual_total"] or 0
            batch["planned_units"] = stats["planned_total"] or 0
            batches.append(batch)

        run["batches"] = batches
        run["batch_count"] = len(batches)
        runs.append(run)

    conn.close()
    return runs


def get_batch_box_detail(batch_id: int) -> list:
    """
    Returns all items in a batch with their box splits.
    Used by the Details page box detail popup.
    Returns a flat list of rows — one row per box split,
    or one row per SKU if no splits.
    """
    conn = get_connection()
    cursor = conn.cursor()

    cursor.execute("""
        SELECT * FROM batch_items WHERE batch_id = ? ORDER BY warehouse_location
    """, (batch_id,))
    items = [dict(r) for r in cursor.fetchall()]

    rows = []
    for item in items:
        final_qty = item["actual_qty"] if item["actual_qty"] is not None else item["quantity"]

        cursor.execute("""
            SELECT box_number, box_qty FROM box_splits
            WHERE batch_item_id = ? ORDER BY box_number
        """, (item["id"],))
        splits = [dict(r) for r in cursor.fetchall()]

        if splits:
            for split in splits:
                rows.append({
                    "merchant_sku":       item["merchant_sku"],
                    "warehouse_location": item["warehouse_location"],
                    "color":              item["color"],
                    "size":               item["size"],
                    "planned_qty":        item["quantity"],
                    "actual_qty":         final_qty,
                    "box_number":         split["box_number"],
                    "box_qty":            split["box_qty"],
                })
        else:
            rows.append({
                "merchant_sku":       item["merchant_sku"],
                "warehouse_location": item["warehouse_location"],
                "color":              item["color"],
                "size":               item["size"],
                "planned_qty":        item["quantity"],
                "actual_qty":         final_qty,
                "box_number":         item.get("box_number"),
                "box_qty":            final_qty,
            })

    conn.close()
    return rows