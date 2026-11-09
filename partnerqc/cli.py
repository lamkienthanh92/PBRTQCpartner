"""Command line: partnerqc calibrate | replay | check | serve."""
import argparse, json, sys
import numpy as np
import pandas as pd
from .io import read_lis
from .monitor import Calibration, PartnerMonitor, calibrate, replay


def _read(a):
    return read_lis(a.input, a.hba1c_col, a.glucose_col, a.time_col, a.id_col, a.glucose_unit, a.hba1c_unit,
                    dayfirst=not a.monthfirst, swap_excel_dates=a.swap_excel_dates)


def _io_args(p):
    p.add_argument("input", help="LIS export (.csv or .xlsx)")
    p.add_argument("--hba1c-col", required=True); p.add_argument("--glucose-col", required=True)
    p.add_argument("--time-col"); p.add_argument("--id-col")
    p.add_argument("--glucose-unit", default="auto", choices=["auto", "mmol/L", "mg/dL"])
    p.add_argument("--hba1c-unit", default="auto", choices=["auto", "%", "mmol/mol"])
    p.add_argument("--monthfirst", action="store_true", help="dates are mm/dd (default dd/mm)")
    p.add_argument("--swap-excel-dates", action="store_true", help="fix dd/mm dates stored as mm/dd Excel dates")


def main(argv=None):
    ap = argparse.ArgumentParser(prog="partnerqc", description="Check HbA1c results against same-sample glucose.")
    sub = ap.add_subparsers(dest="cmd", required=True)
    c = sub.add_parser("calibrate", help="build local parameters from 2-4 weeks of in-control data"); _io_args(c)
    c.add_argument("-o", "--out", default="partnerqc_params.json")
    c.add_argument("--false-alarms-per-day", type=float, default=0.10)
    c.add_argument("--lam", type=float, default=0.02)
    c.add_argument("--local-beta", action="store_true", help="use the locally fitted exponent instead of 0.653")
    r = sub.add_parser("replay", help="run the monitor over an export and write one row per result"); _io_args(r)
    r.add_argument("--params", required=True); r.add_argument("-o", "--out", default="partnerqc_replay.csv")
    k = sub.add_parser("check", help="check one result (for LIS or middleware scripts)")
    k.add_argument("--params", required=True); k.add_argument("--state", default="partnerqc_state.json")
    k.add_argument("--hba1c", type=float, required=True); k.add_argument("--glucose", type=float)
    k.add_argument("--glucose-unit", default="mmol/L", choices=["mmol/L", "mg/dL"])
    k.add_argument("--sample-id"); k.add_argument("--time")
    s = sub.add_parser("serve", help="HTTP endpoint POST /check for LIS integration")
    s.add_argument("--params", required=True); s.add_argument("--state", default="partnerqc_state.json")
    s.add_argument("--host", default="127.0.0.1"); s.add_argument("--port", type=int, default=8765)
    a = ap.parse_args(argv)

    if a.cmd == "calibrate":
        df = _read(a); p = df.dropna(subset=["glucose_mmol"])
        if df.time.notna().any():
            days = (df.time.max().normalize() - df.time.min().normalize()).days + 1
            per_day = df.groupby(df.time.dt.date).size(); wd = per_day[pd.to_datetime(per_day.index).dayofweek < 5]
            rpd = float(wd.mean() if len(wd) else per_day.mean()) * len(p) / len(df)
        else:
            rpd = 100.0
        cal = calibrate(p.hba1c.values, p.glucose_mmol.values, rpd, a.false_alarms_per_day, a.lam,
                        "local" if a.local_beta else None)
        cal.to_json(a.out)
        print(json.dumps({"saved": a.out, "beta_used": cal.beta, "local_beta": round(cal.local_beta, 3), "r": round(cal.r, 3),
                          "paired_results": cal.n_baseline, "paired_results_per_weekday": round(rpd, 1),
                          "glucose_coverage": round(len(p) / len(df), 3)}, indent=2))
    elif a.cmd == "replay":
        cal = Calibration.from_json(a.params); out = pd.DataFrame(replay(_read(a), cal)); out.to_csv(a.out, index=False)
        print(out.status.value_counts().to_string()); print(f"saved {a.out}")
    elif a.cmd == "check":
        m = PartnerMonitor.load(a.params, a.state)
        g = a.glucose / 18.016 if (a.glucose is not None and a.glucose_unit == "mg/dL") else a.glucose
        res = m.check(a.hba1c, g, a.sample_id, a.time); m.save_state(a.state); print(json.dumps(res, indent=2))
        sys.exit(2 if res["status"] == "alarm" else 0)
    elif a.cmd == "serve":
        from .server import serve
        serve(a.params, a.state, a.host, a.port)


if __name__ == "__main__":
    main()
