"""
database.py
-----------
Handles all SQLite database setup and operations.

The database is a single file: capstone.db
It gets created automatically the first time the backend starts.

Tables:
    uploads            — logs every file upload with its date
    restock_snapshots  — saves per-SKU data on each restock upload
    settings           — persists user settings (e.g. low stock threshold)

Velocity Logic:
    Each restock upload contains units_sold_last_30_days — a 30-day rolling window.
    To make a meaningful comparison we find two uploads that are ~25-35 days apart
    so the sales windows don't heavily overlap. This gives a true month-over-month view.
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
    """
    Creates all tables if they don't already exist.
    Safe to call every time the backend starts.
    """
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
            id                 INTEGER PRIMARY KEY AUTOINCREMENT,
            upload_id          INTEGER NOT NULL,
            snapshot_date      TEXT    NOT NULL,
            fnsku              TEXT,
            merchant_sku       TEXT,
            product_name       TEXT,
            asin               TEXT,
            available          INTEGER,
            units_sold_last_30 INTEGER,
            alert              TEXT,
            days_of_supply     TEXT,
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

    conn.commit()
    conn.close()
    print("✅ Database initialized — capstone.db ready")


# ── File Hash ────────────────────────────────────────────────────────────────

def compute_file_hash(df) -> str:
    """
    Creates a unique fingerprint of a DataFrame's contents using MD5.
    Same data = same hash every time, regardless of filename or upload date.
    Used to detect if the exact same report was already saved.
    """
    return hashlib.md5(
        pd.util.hash_pandas_object(df, index=True).values.tobytes()
    ).hexdigest()


# ── Upload Logging ────────────────────────────────────────────────────────────

def is_duplicate_upload(file_hash: str) -> bool:
    """
    Returns True if the exact same report data was already saved.
    Uses hash-only check — filename is irrelevant because Amazon always
    names the file the same thing (e.g. "Restock_Report.csv").

    Same data = same hash = duplicate, skip.
    Different data = different hash = new report, save.
    """
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT id FROM uploads WHERE file_hash = ?", (file_hash,))
    result = cursor.fetchone()
    conn.close()
    return result is not None


def is_stale_report(df) -> bool:
    """
    Checks if the report is too old to be a current upload.
    Looks at recommended_ship_date — if the most recent date in that column
    is 90+ days in the past, the file is considered stale.

    Protects against accidentally uploading an old report from months/years ago
    which would corrupt velocity tracking and OOS duration calculations.

    Returns False (allow) if the date column is missing or unparseable.
    """
    date_col = "recommended_ship_date"

    if date_col not in df.columns:
        return False  # can't verify, allow it through

    try:
        dates = pd.to_datetime(df[date_col], errors="coerce").dropna()
        if len(dates) == 0:
            return False  # no parseable dates, allow

        most_recent = dates.max()
        days_old = (datetime.now() - most_recent).days
        return days_old > 90  # older than 90 days = stale
    except Exception:
        return False  # if anything fails, allow the upload


def log_upload(file_name: str, rows_processed: int, file_hash: str) -> int:
    """Logs a new upload and returns the upload_id."""
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
    """
    Returns all upload records, newest first.
    Includes the inferred 30-day sales window for each upload:
        window_end   = upload date (the report reflects data up to this day)
        window_start = upload date minus 30 days
    """
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
    """
    Safely converts a value to string.
    Handles pandas NA, None, and other null-like values that
    come from standardize_df() which uses pandas StringDtype.
    """
    try:
        if pd.isna(val):
            return ""
    except (TypeError, ValueError):
        pass
    if val is None:
        return ""
    return str(val).strip()


def safe_int(val) -> int:
    """
    Safely converts a value to int.
    Handles pandas NA, None, and non-numeric strings.
    """
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
    """
    Saves per-SKU data from a restock DataFrame into restock_snapshots.
    Called every time a restock file is uploaded.

    Uses safe_str() and safe_int() to handle pandas NA values that come
    from standardize_df() converting columns to StringDtype.
    """
    conn = get_connection()
    cursor = conn.cursor()
    now = datetime.now().date().isoformat()

    DAYS_COL = "total_days_of_supply_(including_units_from_open_shipments)"

    rows_to_insert = []
    for _, row in df.iterrows():
        rows_to_insert.append((
            upload_id,
            now,
            safe_str(row.get("fnsku")),
            safe_str(row.get("merchant_sku")),
            safe_str(row.get("product_name")),
            safe_str(row.get("asin")),
            safe_int(row.get("available")),
            safe_int(row.get("units_sold_last_30_days")),
            safe_str(row.get("alert")),
            safe_str(row.get(DAYS_COL)),
        ))

    cursor.executemany("""
        INSERT INTO restock_snapshots (
            upload_id, snapshot_date, fnsku, merchant_sku,
            product_name, asin, available, units_sold_last_30,
            alert, days_of_supply
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    """, rows_to_insert)

    conn.commit()
    conn.close()
    print(f"✅ Saved {len(rows_to_insert)} rows to restock_snapshots (upload_id={upload_id})")


def get_snapshot_by_upload(upload_id: int):
    """Returns all SKU rows for a given upload_id."""
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT * FROM restock_snapshots WHERE upload_id = ?", (upload_id,))
    rows = [dict(r) for r in cursor.fetchall()]
    conn.close()
    return rows


# ── Smart Upload Pair Finder ──────────────────────────────────────────────────

def find_comparison_pair():
    """
    Finds the best pair of uploads to compare for velocity tracking.

    Strategy:
        1. Take the most recent upload as "current"
        2. Look for the most recent upload that is 25-35 days before it
           so the two 30-day sales windows don't heavily overlap
        3. If no upload is 25+ days apart, fall back to the two most recent
           and flag it as a partial/overlapping comparison

    Returns dict with latest_id, prev_id, dates, gap_days, is_monthly
    or None if fewer than 2 uploads exist.
    """
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT id, upload_date FROM uploads ORDER BY upload_date DESC")
    uploads = [dict(r) for r in cursor.fetchall()]
    conn.close()

    if len(uploads) < 2:
        return None

    latest = uploads[0]
    latest_date = datetime.fromisoformat(latest["upload_date"])

    # Look for an upload 25-35 days before the latest
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

    # Fallback: no monthly pair found, use the two most recent
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
    """
    Compares units_sold_last_30 between the best available upload pair.
    Uses per-SKU comparison (each size tracked individually).
    """
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

def get_out_of_stock_duration():
    """
    Checks how many consecutive uploads each SKU has been out of stock.
    Uses actual dates between uploads to calculate real days out of stock.
    Returns SKUs out of stock for 2+ consecutive uploads.
    """
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

        for upload in reversed(uploads):
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
            else:
                break

        if consecutive >= 2:
            first_dt = datetime.fromisoformat(first_oos_date)
            last_dt = datetime.fromisoformat(last_oos_date)
            actual_days = (last_dt - first_dt).days or consecutive * 7

            results.append({
                "merchant_sku": sku,
                "product_name": product_name,
                "consecutive_uploads": consecutive,
                "first_oos_date": first_oos_date,
                "estimated_days_oos": actual_days,
            })

    conn.close()
    results.sort(key=lambda x: x["estimated_days_oos"], reverse=True)
    return results[:20]


# ── All Snapshots for Trend Chart ─────────────────────────────────────────────

def get_sales_trend(merchant_sku: str):
    """
    Returns units_sold_last_30 for a specific SKU across ALL uploads.
    Used to plot a trend line over time on the Details page.
    """
    conn = get_connection()
    cursor = conn.cursor()

    cursor.execute("""
        SELECT u.upload_date, s.units_sold_last_30
        FROM restock_snapshots s
        JOIN uploads u ON s.upload_id = u.id
        WHERE s.merchant_sku = ?
        ORDER BY u.upload_date ASC
    """, (merchant_sku,))

    rows = [
        {
            "date": r["upload_date"][:10],
            "units_sold": r["units_sold_last_30"] or 0,
        }
        for r in cursor.fetchall()
    ]
    conn.close()
    return rows


# ── Settings ──────────────────────────────────────────────────────────────────

def save_setting(key: str, value: str):
    """Saves or updates a setting."""
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
    """Gets a setting by key, returns default if not found."""
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT value FROM settings WHERE key = ?", (key,))
    row = cursor.fetchone()
    conn.close()
    return row["value"] if row else default