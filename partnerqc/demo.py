"""Synthetic LIS stream that follows the glucose-HbA1c law. Contains no real patient data."""
import numpy as np
import pandas as pd


def make_demo(days=30, per_weekday=180, coverage=0.93, seed=7, start="2026-09-01"):
    rng = np.random.default_rng(seed)
    rows, sid = [], 100000
    sd_g, sd_a, r = 0.33, 0.21, 0.75
    for d in pd.date_range(start, periods=days, freq="D"):
        n = rng.poisson(per_weekday if d.dayofweek < 5 else per_weekday * 0.15)
        hours = np.sort(np.clip(rng.gamma(2.2, 1.1, n) + 5.5, 5, 22))
        for h in hours:
            lg = rng.normal(np.log(7.6), sd_g)
            la = np.log(7.1) + r * sd_a / sd_g * (lg - np.log(7.6)) + rng.normal(0, sd_a * np.sqrt(1 - r ** 2))
            g = np.exp(lg) if rng.random() < coverage else np.nan
            sid += 1
            rows.append({"sample_id": f"S{sid}", "time": (d + pd.Timedelta(hours=float(h))).strftime("%d/%m/%Y %H:%M"),
                         "hba1c_percent": round(float(np.exp(la)), 1),
                         "glucose_mmol_l": None if np.isnan(g) else round(float(g), 1)})
    return pd.DataFrame(rows)


if __name__ == "__main__":
    make_demo().to_csv("examples/demo_lis_export.csv", index=False)
