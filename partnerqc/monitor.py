"""Calibration and monitoring of the glucose-partnered spread."""
import json
from dataclasses import dataclass, asdict
import numpy as np
from .law import REFERENCE_BETA, fit_law


@dataclass
class Calibration:
    beta: float                 # exponent used for the spread
    center: float               # mean of the clipped spread at baseline (local intercept)
    sd: float                   # SD of the clipped spread at baseline
    lo: float                   # 0.5th percentile of the spread (clip limit and single-sample flag)
    hi: float                   # 99.5th percentile
    lam: float                  # EWMA weight
    h: float                    # EWMA control limit, in spread-z units
    results_per_day: float      # paired HbA1c-glucose results per day
    false_alarms_per_day: float # target in-control alarm rate
    local_beta: float
    r: float
    n_baseline: int

    def to_json(self, path):
        with open(path, "w") as f:
            json.dump(asdict(self), f, indent=2)

    @classmethod
    def from_json(cls, path):
        with open(path) as f:
            return cls(**json.load(f))


def _limit_for_arl(z, lam, target_arl, steps=200_000, seed=1):
    """EWMA limit giving an in-control average run length of target_arl (bootstrap of baseline z)."""
    rng = np.random.default_rng(seed)
    sd_e = np.sqrt(lam / (2 - lam))
    H = np.geomspace(0.5, 6.0, 120) * sd_e
    steps = int(max(steps, 40 * target_arl))
    zz = z[rng.integers(0, len(z), steps)]
    e = np.zeros(len(H)); alarms = np.zeros(len(H))
    for v in zz:
        e = (1 - lam) * e + lam * v
        hit = np.abs(e) > H
        if hit.any():
            alarms += hit
            e[hit] = 0.0
    arl = steps / np.maximum(alarms, 1)
    j = int(np.clip(np.searchsorted(arl, target_arl), 1, len(H) - 1))
    f = (np.log(target_arl) - np.log(arl[j - 1])) / (np.log(arl[j]) - np.log(arl[j - 1]) + 1e-12)
    return float(H[j - 1] + f * (H[j] - H[j - 1]))


def calibrate(hba1c, glucose_mmol, results_per_day, false_alarms_per_day=0.10, lam=0.02, beta=None, seed=1):
    """Anchor the spread locally and set the EWMA limit for the target false-alarm rate.

    Use 2-4 weeks of paired results from a period when IQC was in control.
    beta=None uses the reference exponent (0.653); beta='local' uses the locally fitted exponent.
    """
    hba1c = np.asarray(hba1c, float); glucose_mmol = np.asarray(glucose_mmol, float)
    ok = np.isfinite(hba1c) & np.isfinite(glucose_mmol) & (hba1c > 0) & (glucose_mmol > 0)
    hba1c, glucose_mmol = hba1c[ok], glucose_mmol[ok]
    law = fit_law(hba1c, glucose_mmol)
    b = law["beta"] if beta == "local" else (REFERENCE_BETA if beta is None else float(beta))
    s = np.log(hba1c) - b * np.log(glucose_mmol)
    lo, hi = np.quantile(s, [0.005, 0.995])
    c = np.clip(s, lo, hi)
    center, sd = float(c.mean()), float(c.std())
    h = _limit_for_arl((c - center) / sd, lam, results_per_day / false_alarms_per_day, seed=seed)
    return Calibration(b, center, sd, float(lo), float(hi), lam, h, float(results_per_day),
                       float(false_alarms_per_day), law["beta"], law["r"], int(len(s)))


class PartnerMonitor:
    """Stateful monitor. Call check() for every HbA1c result before the LIS releases it."""

    def __init__(self, cal: Calibration, ewma: float = 0.0):
        self.cal, self.ewma = cal, float(ewma)

    def check(self, hba1c, glucose_mmol=None, sample_id=None, time=None):
        c = self.cal
        if glucose_mmol is None or not np.isfinite(glucose_mmol) or glucose_mmol <= 0:
            return {"sample_id": sample_id, "time": time, "status": "no_partner",
                    "message": "No glucose in this sample, so PartnerQC did not check it."}
        s = float(np.log(hba1c) - c.beta * np.log(glucose_mmol))
        discordant = s < c.lo or s > c.hi
        z = (min(max(s, c.lo), c.hi) - c.center) / c.sd
        self.ewma = (1 - c.lam) * self.ewma + c.lam * z
        level = abs(self.ewma) / c.h
        direction = "higher" if self.ewma > 0 else "lower"
        if level > 1:
            status = "alarm"
            msg = (f"HbA1c is running {direction} than glucose predicts. Check today's glucose IQC; "
                   "if it passed, run HbA1c IQC before releasing further HbA1c results.")
            self.ewma = 0.0
        elif level > 0.6:
            status, msg = "watch", f"HbA1c is drifting {direction} relative to glucose. Keep watching."
        else:
            status, msg = "ok", "Consistent with glucose."
        out = {"sample_id": sample_id, "time": time, "status": status, "z": round(z, 3),
               "fraction_of_limit": round(level, 3), "message": msg, "sample_discordant": bool(discordant)}
        if discordant:
            out["sample_message"] = ("This sample's HbA1c is unusual for its glucose. Consider sample identity, "
                                     "haemoglobin variants or interference, recent glycaemic change or a non-fasting glucose.")
        return out

    def save_state(self, path):
        with open(path, "w") as f:
            json.dump({"ewma": self.ewma}, f)

    @classmethod
    def load(cls, cal_path, state_path=None):
        cal = Calibration.from_json(cal_path); ewma = 0.0
        if state_path:
            try:
                with open(state_path) as f:
                    ewma = json.load(f).get("ewma", 0.0)
            except FileNotFoundError:
                pass
        return cls(cal, ewma)


def replay(df, cal: Calibration):
    """Run the monitor over a DataFrame (time, sample_id, hba1c, glucose_mmol); one dict per result."""
    m = PartnerMonitor(cal); rows = []
    for r in df.itertuples():
        g = getattr(r, "glucose_mmol", np.nan)
        rows.append(m.check(r.hba1c, None if not np.isfinite(g) else g, getattr(r, "sample_id", None),
                            str(getattr(r, "time", ""))))
    return rows
