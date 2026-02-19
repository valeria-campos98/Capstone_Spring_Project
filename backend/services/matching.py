# joins/merges dataframes using SKU/FNSKU

#A dataframe created by joining standardized datasets on shared identifiers (SKU / FNSKU).

import pandas as pd

def build_master_dataset(
    restock_df: pd.DataFrame,
    database_df: pd.DataFrame,
    warehouse_df: pd.DataFrame,
    inventory_df: pd.DataFrame | None = None, # okay if not provided (optional)
) -> pd.DataFrame: #takes in multiple dataframes and returns single dataframe
    
    for name, df, required in [
        ("restock", restock_df, {"fnsku"}),
        ("database", database_df, {"fnsku", "sku"}),
        ("warehouse", warehouse_df, {"sku", "warehouse_location"}),
    ]:
        missing = required - set(df.columns)
        if missing:
            
            raise ValueError(f"{name} missing columns: {sorted(missing)}. Found: {list(df.columns)}")
    # 1) Restock ↔ Database (FNSKU is the strongest key)
    master = restock_df.merge(
        database_df,
        on="fnsku", # column or index level names to join on. THese must be found in both data framws
        how="left",
        suffixes=("_restock", "_db"),
    )

    # 2) Master ↔ Warehouse Location (internal SKU)
    master = master.merge(
        warehouse_df,
        on="sku",
        how="left",
    )

    # 3) Optional: add Inventory info (if provided)
    if inventory_df is not None:
        inv_cols = [c for c in ["fnsku", "snapshot_date", "sku"] if c in inventory_df.columns]
        master = master.merge(
            inventory_df[inv_cols].drop_duplicates(subset=["fnsku"]),
            on="fnsku",
            how="left",
            suffixes=("", "_inv"),
        )

    return master
