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

### Upload validation — two checks, in order

**Check 1: Stale report (`is_stale_report`)**
- Looks at `recommended_ship_date` column in the uploaded file
- If the most recent date found is 90+ days old → rejected with HTTP 400
- Protects against accidentally uploading an old file saved on the computer
- Falls back to allowing if the column is missing or unparseable

**Edge case — same max date as a previous upload:**
`is_stale_report()` only checks if the date is 90+ days old — it does not compare against previous uploads. So same max date always passes the stale check. The hash check then decides:
- Same max date + same data → same hash → skip DB save ✅
- Same max date + different data (different stock/sales numbers) → different hash → saves new snapshot ✅

**Check 2: Duplicate hash (`is_duplicate_upload`)**
- Computes an MD5 fingerprint of the entire DataFrame via `compute_file_hash(df)`
- If that fingerprint already exists in the `uploads` table → skip DB save
- File still loads into memory so the dashboard works normally
- Only the DB save is skipped — user sees no difference on the dashboard

If both checks pass → `log_upload` saves to `uploads` table, `save_snapshot` saves all SKU rows.

**What "skip DB save" means:**
Every upload does two things:
1. Load into memory (`app.state.restock_df`) — powers the dashboard right now
2. Save to database — preserves history for analysis

Skipping DB save means #1 still happens (dashboard works) but #2 is skipped — no duplicate snapshot added. History stays clean, dashboard still works.

**What was removed and why:**
`is_older_than_last_upload()` was removed. It compared the file's data dates against the upload timestamp in the DB, which always fails because Amazon's report data is always weeks behind the current date. The stale check + hash check together are sufficient and don't produce false rejections.

### Upload Status Panel (`/uploads/status`)
`get_upload_status()` returns the last saved upload with its sales window label and a suggested next upload date (~25 days after last upload).
Used by `Upload_Generate.jsx` to show the user what's already saved and give guidance on when to upload the next report.
This is informational only — it does not block any uploads.

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

---

## Frontend Logic — Details.jsx

### Priority Restock List — view switching
The Priority Restock List has two modes:
- **Single upload mode** — shows current OOS SKUs ranked by sales velocity
- **Multi upload mode** — shows persistent OOS with duration and priority score

**How the switch works:**
`showCurrentOos` is set to `true` when `oosDuration` is empty. This drives which list renders.

| Situation | `oosDuration` | View shown |
|-----------|--------------|------------|
| One upload | empty (no pairs to compare) | Current snapshot (single mode) |
| Two uploads same day | empty (7-day gap filter removes them) | Current snapshot (single mode) |
| Two uploads ~30 days apart | has real data | Persistent OOS (multi mode) |

**Why not use `uploadCount < 2`:**
The original implementation switched on `uploadCount < 2`. This broke when two files were uploaded on the same day — `uploadCount` became 2 but the 7-day gap check in `get_out_of_stock_duration` filtered both uploads out, leaving `oosDuration` empty and showing the wrong empty state message. Switching on actual data (`oosDuration.length === 0`) handles all cases correctly.

**Inside each card:**
`uploadCount` is still used to decide whether to show duration fields (first OOS date, consecutive uploads count, estimated days, priority bar). These fields only make sense with real multi-upload data. So:
- `showCurrentOos` → controls which list renders
- `uploadCount` → controls which fields appear inside each card

### 7-day gap rule in `get_out_of_stock_duration`
`MIN_OOS_GAP_DAYS = 7` — uploads less than 7 days apart are skipped when counting consecutive OOS streaks. Prevents same-week re-uploads from inflating streak count. A real monthly upload pattern (25–35 days apart) always passes this check.

---

## Production Plan and Data Persistence — production.py, main.py, Settings_Tab.jsx, Upload_Generate.jsx

### Business context
The customer (Maventee) sells print-on-demand t-shirts on Amazon FBA and directly to customers. Employees go to a warehouse bin where a decal (design) is stored, grab it, and print it onto a blank shirt. The production plan tells employees: which bin (WL = warehouse location), which SKU/design, how many shirts to print.

Two files are required to generate the plan:
- **Restock report** — identifies what is low or out of stock
- **Database file** — maps FNSKU → Seller SKU → Warehouse Location

### SKU prefix system

| Prefix | Type | Sheet | Notes |
|--------|------|-------|-------|
| `Pr-` | Amazon-fulfilled | Sheet 1 — Order | Main production plan |
| `Sl-` | Seller-fulfilled (direct) | Sheet 3 — Seller Fulfilled | Printed separately, never mixed with Pr- |
| `P-RN-` | Multipacks / bundles | Sheet 4 — Multipacks | Expanded into individual color rows |
| `Reg-` | Regular (non-Amazon) | Not currently handled | Future use |

