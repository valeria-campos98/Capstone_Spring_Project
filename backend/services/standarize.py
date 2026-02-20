# renames columns, strip spaces, make keys consistent# backend/services/standardize.py
# standardize.py
import pandas as pd
from pathlib import Path

NA_TOKENS = ["none", "None", "NONE", "n/a", "N/A", "na", "NA", "","null"]

DATE_COLS = ["recommended ship date"]

def standardize_df(df: pd.DataFrame) -> pd.DataFrame:
    df = df.copy()

    # normalize column names
    df.columns = (df.columns.astype(str)
                  .str.strip()
                  .str.lower()
                  .str.replace(r"\s+", "_", regex=True) 
                .str.replace("\n", " ", regex=False))  # Excel sometimes has line breaks

    # strip text cols only
    text_cols = df.select_dtypes(include="object").columns
    df[text_cols] = df[text_cols].apply(lambda s: s.astype("string").str.strip())

    # whitespace-only -> NA
    df = df.replace(r"^\s*$", pd.NA, regex=True)

    # parse date cols
    for col in DATE_COLS:
        if col in df.columns:
            df[col] = pd.to_datetime(df[col], errors="coerce")

    return df


def standardize_database(df: pd.DataFrame) -> pd.DataFrame:
   
    df = standardize_df(df)

    # Seller SKU is the internal SKU
    if "seller_sku" in df.columns and "sku" not in df.columns:
        df = df.rename(columns={"seller_sku": "sku"})

    # normalize amazon sku naming
    if "amazon sku" in df.columns and "amazon_sku" not in df.columns:
        df = df.rename(columns={"amazon sku": "amazon_sku"})

    return df

def standardize_inventory(df: pd.DataFrame) -> pd.DataFrame:
   
    df = standardize_df(df)

    keep_cols = ["snapshot-date", "sku", "fnsku"]  
    
    
    if "snapshot_date" in df.columns and "snapshot-date" not in df.columns:
        df = df.rename(columns={"snapshot_date": "snapshot-date"})

    missing = [c for c in keep_cols if c not in df.columns]
    if missing:
        raise ValueError(f"Inventory report missing columns: {missing}. Found: {list(df.columns)}")

    
    return df[keep_cols].copy()
