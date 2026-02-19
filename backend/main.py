from fileinput import filename
from fastapi import FastAPI, UploadFile, File, HTTPException
import pandas as pd
import io
from fastapi.middleware.cors import CORSMiddleware
#from services.standarize import load_and_standardize_csv
from services.standarize import standardize_df, standardize_database,standardize_inventory
from fastapi.responses import StreamingResponse
from services.matching import build_master_dataset

app = FastAPI()

# Simple in-memory store (fine for local app / demo)---> can if be used?

DATA_STORE = {
    "restock": None,
    "warehouse": None,
    "inventory": None,
    "database": None,
}

app.add_middleware(
    CORSMiddleware, # Cross-origin resource sharing
    allow_origins=["http://localhost:5173"],
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/")
# GET / basically checks if backend is running
async def health_check():
    return {"status": "Backend running"}

def read_csv_or_excel(upload: UploadFile) -> pd.DataFrame:
    filename = (upload.filename or "").lower()
    content = upload.file.read()

    try:
        if filename.endswith(".csv"):
            # Try decoding bytes with common encodings first
            for enc in ("utf-8", "utf-8-sig", "cp1252", "latin1"):
                try:
                    text = content.decode(enc)
                    return pd.read_csv(io.StringIO(text))
                except UnicodeDecodeError:
                    continue

            # Last resort: decode with replacement so it never crashes
            text = content.decode("cp1252", errors="replace")
            return pd.read_csv(io.StringIO(text))

        elif filename.endswith(".xlsx") or filename.endswith(".xls"):
            return pd.read_excel(io.BytesIO(content))

        raise HTTPException(status_code=400, detail="Unsupported file type. Use .csv or .xlsx")

    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Failed to read file: {str(e)}")
                   
# POST / upload/ ect Accepts and validates file --> .post accepts http post requests
# this file should decide which columns are required, which files are allowed, and what happens when something is missing
# "when the frontend sends a POST request to /upload/restock, run this function"
@app.post("/upload/restock") 

async def upload_restock(file: UploadFile = File(...)):
    df = standardize_df(read_csv_or_excel(file))
    app.state.restock_df = df
    print("\nINVENTORY PREVIEW:")
    print(df.head(5))
    if "fnsku" not in df.columns:
        raise HTTPException(
            status_code=400,
            detail="Restock file must include  FNSKU columns" # CHECK LOGIC TO SEE WHAT IT SHOULD ACTUALLY BE LOOKING FOR!!!!!!!!!!
        )
    DATA_STORE["restock"] = df 

    return {
        "file": file.filename,
        "rows": len(df),
        "message": "Restock file uploaded successfully"
    }
@app.post("/upload/warehouse")

async def upload_warehouse(file: UploadFile = File(...)):
    df = standardize_df(read_csv_or_excel(file))
    print("\nINVENTORY PREVIEW:")
    print(df.head(5))
    if "sku" not in df.columns or "warehouse_location" not in df.columns: #MAYBE NOT CORRECT LOGIC
        raise HTTPException(
            status_code=400,
            detail="Warehouse file must include SKU and Warehouse Location columns"
        )
    DATA_STORE["warehouse"] = df
    return {
        "file": file.filename,
        "rows": len(df),                                           #Why are we returning this ?
        "message": "Warehouse file uploaded successfully"
    }
@app.post("/upload/inventory")

async def upload_inventory(file: UploadFile = File(...)):
    df = standardize_inventory(read_csv_or_excel(file))
    print("\nINVENTORY PREVIEW:")
    print(df.head(5))

    
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

    print("DATABASE COLUMNS:", list(df.columns))

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
    inventory_df = DATA_STORE["inventory"]  # optional

    # Require the minimum needed to build Master
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

    # Return as downloadable CSV
    buf = io.StringIO()
    master_df.to_csv(buf, index=False)
    buf.seek(0)

    return StreamingResponse(
        iter([buf.getvalue()]),
        media_type="text/csv",
        headers={"Content-Disposition": "attachment; filename=master_dataset.csv"},
    )

@app.get("/restock/low-stock")
def get_low_stock(limit: int = 200):
    df = getattr(app.state, "restock_df", None)

    if df is None:
        raise HTTPException(400, "Upload restock report first")

    # Example filter (adjust to your real column names)
    if "days_of_supply_alert" in df.columns:
        low = df[df["days_of_supply_alert"] == 1]
    elif "total_days_of_supply" in df.columns:
        low = df[df["total_days_of_supply"] < 30]
    else:
        low = df  # fallback so you can still demo

    # choose columns you want to display
    cols = [
        c for c in [
            "product_name",
            "fnsku",
            "merchant_sku",
            "asin",
            "available",
            "total_days_of_supply"
        ] if c in low.columns
    ]

    low = low[cols].head(limit)

    return low.to_dict(orient="records")




#function recieves the uploaded file, reads it, validates it, return a response