**IMPORTANT:** `Sl-` SKUs are single orders printed and shipped directly to customers. They must NEVER be mixed with `Pr-` items on the main Order sheet.

### Filter logic — which SKUs are included
A SKU is included if **any** of these are true:
1. Amazon `alert` = `out_of_stock` or `low_stock`
2. Amazon `recommended_action` = `Create shipping plan`
3. `days_of_supply` < `days_supply_threshold` setting (optional, disabled by default)

A SKU is **excluded** if **both** are true:
- `units_sold_last_30_days = 0`
- `recommended_replenishment_qty = 0`

Reason: zero sales + zero recommended qty = likely discontinued or inactive. P-RN multipack items were a prime example of this.

A SKU is also skipped if calculated quantity ≤ 0 (current stock already covers the target period).

**StringDtype gotcha:** After `standardize_df()` runs, numeric columns are stored as `StringDtype`. Always use `pd.to_numeric(col, errors="coerce").fillna(0)` before numeric comparisons. Never use `== 0` directly on `StringDtype` columns — it will silently fail.

### Quantity formula
```
projected_demand = units_sold_last_30_days × (coverage_weeks / 4)
qty_needed       = projected_demand − total_units_on_hand
qty_needed       = round_to_valid_qty(qty_needed)
```
`total_units_on_hand` = available at Amazon + inbound shipments (from `Total Units` column).

**Example:** 30 units/month, 12-week coverage, 20 on hand:
`30 × 3 = 90` → `90 − 20 = 70` → rounded to `72`

### Valid quantity rounding (`round_to_valid_qty`)
Minimum 6, then multiples of 12:
- `qty ≤ 6` → `6`
- `qty > 6` → `ceil(qty / 12) * 12`

Examples: `5→6, 8→12, 15→24, 30→36, 65→72, 130→132, 144→144`

### Settings (saved to SQLite)
| Setting | Key in SQLite | Default | Notes |
|---------|--------------|---------|-------|
| `coverage_weeks` | `coverage_weeks` | `12` | Weeks of inventory to produce. Quick-select: 4w/8w/12w/16w/20w/24w + custom input |
| `days_supply_threshold` | `days_supply_threshold` | `null` (disabled) | Includes SKUs with days of supply below this value. `84` matches 12-week coverage |
| `low_stock_threshold` | `low_stock_threshold` | `10` | Dashboard only — does **not** affect production plan |

Removed: `90-day sales window` (client confirmed 30-day is sufficient), `min_sales_threshold` (zero-sales exclusion rule handles this instead).

### Excel output — 4 sheets

**Sheet 1 — Order (Pr- SKUs only)**
Main Amazon production run. Sorted by WL so employees walk bins in order.
Columns: `No | WL | Maventee - Out of Stock -SKU | FNSKU | Quantity | Box`
- Row 1: blank
- Row 2: blue headers (hex `4472C4`)
- Row 3+: data rows, alternating fill
- Last row: TOTAL quantity (green fill)

**Sheet 2 — Summary (Pr- SKUs only)**
Tells the warehouse how many blank shirts to pull before the print run.

Section 1 — Run metadata: Generated date, coverage target (weeks), total SKUs, total units to produce.

Section 2 — Color + Size combinations (grouped, color bolded when it changes):
```
Black  | Toddler 2   | 36
Black  | Unisex 2XL  | 48
Mauve  | Onesie 18   | 12
TOTAL  |             | 1380
```

Section 3 — Subtotal by Color (quick reference):
```
Black     | 108
Dark Gray |  84
TOTAL     | 1380
```

`Sl-` and `P-RN-` items do NOT contribute to the Summary blank shirt count.

**Sheet 3 — Seller Fulfilled (Sl- SKUs)**
Same column format as Sheet 1. Items printed and shipped directly to customers.

**Sheet 4 — Multipacks (P-RN- SKUs)**
Each multipack SKU is expanded into individual color rows. Each color gets the FULL original quantity (not divided).

Example: 24 units of `P-RN-6P-Mauve/Mrn/Prp/Slt/Lgn/Lg-Large` becomes:
```
Mauve       | Large | 24
Maroon      | Large | 24
Purple      | Large | 24
Slate       | Large | 24
Lagoon Blue | Large | 24
Light Gray  | Large | 24
```
Columns: `No | WL | Original SKU | Color | Size | Quantity | Box`
Header color: navy (hex `1e2468`)

