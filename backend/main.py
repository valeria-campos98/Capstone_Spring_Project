from fileinput import filename
from fastapi import FastAPI, UploadFile, File, HTTPException
import pandas as pd
import io
import os
from fastapi.middleware.cors import CORSMiddleware
from services.standarize import standardize_df, standardize_database, standardize_inventory
from fastapi.responses import StreamingResponse
from services.matching import build_master_dataset
from production import generate_production_plan
from database import (
    init_db,
    log_upload,
    save_snapshot,
    is_duplicate_upload,
    is_stale_report,
    get_upload_status,
    compute_file_hash,
    get_all_uploads,
    get_snapshot_by_upload,
    get_velocity_data,
    get_out_of_stock_duration,
    get_current_oos,
    get_sales_trend,
    save_setting,
    get_setting,
    get_active_run,
    create_production_run,
    get_run_with_batches,
    create_batch,
    abandon_run,
    refresh_unbatched_quantities,
    get_production_history,
    get_batch_items_for_download,
    rename_run,
    rename_batch,
    save_run_notes,
    save_batch_notes,
    save_warehouse_notes,
    get_active_batch_for_warehouse,
    save_warehouse_progress,
    finalize_batch,
    get_production_run_history_full,
    get_batch_box_detail,
)


app = FastAPI()


# ── File paths for persistent storage ────────────────────────────────────────
DB_MAPPING_PATH   = "database_mapping.parquet"  # SKU → warehouse location mapping
RESTOCK_FULL_PATH = "restock_latest.parquet"    # full restock report (all 30 cols)


# ── Startup ───────────────────────────────────────────────────────────────────

@app.on_event("startup")
def startup():
    init_db()

    # ── Restore full restock report ───────────────────────────────────────────
    # Priority 1: parquet file on disk (full 30-col report, saved on last upload)
    # Priority 2: SQLite snapshot (trimmed, only ~16 cols — dashboard works but
    #             production plan will ask user to re-upload)
    if os.path.exists(RESTOCK_FULL_PATH):
        try:
            df = pd.read_parquet(RESTOCK_FULL_PATH)
            app.state.restock_df = df
            print(f" Loaded full restock report from disk ({len(df)} rows, {len(df.columns)} cols)")
        except Exception as e:
            print(f"⚠️ Could not load restock from disk: {e}")
            _restore_restock_from_snapshot()
    else:
        _restore_restock_from_snapshot()

    # ── Restore database mapping ──────────────────────────────────────────────
    if os.path.exists(DB_MAPPING_PATH):
        try:
            DATA_STORE["database"] = pd.read_parquet(DB_MAPPING_PATH)
            print(f"✅ Loaded database mapping from disk ({len(DATA_STORE['database'])} rows)")
        except Exception as e:
            print(f"⚠️ Could not load database mapping: {e}")


def _restore_restock_from_snapshot():
    """Fall back — restore trimmed snapshot from SQLite."""
    uploads = get_all_uploads()
    if uploads:
        latest_upload_id = uploads[0]["id"]
        rows = get_snapshot_by_upload(latest_upload_id)
        if rows:
            df = pd.DataFrame(rows)
            app.state.restock_df = df
            print(f"⚠️ Loaded restock snapshot from SQLite ({len(df)} rows, {len(df.columns)} cols)")
            print("   Re-upload restock report for full production plan functionality.")


DATA_STORE = {
    "restock": None,
    "warehouse": None,
    "inventory": None,
    "database": None,
}

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"],
    allow_methods=["*"],
    allow_headers=["*"],
)


# ── Health check ──────────────────────────────────────────────────────────────

@app.get("/")
async def health_check():
    return {"status": "Backend running"}


# ── File reader ───────────────────────────────────────────────────────────────

