# renames columns, strip spaces, make keys consistent# backend/services/standardize.py
import pandas as pd


#want to normalize column names
def normalize_columns(df):
    df = df.copy()  # Review why, but it might be because of memory
    df.columns = (
        df.columns
        .astype(str) #????
        .str.strip()
        .str.lower()
        .str.replace(" ", "_") # why do we do underscore?
    )
    return df