### SKU parsing — color & size
SKU structure (reading from the end): `[Prefix]-[Design]-[Color]-[GarmentType]-[Size]`
- Last segment = Size
- Second-to-last = GarmentType if recognized, otherwise Color
- Third-to-last = Color

Known garment types: `toddler, youth, unisex, uni, onesie, babyt, dtg, dtg_ma, ma`

Full size label = garment type + size: `Toddler 2`, `Youth L`, `Unisex XL`, `Onesie 18`, `Baby T 1Y`
(`Uni` is normalized to `Unisex`)

**Size normalization:** `2XLarge→2XL`, `3XLarge→3XL`, `XLarge→XL`, `X-Large→XL`, `Large→L`, `Medium→M`, `Small→S`, `XXL→2XL`, `XXXL→3XL`

**Color normalization (abbreviation → full name):**
`BL→Black`, `MA/B.MA/DTG_MA→Mauve`, `DG/DGray/DarkGray→Dark Gray`, `LG/LGray/LightGray→Light Gray`, `FGreen/F.Green/ForestGreen→Forest Green`, `MGreen/MilitaryGreen→Military Green`, `HNavy/HeatherNavy→Heather Navy`, `HPurple→Heather Purple`, `Royal/RoyalBlue→Royal Blue`, `iBlue/IndigoBlue→Indigo Blue`, `Lagoon/LagoonBlue→Lagoon Blue`, `W→White`, `TexOrange→Texas Orange`

Edge cases: SKUs with `/` in color segment = Multipack. SKU too short to parse = `"Unknown"` color and size.

### Multipack color parsing
Color segments use abbreviations separated by `/` or `-`:
- `Mauve/Mrn/Prp/Slt/Lgn/Lg` → Mauve, Maroon, Purple, Slate, Lagoon Blue, Light Gray
- `(Navy-Slate-MGreen)` → Navy, Slate, Military Green
- `(Forest-Red-Royal)` → Forest Green, Red, Royal Blue

Each color in the pack receives the FULL original quantity (not divided).

### Database file persistence
The database file is static reference data that rarely changes (only when new designs are added). It is persisted to disk as `database_mapping.parquet` in the backend root folder.

- On upload: saved to memory (`DATA_STORE["database"]`) AND written to `database_mapping.parquet`
- On backend startup: if `database_mapping.parquet` exists, it is automatically loaded back into memory
- To update: re-upload the database file — the new version overwrites the parquet file automatically

The database mapping is NOT stored in SQLite because it is static reference data, not time-series data. A parquet file is simpler and more appropriate.

### What the production plan reads
The production plan reads from `app.state.restock_df` (the full restock report in memory) — NOT from the SQLite `restock_snapshots` table. The snapshot table is a trimmed version missing columns like `total_units` and `recommended_action` that the plan needs.

On backend startup, the last snapshot is restored from SQLite into `app.state.restock_df` so the dashboard and production plan work without re-uploading. However, if the plan fails with missing column errors after a restart, the user should re-upload the full restock report.

### Button preload logic — Upload_Generate.jsx
React state (`restockInfo`, `databaseInfo`) resets to `null` on every page refresh. Two checks run on page mount:

1. `GET /uploads/status` — if `has_uploads` is `true` → sets `restockInfo = { preloaded: true }` (restock data was restored from SQLite on startup)
2. `GET /upload/database-status` — if `loaded` is `true` → sets `databaseInfo = { preloaded: true }` (database mapping was restored from parquet on startup)

If both pass, both buttons are enabled immediately without re-uploading. The **Generate Master File** button additionally requires the warehouse file, which is still session-only (not persisted).

### API endpoints
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/upload/restock` | Upload + save snapshot to SQLite |
| POST | `/upload/database` | Upload + save to parquet |
| POST | `/upload/warehouse` | Upload warehouse file (session-only) |
| POST | `/generate/production-plan` | Generate 4-sheet production plan XLSX |
| GET | `/restock/low-stock` | All flagged rows for dashboard |
| GET | `/uploads/history` | Past uploads with sales window labels |
| GET | `/uploads/status` | Last upload info + `has_uploads` flag |
| GET | `/uploads/download/{id}` | Download snapshot CSV |
| GET | `/upload/database-status` | Check if DB mapping is loaded |
| GET | `/analytics/velocity` | Month-over-month sales change per SKU |
| GET | `/analytics/oos-duration` | Persistent OOS SKUs across uploads |
| GET | `/analytics/current-oos` | Current OOS (single upload fallback) |
| GET | `/analytics/trend/{sku}` | Full sales history for one SKU over time |
| POST | `/settings/save` | Save a setting `{ key, value }` to SQLite |
| GET | `/settings/{key}` | Retrieve a setting by key |