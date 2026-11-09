"""PartnerQC: check HbA1c results against the glucose measured in the same sample.

Glucose and HbA1c distributions are linked by a power law, ln Q(HbA1c) = alpha + beta * ln Q(glucose),
with a stable exponent (beta about 0.65) across populations. The partner spread
s = ln(HbA1c) - beta * ln(glucose) removes much of the between-patient variation, so an
exponentially weighted moving average (EWMA) of s detects HbA1c analyser bias faster than
monitoring HbA1c alone.
"""
from .law import REFERENCE_BETA, fit_law, spread
from .monitor import Calibration, PartnerMonitor, calibrate, replay
from .io import read_lis

__all__ = ["REFERENCE_BETA", "fit_law", "spread", "Calibration", "PartnerMonitor", "calibrate", "replay", "read_lis"]
__version__ = "0.1.0"
