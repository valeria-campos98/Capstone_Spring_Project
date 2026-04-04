# Production Planning App

## Project Overview
A local web application for Amazon FBA sellers to generate production plans from Amazon Seller Central sales data. Replaces a manual Excel workflow with automated SKU matching, configurable rules, and quantity calculations.

## Architecture: FastAPI + React (Option A)

### Stack
- **Frontend:** React + Vite
- **Backend:** Python + FastAPI
- **Database:** SQLite (via raw `sqlite3` — no SQLAlchemy)
- **Excel I/O:** openpyxl
- **Launcher:** `launch.bat` — starts FastAPI server, opens `http://localhost:8000` in browser
- **Future:** Electron wrapper (React stays identical, FastAPI becomes a bundled subprocess)

### Project Structure
```
/
├── backend/
│   ├── main.py              # FastAPI app entry point
│   ├── database.py          # SQLite setup + all DB operations (implemented)
│   ├── ingestion.py         # Parse Amazon Seller Central CSV/Excel reports
│   ├── sku_matcher.py       # Fuzzy SKU ↔ FNSKU matching engine
│   ├── rules_engine.py      # Evaluate and apply configurable planning rules
│   ├── plan_calculator.py   # Core: sales velocity → coverage target → quantity
│   └── output_generator.py  # Generate Excel output in predefined format
├── frontend/
│   ├── src/
│   │   ├── pages/
│   │   │   ├── Upload.jsx       # Upload Amazon sales report
│   │   │   ├── SKUMatching.jsx  # Review and confirm SKU matches
│   │   │   ├── Rules.jsx        # Add / edit planning rules
│   │   │   ├── PlanReview.jsx   # Review generated plan before export
│   │   │   └── Dashboard.jsx    # Analysis, charts, velocity trends
│   │   └── components/
└── launch.bat               # Double-click launcher
```

## Core Data Flow
1. User uploads Amazon Seller Central CSV report
2. Ingestion layer parses and normalizes sales data
3. SKU matcher reconciles Amazon FNSKUs → internal SKUs (fuzzy match + manual override memory)
4. Rules engine filters and adjusts (exclude low-volume SKUs, category overrides, etc.)
5. Plan calculator computes quantities: `daily_velocity × coverage_days - inventory_on_hand`
6. Plan displayed in UI for review
7. User exports to Excel in predefined format

## Key Features
- **SKU auto-matching:** Fuzzy match FNSKUs to internal SKUs; confirmed matches are remembered
- **Configurable rules engine:** User-defined rules stored in SQLite (e.g. "exclude SKUs < 30 days old", "always plan 6 months for category X")
- **Plan calculator:** Configurable coverage target (default 4 months), excludes insignificant SKUs
- **Analysis & reporting:** Sales velocity trends, ABC classification, coverage summaries
- **Excel output:** Predefined format with SKU, FNSKU, and other product-level identifiers

## Data Sources
- **Input:** Amazon Seller Central CSV/Excel downloads (Business Reports)
- **Output:** Excel production plan (internal planning doc)

## Design Decisions
- SQLite for all persistent data — no external database needed for a 1-2 person local tool
- Raw `sqlite3` used directly (not SQLAlchemy); `conn.row_factory = sqlite3.Row` for dict-like access
- Fuzzy matching for SKU reconciliation with a confirmed-match memory to avoid re-doing work
- Rules stored as structured config in SQLite (not hardcoded), editable from the UI
- All plan runs saved to SQLite for historical comparison

## Database Context (database.py)

### What it is
- SQLite stored as a single file `capstone.db` in the backend root
- No server or installation needed — Python has SQLite built in
- Created automatically on first backend startup
- On upload: logs to `uploads` table AND saves every SKU row to `restock_snapshots` — so the dashboard can reload data on backend restart without re-uploading

### Tables
- **uploads** — filename, date, rows processed for every restock file upload
- **restock_snapshots** — per-SKU row per upload (fnsku, merchant_sku, product_name, asin, available, units_sold_last_30, alert, days_of_supply); linked via upload_id
- **settings** — key-value store for user preferences (e.g. low stock threshold), persists across restarts

### pandas NA handling (important)
- `standardize_df()` converts text columns to pandas `StringDtype`, making nulls `pd.NA` instead of `None`
- `str(val)` or `""` on a `pd.NA` raises `TypeError: boolean value of NA is ambiguous`
- **Fix:** always use `safe_str()` and `safe_int()` helpers before any DB insert

### Duplicate upload prevention (hash only)
Amazon always names the restock file the same thing (e.g. `Restock_Report.csv`) — filename is not a reliable identifier.
`compute_file_hash(df)` creates an MD5 fingerprint of the entire DataFrame. Same data = same hash. Different data = different hash.
`is_duplicate_upload(file_hash)` checks if that hash already exists in the `uploads` table.

