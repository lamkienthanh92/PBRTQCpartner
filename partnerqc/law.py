"""Distribution law linking glucose and HbA1c."""
import numpy as np

#: Exponent of the glucose-HbA1c quantile law. Stable at 0.65-0.69 in three Vietnamese hospitals,
#: NHANES and two Vietnamese laboratory information system streams.
REFERENCE_BETA = 0.653
QUANTILES = np.arange(0.02, 0.981, 0.02)


def fit_law(hba1c, glucose_mmol):
    """Fit ln Q(HbA1c) = alpha + beta * ln Q(glucose) on paired results (HbA1c in %, glucose in mmol/L)."""
    la = np.log(np.asarray(hba1c, float))
    lg = np.log(np.asarray(glucose_mmol, float))
    ok = np.isfinite(la) & np.isfinite(lg)
    la, lg = la[ok], lg[ok]
    if len(la) < 50:
        raise ValueError("At least 50 paired HbA1c-glucose results are needed to fit the law.")
    qa, qg = np.quantile(la, QUANTILES), np.quantile(lg, QUANTILES)
    beta, alpha = np.polyfit(qg, qa, 1)
    return {"beta": float(beta), "alpha": float(alpha), "r": float(np.corrcoef(la, lg)[0, 1]), "n": int(len(la))}


def spread(hba1c, glucose_mmol, beta=REFERENCE_BETA):
    """Partner spread s = ln(HbA1c) - beta * ln(glucose)."""
    return np.log(np.asarray(hba1c, float)) - beta * np.log(np.asarray(glucose_mmol, float))