def read_csv_or_excel(upload: UploadFile) -> pd.DataFrame:
    filename = (upload.filename or "").lower()
    content = upload.file.read()

    try:
        if filename.endswith(".csv"):
            for enc in ("utf-8", "utf-8-sig", "cp1252", "latin1"):
                try:
                    text = content.decode(enc)
                    return pd.read_csv(io.StringIO(text))
                except UnicodeDecodeError:
                    continue
            text = content.decode("cp1252", errors="replace")
            return pd.read_csv(io.StringIO(text))

        elif filename.endswith(".xlsx") or filename.endswith(".xls"):
            return pd.read_excel(io.BytesIO(content))

        raise HTTPException(status_code=400, detail="Unsupported file type. Use .csv or .xlsx")

    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Failed to read file: {str(e)}")


# ── Upload endpoints ──────────────────────────────────────────────────────────

@app.post("/upload/restock")
async def upload_restock(file: UploadFile = File(...)):
    df = standardize_df(read_csv_or_excel(file))

    if "fnsku" not in df.columns:
        raise HTTPException(
            status_code=400,
            detail="Restock file must include FNSKU columns"
        )

    if is_stale_report(df):
        raise HTTPException(
            status_code=400,
            detail="This report appears to be outdated (data is 90+ days old). Please upload a current restock report."
        )

    # Save to memory
    app.state.restock_df = df
    DATA_STORE["restock"] = df

    # Save full report to disk — survives backend restarts
    # Production plan needs all 30 columns — this ensures they're always available
    try:
        df.to_parquet(RESTOCK_FULL_PATH)
        print(f" Full restock report saved to disk ({len(df)} rows, {len(df.columns)} cols)")
        disk_message = " Saved to disk."
    except Exception as e:
        print(f" Could not save restock to disk: {e}")
        disk_message = ""

    # Save trimmed snapshot to SQLite for history and analytics
    file_hash = compute_file_hash(df)
    if not is_duplicate_upload(file_hash):
        upload_id = log_upload(file.filename, len(df), file_hash)
        save_snapshot(upload_id, df)
        print(f"\nRESTOCK uploaded: {file.filename} | {len(df)} rows | upload_id={upload_id}")
        db_message = f"Restock file uploaded and saved successfully.{disk_message}"
    else:
        upload_id = None
        print(f"\n⚠️ Duplicate skipped: {file.filename}")
        db_message = f"File loaded into memory (duplicate — not saved to database).{disk_message}"

    return {
        "file": file.filename,
        "rows": len(df),
        "upload_id": upload_id,
        "message": db_message
    }


@app.post("/upload/warehouse")
async def upload_warehouse(file: UploadFile = File(...)):
    df = standardize_df(read_csv_or_excel(file))

    if "sku" not in df.columns or "warehouse_location" not in df.columns:
        raise HTTPException(
            status_code=400,
            detail="Warehouse file must include SKU and Warehouse Location columns"
        )

    DATA_STORE["warehouse"] = df
    return {
        "file": file.filename,
        "rows": len(df),
        "message": "Warehouse file uploaded successfully"
    }


@app.post("/upload/inventory")
async def upload_inventory(file: UploadFile = File(...)):
    df = standardize_inventory(read_csv_or_excel(file))

    if "sku" not in df.columns and "fnsku" not in df.columns:
        raise HTTPException(
            status_code=400,
            detail="Inventory file must include SKU or FNSKU"
        )

    DATA_STORE["inventory"] = df
    return {
        "file": file.filename,
        "rows": len(df),
        "message": "Inventory file uploaded successfully"
    }


@app.post("/upload/database")
async def upload_database(file: UploadFile = File(...)):
    df = standardize_database(read_csv_or_excel(file))

    if "fnsku" not in df.columns or "sku" not in df.columns:
        raise HTTPException(
            status_code=400,
            detail=f"Database must include FNSKU and Seller SKU. Found: {list(df.columns)}"
        )

    DATA_STORE["database"] = df

    try:
        df.to_parquet(DB_MAPPING_PATH)
        print(f"✅ Database mapping saved to disk ({len(df)} rows)")
        disk_message = " Saved to disk — will reload automatically on restart."
    except Exception as e:
        print(f"⚠️ Could not save database mapping to disk: {e}")
        disk_message = ""

    return {
        "file": file.filename,
        "rows": len(df),
        "message": f"Database file uploaded successfully.{disk_message}"
    }


# ── Generate master ───────────────────────────────────────────────────────────