- Hash match → skip DB save, but file still loads into memory so dashboard works
- No match → new data, saves upload log + full snapshot

The 7-day filename window was removed because:
- Amazon always uses the same filename, so it adds no value
- It would wrongly block two different reports uploaded in the same week
- Hash alone is sufficient

### Stale report detection
Amazon only lets users download the current report — not historical ones.
But a user could accidentally upload an old file saved on their computer.
This would corrupt velocity tracking and OOS duration by treating old data as current.

`is_stale_report(df)` checks the `recommended_ship_date` column:
- Most recent date in that column is 90+ days old → report is stale → upload rejected with HTTP 400
- Column missing or unparseable → allowed through (safe fallback)

### Order of checks in `upload_restock`
1. Stale check → reject immediately with HTTP 400 if too old
2. Standardize + load into memory (`app.state.restock_df`)
3. Hash check → skip DB save if duplicate
4. If new → log upload + save snapshot

### Why filename doesn't matter for history
Each snapshot is linked to `upload_id`, not a filename.
`window_label` (e.g. `"Mar 02, 2026 – Apr 01, 2026"`) is computed from `upload_date` at query time, so the history page always shows meaningful date ranges regardless of what the file was named.

### Sales window inference
- The restock CSV has no report date column — Amazon does not timestamp the file
- `upload_date` (`datetime.now()` at upload time) is used as the end of the 30-day sales window
- `get_all_uploads()` computes and returns three extra fields per upload:
  - `window_start` — upload_date minus 30 days (ISO date string)
  - `window_end` — upload_date (ISO date string)
  - `window_label` — human-readable e.g. `"Mar 02, 2026 – Apr 01, 2026"`
- Use `window_label` directly in the Details page UI — no date math needed on the frontend

### Velocity tracking logic
- Each restock report covers a 30-day rolling sales window
- Comparing uploads only 7 days apart = 23 days overlap → not meaningful
- `find_comparison_pair()` finds two uploads 25–35 days apart for true month-over-month comparison
- Falls back to the two most recent uploads if no monthly pair exists yet; flags `is_monthly: false`
- Frontend should warn the user when `is_monthly: false`

### Out of stock duration
- Walks uploads from newest to oldest per SKU
- Counts consecutive uploads where `alert = "out_of_stock"`
- Uses actual upload dates to calculate real days OOS (not a fixed interval assumption)
- Only returns SKUs OOS for 2+ consecutive uploads

---

## main.py Updates

### Startup — Auto-loads last snapshot
On backend startup, `init_db()` runs first to create tables if they don't exist.
Then it fetches the most recent upload from the DB and loads it into `app.state.restock_df` automatically.
Dashboard works immediately on refresh — no re-upload needed.

### /upload/restock — Validation + duplicate detection
1. `is_stale_report(df)` — rejects with HTTP 400 if `recommended_ship_date` is 90+ days old
2. Standardizes DataFrame + loads into `app.state.restock_df`
3. `compute_file_hash(df)` → `is_duplicate_upload(file_hash)` — skips DB save if hash already exists
4. If new: logs to `uploads` + saves full snapshot to `restock_snapshots`

Response always includes `db_message` so the frontend can tell the user whether the file was saved or a duplicate.

### API endpoints
| Method | Path | Description |
|--------|------|-------------|
| GET | `/uploads/history` | All past uploads with sales window labels |
| GET | `/analytics/velocity` | Month-over-month sales change per SKU |
| GET | `/analytics/oos-duration` | SKUs out of stock across consecutive uploads |
| GET | `/analytics/trend/{sku}` | Full sales history for one SKU over time |
| POST | `/settings/save` | Save a setting `{ key, value }` to SQLite |
| GET | `/settings/{key}` | Retrieve a setting by key |

### How `compute_file_hash(df)` works
```python
hashlib.md5(
    pd.util.hash_pandas_object(df, index=True).values.tobytes()
).hexdigest()
```

Step by step:
1. `pd.util.hash_pandas_object(df)` — converts every cell in the entire DataFrame into a number
2. `.values.tobytes()` — turns all those numbers into a raw byte string
3. `hashlib.md5(...)` — runs MD5 on that byte string
4. `.hexdigest()` — produces a 32-character hex string like `a3f8c2d1e9b74f2a...`

**It has no identifier — it IS the identifier.** Same rows/columns/values = same hash. One number different = completely different hash.

```
upload_id=1  |  file_name="Restock_Report.csv"  |  file_hash="a3f8c2d1..."
upload_id=2  |  file_name="Restock_Report.csv"  |  file_hash="b9e4f7a2..."
```

Same filename + different hash = genuinely new data → saved. Same filename + same hash = exact duplicate → blocked.

### Important: delete capstone.db if upgrading
The `uploads` table now has a `file_hash` column that older DB versions don't have.
Delete `capstone.db` and restart the backend to recreate it cleanly.