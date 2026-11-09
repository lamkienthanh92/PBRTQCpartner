import numpy as np
from partnerqc import REFERENCE_BETA, calibrate, fit_law, PartnerMonitor
from partnerqc.demo import make_demo


def _paired():
    d = make_demo(days=20, seed=3).dropna()
    return d.hba1c_percent.values, d.glucose_mmol_l.values


def test_law_exponent_close_to_reference():
    a, g = _paired()
    assert abs(fit_law(a, g)["beta"] - REFERENCE_BETA) < 0.08


def test_bias_triggers_alarm_and_stable_stream_is_quiet():
    a, g = _paired()
    cal = calibrate(a, g, results_per_day=150, false_alarms_per_day=0.10)
    m = PartnerMonitor(cal)
    stable = [m.check(x, y)["status"] for x, y in zip(a, g)]
    assert stable.count("alarm") / (len(a) / 150) < 0.6        # roughly <=0.1-0.5 alarms per day in-sample
    m = PartnerMonitor(cal)
    biased = [m.check(x * 1.06, y)["status"] for x, y in zip(a[:800], g[:800])]
    assert "alarm" in biased[:400]