@app.post("/generate/master")
async def generate_master():
    restock_df  = DATA_STORE["restock"]
    database_df = DATA_STORE["database"]
    warehouse_df = DATA_STORE["warehouse"]
    inventory_df = DATA_STORE["inventory"]

    if restock_df is None or database_df is None or warehouse_df is None:
        raise HTTPException(
            status_code=400,
            detail="Missing required uploads. Need: restock, database, warehouse (inventory optional)."
        )

    try:
        master_df = build_master_dataset(
            restock_df=restock_df,
            database_df=database_df,
            warehouse_df=warehouse_df,
            inventory_df=inventory_df,
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

    buf = io.StringIO()
    master_df.to_csv(buf, index=False)
    buf.seek(0)

    return StreamingResponse(
        iter([buf.getvalue()]),
        media_type="text/csv",
        headers={"Content-Disposition": "attachment; filename=master_dataset.csv"},
    )


# ── Dashboard data ────────────────────────────────────────────────────────────

@app.get("/restock/low-stock")
def get_low_stock(limit: int = 2000):
    df = getattr(app.state, "restock_df", None)

    if df is None:
        raise HTTPException(400, "Upload restock report first")

    DAYS_COL = "total_days_of_supply_(including_units_from_open_shipments)"

    cols = [
        c for c in [
            "product_name",
            "fnsku",
            "merchant_sku",
            "asin",
            "available",
            DAYS_COL,
            "units_sold_last_30_days",
            "recommended_replenishment_qty",
            "alert",
        ] if c in df.columns
    ]

    return df[cols].head(limit).to_dict(orient="records")


# ── Status endpoints ──────────────────────────────────────────────────────────

@app.get("/upload/database-status")
def database_status():
    loaded = DATA_STORE.get("database") is not None
    rows = len(DATA_STORE["database"]) if loaded else 0
    from_disk = os.path.exists(DB_MAPPING_PATH)
    return {
        "loaded": loaded,
        "rows": rows,
        "persisted_on_disk": from_disk,
    }


@app.get("/uploads/status")
def upload_status():
    return get_upload_status()


@app.get("/uploads/history")
def upload_history():
    return get_all_uploads()


@app.get("/uploads/download/{upload_id}")
def download_snapshot(upload_id: int):
    rows = get_snapshot_by_upload(upload_id)
    if not rows:
        raise HTTPException(404, f"No snapshot found for upload_id={upload_id}")

    df = pd.DataFrame(rows)
    df = df.drop(columns=["id", "upload_id"], errors="ignore")
    df = df.rename(columns={
        "snapshot_date":             "Report Date",
        "fnsku":                     "FNSKU",
        "merchant_sku":              "Merchant SKU",
        "product_name":              "Product Name",
        "asin":                      "ASIN",
        "available":                 "Available Units",
        "total_units":               "Total Units",
        "inbound":                   "Inbound Units",
        "units_sold_last_30":        "Units Sold (Last 30 Days)",
        "sales_last_30_days":        "Sales Revenue (Last 30 Days)",
        "alert":                     "Alert Status",
        "days_of_supply":            "Days of Supply",
        "recommended_replenishment": "Recommended Replenishment Qty",
        "recommended_ship_date":     "Recommended Ship Date",
        "recommended_action":        "Recommended Action",
    })

    uploads = get_all_uploads()
    upload = next((u for u in uploads if u["id"] == upload_id), None)
    window = upload["window_end"] if upload else str(upload_id)

    buf = io.StringIO()
    df.to_csv(buf, index=False)
    buf.seek(0)

    return StreamingResponse(
        iter([buf.getvalue()]),
        media_type="text/csv",
        headers={"Content-Disposition": f"attachment; filename=restock_snapshot_{window}.csv"},
    )


# ── Analytics ─────────────────────────────────────────────────────────────────

@app.get("/analytics/velocity")
def velocity():
    data = get_velocity_data()
    if not data:
        return {"message": "Need at least 2 uploads to show velocity.", "data": []}
    return {"data": data}


@app.get("/analytics/oos-duration")
def oos_duration():
    data = get_out_of_stock_duration()
    if not data:
        return {"message": "Need at least 2 uploads to track OOS duration.", "data": []}
    return {"data": data}


@app.get("/analytics/current-oos")
def current_oos():
    data = get_current_oos()
    uploads = get_all_uploads()
    return {
        "data": data,
        "upload_count": len(uploads),
        "is_single_upload": len(uploads) < 2
    }


@app.get("/analytics/trend/{merchant_sku}")
def sales_trend(merchant_sku: str):
    data = get_sales_trend(merchant_sku)
    if not data:
        return {"message": "No historical data for this SKU yet.", "data": []}
    return {"merchant_sku": merchant_sku, "data": data}


# ── Settings ──────────────────────────────────────────────────────────────────

@app.post("/settings/save")
def save_settings(payload: dict):
    key = payload.get("key")
    value = payload.get("value")
    if not key:
        raise HTTPException(400, "key is required")
    save_setting(key, str(value))
    return {"message": f"Setting '{key}' saved"}


@app.get("/settings/{key}")
def get_settings(key: str):
    value = get_setting(key)
    if value is None:
        raise HTTPException(404, f"Setting '{key}' not found")
    return {"key": key, "value": value}


# ── Production Plan ───────────────────────────────────────────────────────────

@app.post("/generate/production-plan")
def generate_production_plan_endpoint():
    restock_df  = getattr(app.state, "restock_df", None)
    database_df = DATA_STORE.get("database")

    if restock_df is None:
        raise HTTPException(400, "Upload restock report first.")
    if database_df is None:
        raise HTTPException(400, "Upload database/mapping file first.")

    # Check the restock data has all required columns
    # If it was restored from SQLite snapshot it will be missing these
    required_cols = {"units_sold_last_30_days", "recommended_replenishment_qty", "total_units"}
    missing = required_cols - set(restock_df.columns)
    if missing:
        raise HTTPException(
            400,
            f"Restock data is missing required columns: {sorted(missing)}. "
            f"Please re-upload the full restock report before generating a plan."
        )

    try:
        coverage_weeks = int(get_setting("coverage_weeks") or 12)
    except (TypeError, ValueError):
        coverage_weeks = 12

    try:
        days_threshold_val = get_setting("days_supply_threshold")
        days_threshold = int(days_threshold_val) if days_threshold_val and days_threshold_val != "null" else None
    except (TypeError, ValueError):
        days_threshold = None

    try:
        excel_bytes = generate_production_plan(
            restock_df=restock_df,
            database_df=database_df,
            coverage_weeks=coverage_weeks,
            days_supply_threshold=days_threshold,
        )
    except ValueError as e:
        raise HTTPException(400, str(e))

    from fastapi.responses import Response
    return Response(
        content=excel_bytes,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": "attachment; filename=production_plan.xlsx"},
    )


# ── Production Runs ───────────────────────────────────────────────────────────

@app.get("/production-runs/active")
def get_active_production_run():
    """Returns the active production run or null."""
    run = get_active_run()
    if not run:
        return None
    full = get_run_with_batches(run["id"])
    full["unbatched_count"] = len(full.get("unbatched", []))
    return full


@app.post("/production-runs/create")
def create_production_run_endpoint():
    """
    Generates a new production plan and saves it as an active run.
    All items start as unbatched. Returns the full run with items.
    """
    restock_df  = getattr(app.state, "restock_df", None)
    database_df = DATA_STORE.get("database")

    if restock_df is None:
        raise HTTPException(400, "Upload restock report first.")
    if database_df is None:
        raise HTTPException(400, "Upload database/mapping file first.")

    required_cols = {"units_sold_last_30_days", "recommended_replenishment_qty", "total_units"}
    missing = required_cols - set(restock_df.columns)
    if missing:
        raise HTTPException(400, f"Restock data missing columns: {sorted(missing)}. Re-upload the full restock report.")

    try:
        coverage_weeks = int(get_setting("coverage_weeks") or 12)
    except (TypeError, ValueError):
        coverage_weeks = 12

    try:
        days_threshold_val = get_setting("days_supply_threshold")
        days_threshold = int(days_threshold_val) if days_threshold_val and days_threshold_val != "null" else None
    except (TypeError, ValueError):
        days_threshold = None

    # Use production.py to calculate the items
    from production import calculate_production_items
    try:
        items = calculate_production_items(
            restock_df=restock_df,
            database_df=database_df,
            coverage_weeks=coverage_weeks,
            days_supply_threshold=days_threshold,
        )
    except ValueError as e:
        raise HTTPException(400, str(e))

    from datetime import date
    run_name = f"Production Run — {date.today().strftime('%b %d, %Y')}"
    run_id = create_production_run(run_name, coverage_weeks, items)
    full = get_run_with_batches(run_id)
    full["unbatched_count"] = len(full.get("unbatched", []))
    return full


@app.get("/production-runs/{run_id}")
def get_production_run(run_id: int):
    """Returns a full production run with batches and unbatched items."""
    full = get_run_with_batches(run_id)
    full["unbatched_count"] = len(full.get("unbatched", []))
    return full


@app.post("/production-runs/{run_id}/batch")
def create_batch_endpoint(run_id: int, payload: dict):
    """
    Creates a batch from selected unbatched item IDs.
    Body: { batch_name: str, item_ids: [int], notes: str }
    """
    batch_name = payload.get("batch_name", "").strip() or "Batch"
    item_ids   = payload.get("item_ids", [])
    notes      = payload.get("notes", "")
    if not item_ids:
        raise HTTPException(400, "No items selected.")
    try:
        batch = create_batch(run_id, batch_name, item_ids)
        if notes:
            save_batch_notes(batch["id"], notes)
            batch["notes"] = notes
        return batch
    except ValueError as e:
        raise HTTPException(400, str(e))


@app.post("/production-runs/{run_id}/abandon")
def abandon_run_endpoint(run_id: int):
    """Abandons a run and clears unbatched items."""
    abandon_run(run_id)
    return {"message": "Run abandoned."}


@app.patch("/production-runs/{run_id}/rename")
def rename_run_endpoint(run_id: int, payload: dict):
    """Renames a production run."""
    name = payload.get("name", "").strip()
    if not name:
        raise HTTPException(400, "Name cannot be empty.")
    rename_run(run_id, name)
    return {"message": "Run renamed."}


@app.patch("/production-runs/batch/{batch_id}/rename")
def rename_batch_endpoint(batch_id: int, payload: dict):
    """Renames a batch."""
    name = payload.get("name", "").strip()
    if not name:
        raise HTTPException(400, "Name cannot be empty.")
    rename_batch(batch_id, name)
    return {"message": "Batch renamed."}


@app.get("/production-runs/{run_id}/download/{batch_id}")
def download_batch(run_id: int, batch_id: int):
    """Generates and returns an Excel file for a single batch."""
    from production import generate_batch_excel

    items = get_batch_items_for_download(batch_id)
    if not items:
        raise HTTPException(404, "No items found for this batch.")

    # Load box splits for each item
    from database import get_connection
    conn = get_connection()
    cursor = conn.cursor()
    for item in items:
        cursor.execute("""
            SELECT box_number, box_qty FROM box_splits
            WHERE batch_item_id = ? ORDER BY box_number
        """, (item["id"],))
        item["box_splits"] = [
            {"box_number": r["box_number"], "box_qty": r["box_qty"]}
            for r in cursor.fetchall()
        ]
    conn.close()

    # Get batch and run names
    full = get_run_with_batches(run_id)
    batch = next((b for b in full["batches"] if b["id"] == batch_id), None)
    batch_name = batch["batch_name"] if batch else f"Batch {batch_id}"
    run_name   = full["run_name"]

    excel_bytes = generate_batch_excel(items, run_name, batch_name)

    # ASCII-safe filename
    safe_name = f"{run_name} - {batch_name}.xlsx".encode("ascii", errors="replace").decode("ascii")

    from fastapi.responses import Response
    return Response(
        content=excel_bytes,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": f'attachment; filename="{safe_name}"'},
    )


@app.get("/production-runs/history")
def production_run_history():
    """Returns all past production runs."""
    return get_production_history()


# ── Notes endpoints ───────────────────────────────────────────────────────────

@app.patch("/production-runs/{run_id}/notes")
def update_run_notes(run_id: int, payload: dict):
    """Save notes for a production run."""
    notes = payload.get("notes", "")
    save_run_notes(run_id, notes)
    return {"message": "Notes saved."}


@app.patch("/production-runs/batch/{batch_id}/notes")
def update_batch_notes(batch_id: int, payload: dict):
    """Save office notes for a batch."""
    notes = payload.get("notes", "")
    save_batch_notes(batch_id, notes)
    return {"message": "Notes saved."}


@app.patch("/production-runs/batch/{batch_id}/warehouse-notes")
def update_warehouse_notes(batch_id: int, payload: dict):
    """Save warehouse notes for a batch — separate from office notes."""
    notes = payload.get("notes", "")
    save_warehouse_notes(batch_id, notes)
    return {"message": "Warehouse notes saved."}


# ── Warehouse endpoints ───────────────────────────────────────────────────────

@app.get("/warehouse/active")
def get_warehouse_active():
    """
    Returns the active production run with all batches and items.
    Used by the warehouse page.
    """
    run = get_active_batch_for_warehouse()
    if not run:
        return None
    return run


@app.post("/warehouse/batch/{batch_id}/save")
def warehouse_save_progress(batch_id: int, payload: dict):
    """
    Saves actual quantities, box numbers, and notes for a batch.
    Does not finalize — work can continue.
    payload: { items: [{id, actual_qty, box_number}], notes: str }
    """
    items = payload.get("items", [])
    notes = payload.get("notes", "")
    if not items:
        raise HTTPException(400, "No items provided.")
    save_warehouse_progress(batch_id, items, notes)
    return {"message": "Progress saved."}


@app.post("/warehouse/batch/{batch_id}/finalize")
def warehouse_finalize_batch(batch_id: int, payload: dict):
    """
    Finalizes a batch — saves actual quantities, box numbers, notes,
    generates receipt Excel, marks batch as finalized.
    Still editable after finalization.
    """
    items = payload.get("items", [])
    notes = payload.get("notes", "")
    if not items:
        raise HTTPException(400, "No items provided.")

    finalize_batch(batch_id, items, notes)

    # Generate receipt Excel
    from production import generate_batch_excel
    db_items = get_batch_items_for_download(batch_id)
    # Use actual_qty for the receipt
    for item in db_items:
        if item.get("actual_qty") is not None:
            item["quantity"] = item["actual_qty"]

    # Get run/batch names
    conn_tmp = __import__("database").get_connection()
    cur_tmp = conn_tmp.cursor()
    cur_tmp.execute("""
        SELECT pr.run_name, pb.batch_name
        FROM production_batches pb
        JOIN production_runs pr ON pb.run_id = pr.id
        WHERE pb.id = ?
    """, (batch_id,))
    row_tmp = cur_tmp.fetchone()
    conn_tmp.close()
    run_name   = row_tmp["run_name"]   if row_tmp else f"Run"
    batch_name = row_tmp["batch_name"] if row_tmp else f"Batch {batch_id}"

    excel_bytes = generate_batch_excel(db_items, run_name, batch_name)
    safe_name = f"{run_name} - {batch_name} - FINAL.xlsx".encode("ascii", errors="replace").decode("ascii")

    from fastapi.responses import Response
    return Response(
        content=excel_bytes,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": f'attachment; filename="{safe_name}"'},
    )


# ── Production history (full) ─────────────────────────────────────────────────

@app.get("/production-runs/batch/{batch_id}/box-detail")
def get_box_detail(batch_id: int):
    """
    Returns all items in a batch with box splits expanded.
    Used by the Details page shipment box popup.
    """
    rows = get_batch_box_detail(batch_id)
    if not rows:
        raise HTTPException(404, "No items found for this batch.")
    return rows


@app.get("/production-runs/history/full")
def production_run_history_full():
    """Returns all production runs with full batch details and notes."""
    return get_production_run_history_full()