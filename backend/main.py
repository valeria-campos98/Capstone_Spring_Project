from fileinput import filename
from fastapi import FastAPI, UploadFile, File, HTTPException
import pandas as pd
import io
from fastapi.middleware.cors import CORSMiddleware

app = FastAPI()

app.add_middleware(
    CORSMiddleware, # Cross-origin resource sharing
    allow_origins=["http://localhost:5175"],
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
    df = read_csv_or_excel(file)

    if "SKU" not in df.columns or "FNSKU" not in df.columns:
        raise HTTPException(
            status_code=400,
            detail="Restock file must include SKU and FNSKU columns" # CHECK LOGIC TO SEE WHAT IT SHOULD ACTUALLY BE LOOKING FOR!!!!!!!!!!
        )

    return {
        "file": file.filename,
        "rows": len(df),
        "message": "Restock file uploaded successfully"
    }
@app.post("/upload/warehouse")

async def upload_warehouse(file: UploadFile = File(...)):
    df = read_csv_or_excel(file)

    if "SKU" not in df.columns or "Warehouse Location" not in df.columns:
        raise HTTPException(
            status_code=400,
            detail="Warehouse file must include SKU and Warehouse Location columns"
        )

    return {
        "file": file.filename,
        "rows": len(df),                                           #Why are we returning this ?
        "message": "Warehouse file uploaded successfully"
    }
@app.post("/upload/inventory")

async def upload_inventory(file: UploadFile = File(...)):
    df = read_csv_or_excel(file)

    if "SKU" not in df.columns and "FNSKU" not in df.columns:
        raise HTTPException(
            status_code=400,
            detail="Inventory file must include SKU or FNSKU"
        )

    return {
        "file": file.filename,
        "rows": len(df),
        "message": "Inventory file uploaded successfully"
    }

@app.post("/upload/database")

async def upload_database(file: UploadFile = File(...)):
    df = read_csv_or_excel(file)

    if "SKU" not in df.columns:
        raise HTTPException(
            status_code=400,
            detail="Database file must include SKU column"
        )

    return {
        "file": file.filename,
        "rows": len(df),
        "message": "Database file uploaded successfully"
    }


#function recieves the uploaded file, reads it, validates it, return a response
