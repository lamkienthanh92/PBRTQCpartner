"""Read laboratory information system (LIS) exports."""
import numpy as np
import pandas as pd

MGDL_PER_MMOL = 18.016


def _parse_time(col, dayfirst=True, swap_excel_dates=False):
    def one(v):
        if isinstance(v, str):
            return pd.to_datetime(v.strip(), dayfirst=dayfirst, errors="coerce")
        if hasattr(v, "year"):
            ts = pd.Timestamp(v)
            if swap_excel_dates and ts.day <= 12:
                try:
                    return pd.Timestamp(ts.year, ts.day, ts.month, ts.hour, ts.minute)
                except ValueError:
                    return pd.NaT
            return ts
        return pd.NaT
    return col.map(one)


def read_lis(path, hba1c_col, glucose_col, time_col=None, id_col=None, glucose_unit="auto",
             hba1c_unit="auto", dayfirst=True, swap_excel_dates=False, header=0):
    """Return a DataFrame with columns time, sample_id, hba1c (%), glucose_mmol (mmol/L).

    glucose_unit: 'mmol/L', 'mg/dL' or 'auto' (median of 30 or more is taken as mg/dL).
    hba1c_unit: '%', 'mmol/mol' or 'auto' (median above 20 is taken as IFCC mmol/mol).
    swap_excel_dates: some LIS exports store dd/mm dates as Excel dates that were read as mm/dd
    whenever the day is 12 or less.
    """
    p = str(path).lower()
    df = pd.read_excel(path, header=header) if p.endswith((".xlsx", ".xls")) else pd.read_csv(path, header=header)
    df.columns = [str(c).strip() for c in df.columns]
    a = pd.to_numeric(df[hba1c_col], errors="coerce")
    g = pd.to_numeric(df[glucose_col], errors="coerce")
    if hba1c_unit == "mmol/mol" or (hba1c_unit == "auto" and np.nanmedian(a) > 20):
        a = 0.09148 * a + 2.152
    if glucose_unit == "mg/dL" or (glucose_unit == "auto" and np.nanmedian(g) >= 30):
        g = g / MGDL_PER_MMOL
    out = pd.DataFrame({
        "time": _parse_time(df[time_col], dayfirst, swap_excel_dates) if time_col else pd.NaT,
        "sample_id": df[id_col].astype(str) if id_col else pd.Series(np.arange(len(df))).astype(str),
        "hba1c": a.where(a > 0),
        "glucose_mmol": g.where(g > 0),
    })
    out = out[out.hba1c.notna()]
    if time_col:
        out = out[out.time.notna()].sort_values("time", kind="stable")
    return out.reset_index(drop=True)
