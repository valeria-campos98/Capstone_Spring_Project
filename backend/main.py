from fileinput import filename
from fastapi import FastAPI, UploadFile, File, HTTPException
import pandas as pd
import io
from fastapi.middleware.cors import CORSMiddleware
from services.standarize import standardize_df, standardize_database, standardize_inventory
from fastapi.responses import StreamingResponse
from services.matching import build_master_dataset
from database import (
    init_db,
    log_upload,
    save_snapshot,
    is_duplicate_upload,
    is_stale_report,
    compute_file_hash,
    get_all_uploads,
    get_snapshot_by_upload,
    get_velocity_data,
    get_out_of_stock_duration,
    get_sales_trend,
    save_setting,
    get_setting,
)


app = FastAPI()


# ── Initialize database on startup ───────────────────────────────────────────
@app.on_event("startup")
def startup():
    init_db()

    # Load last saved restock snapshot into memory so dashboard works on refresh
    uploads = get_all_uploads()
    if uploads:
        latest_upload_id = uploads[0]["id"]  # newest first
        rows = get_snapshot_by_upload(latest_upload_id)
        if rows:
            df = pd.DataFrame(rows)
            app.state.restock_df = df
            print(f"✅ Loaded last restock snapshot ({len(df)} rows) into memory")


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


@app.get("/")
async def health_check():
    return {"status": "Backend running"}


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


@app.post("/upload/restock")
async def upload_restock(file: UploadFile = File(...)):
    df = standardize_df(read_csv_or_excel(file))

    if "fnsku" not in df.columns:
        raise HTTPException(
            status_code=400,
            detail="Restock file must include FNSKU columns"
        )

    # ── Stale report check ───────────────────────────────────────────────────
    if is_stale_report(df):
        raise HTTPException(
            status_code=400,
            detail="This report appears to be outdated (data is 90+ days old). Please upload a current restock report."
        )

    # Save to memory for dashboard
    app.state.restock_df = df
    DATA_STORE["restock"] = df

    # ── Save to database (skip if exact same data already saved) ─────────────
    file_hash = compute_file_hash(df)

    if not is_duplicate_upload(file_hash):
        upload_id = log_upload(file.filename, len(df), file_hash)
        save_snapshot(upload_id, df)
        print(f"\nRESTOCK uploaded: {file.filename} | {len(df)} rows | upload_id={upload_id}")
        db_message = "Restock file uploaded and saved successfully"
    else:
        upload_id = None
        print(f"\n⚠️ Duplicate skipped: {file.filename} — same data already in database")
        db_message = "File loaded into memory (duplicate — not saved to database)"

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
    return {
        "file": file.filename,
        "rows": len(df),
        "message": "Database file uploaded successfully"
    }


@app.post("/generate/master")
async def generate_master():
    restock_df = DATA_STORE["restock"]
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


# ── Upload History ────────────────────────────────────────────────────────────

@app.get("/uploads/history")
def upload_history():
    """Returns all past uploads — for the Details/History page."""
    return get_all_uploads()


# ── Velocity Tracking ─────────────────────────────────────────────────────────

@app.get("/analytics/velocity")
def velocity():
    """
    Compares units sold between the two most recent uploads.
    Returns trending up/down products.
    """
    data = get_velocity_data()
    if not data:
        return {"message": "Need at least 2 uploads to show velocity.", "data": []}
    return {"data": data}


# ── Out of Stock Duration ─────────────────────────────────────────────────────

@app.get("/analytics/oos-duration")
def oos_duration():
    """
    Returns SKUs that have been out of stock across consecutive uploads.
    """
    data = get_out_of_stock_duration()
    if not data:
        return {"message": "Need at least 2 uploads to track OOS duration.", "data": []}
    return {"data": data}


# ── Settings ──────────────────────────────────────────────────────────────────

@app.post("/settings/save")
def save_settings(payload: dict):
    """Save a setting. Body: { key: string, value: string }"""
    key = payload.get("key")
    value = payload.get("value")
    if not key:
        raise HTTPException(400, "key is required")
    save_setting(key, str(value))
    return {"message": f"Setting '{key}' saved"}


@app.get("/settings/{key}")
def get_settings(key: str):
    """Get a setting by key."""
    value = get_setting(key)
    if value is None:
        raise HTTPException(404, f"Setting '{key}' not found")
    return {"key": key, "value": value}


# ── Sales Trend (all time) ────────────────────────────────────────────────────

@app.get("/analytics/trend/{merchant_sku}")
def sales_trend(merchant_sku: str):
    """
    Returns units sold across ALL uploads for a specific SKU.
    Used to plot a trend line over time on the Details page.
    """
    data = get_sales_trend(merchant_sku)
    if not data:
        return {"message": "No historical data for this SKU yet.", "data": []}
    return {"merchant_sku": merchant_sku, "data": data}