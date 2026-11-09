# PartnerQC

[![DOI](https://zenodo.org/badge/DOI/10.5281/zenodo.24076346.svg)](https://doi.org/10.5281/zenodo.24076346)

**Live app:** https://pbrtqcpartner.netlify.app · **Source:** https://github.com/lamkienthanh92/PBRTQCpartner · **Archive:** https://doi.org/10.5281/zenodo.24076346

**Check every HbA1c result against the glucose measured in the same sample.**

Internal quality control (IQC) for HbA1c runs only a few times a day, and an analyser error that starts between runs reaches patients. PartnerQC uses glucose, which is already measured in about 92–96% of HbA1c samples, as a built-in partner: when HbA1c drifts away from what glucose predicts, it raises an alarm long before the next control run.

- **Web app**: https://pbrtqcpartner.netlify.app, or open `docs/index.html` locally. Load an LIS export or the demo data; nothing leaves your browser.
- **Python package and service**: calibrate on your own data and connect the LIS through a small HTTP endpoint.

> Research software for laboratory quality management. It supports, and does not replace, IQC, external quality assessment and professional judgement. It is not a medical device.

## How it works

1. **Distribution law.** HbA1c quantiles follow a power law of glucose quantiles: `ln Q(HbA1c) = α + β ln Q(glucose)`. The exponent β was 0.65–0.69 in three Vietnamese hospitals, NHANES and two Vietnamese laboratory streams; the intercept α differs between populations.
2. **Partner spread.** For each sample, `s = ln(HbA1c) − β ln(glucose)`. Glucose removes 46–59% of the between-patient variation in HbA1c, so an analyser bias stands out 40–67% more clearly.
3. **Monitoring.** An exponentially weighted moving average (EWMA) of the standardised spread is compared with a limit set for your daily volume and an accepted false-alarm rate (default 0.1 per day).
4. **Attribution.** At an alarm, PartnerQC looks at the glucose and HbA1c streams separately and tells you which IQC to run first.
5. **Single-sample check.** A sample whose HbA1c is extreme for its glucose is flagged for review.
6. **QC plan.** From your IQC CV, allowable error and volume, PartnerQC estimates whether IQC can run once or twice a day with PartnerQC in between (rule: volume ≈ 59 × δ^−1.71 results per day, δ = critical bias ÷ SD of the monitored signal).

## Quick start

### Web app
Open `docs/index.html` in a browser, or use the hosted copy at https://pbrtqcpartner.netlify.app. It is one self-contained file and works offline. After editing `web/template.html`, run `python web/build.py` to rebuild it. Steps: Overview → Data → Distribution law → Calibrate → Monitor → IQC methods → Simulate an error → Check a result → QC plan.

The **IQC methods** tab needs no patient data. It puts the classic control-material techniques side by side on the same two-level IQC series (a generated demo series with an optional shift, drift or loss of precision, or your own pasted results): Levey-Jennings chart with Westgard rules (1:2s, 1:3s, 2:2s, R:4s, 4:1s, 10x), EWMA and CUSUM. A Monte Carlo table shows how many control runs each technique needs to detect shifts of 0.5 to 3 SD, and how often it raises a false alarm.

### Python
```bash
pip install -e .
partnerqc calibrate examples/demo_lis_export.csv --hba1c-col hba1c_percent --glucose-col glucose_mmol_l \
    --time-col time --id-col sample_id -o partnerqc_params.json
partnerqc check --params partnerqc_params.json --hba1c 7.2 --glucose 8.1
partnerqc serve --params partnerqc_params.json --port 8765      # POST /check for the LIS
```
See [docs/lis-integration.md](docs/lis-integration.md) and [docs/input-format.md](docs/input-format.md).

## Evidence so far

Retrospective data from 1,539 outpatients with type 2 diabetes (three Vietnamese hospitals), 14,220 NHANES adults, and LIS streams from Thong Nhat Hospital (3,660 HbA1c results) and Dai Phuoc Polyclinic (3,159 results), with simulated analyser errors:

- In the LIS streams, partner monitoring cut false alarms from 0.33 to 0.14 per day compared with HbA1c alone.
- IQC twice daily plus PartnerQC reported similar or fewer unacceptable results than IQC three times daily scheduled by shift, for shift, drift and imprecision errors, with one-third fewer IQC runs.

**Limitations:** retrospective data, assumed analytical imprecision, short LIS periods. Prospective validation with laboratory IQC records is the next step.

## Development stage

| Stage | Status |
|---|---|
| Method and distribution law | Derived on 1,539 Vietnamese outpatients and 14,220 NHANES adults |
| Technical testing | Done: simulations and two retrospective LIS streams with injected shift, drift and imprecision errors |
| Working prototype | This repository: offline web app, Python package, command-line tool and HTTP service for LIS/middleware |
| Prospective pilot | Next step: run alongside routine IQC in a partner laboratory, with local calibration of the intercept |

## Deployment

- **Web app**: `docs/` is a static site. `netlify.toml` publishes it on Netlify with no build step; GitHub Pages can serve the same folder.
- **Archiving**: Zenodo, DOI [10.5281/zenodo.24076346](https://doi.org/10.5281/zenodo.24076346) (all versions; version 1: [10.5281/zenodo.24076347](https://doi.org/10.5281/zenodo.24076347)).

## Repository layout

```
partnerqc/      Python package: law, calibration, monitor, LIS reader, CLI, HTTP service, demo data
web/            web app source (core.js shared with tests, template.html, build.py; vendor/, fonts/ and art/ are bundled so the page works offline)
docs/           built web app (index.html) and documentation
examples/       synthetic LIS export (no patient data)
tests/          Python tests; web/test_core.js for the JavaScript core
```

## Credits

Page illustrations: Servier Medical Art (CC BY 3.0) and DBCLS / Togo Picture Gallery (CC BY 4.0), via [Bioicons](https://bioicons.com); details in `web/art/README.md`. Typeface: Plus Jakarta Sans (SIL OFL 1.1). Charts: Chart.js (MIT). Spreadsheet reading: SheetJS Community Edition (Apache-2.0).

## Authors

- Nguyễn Thị Ngọc Mỹ — Faculty of Medical Technology, University of Medicine and Pharmacy at Ho Chi Minh City
- Nguyễn Minh Sơn — Faculty of Medical Technology, Van Lang University
- Phùng Hạnh Thảo — Faculty of Medicine, Pham Ngoc Thach University
- Lâm Kiến Thành (corresponding; [ORCID 0009-0003-5878-9278](https://orcid.org/0009-0003-5878-9278)) — Faculty of Medical Technology, Van Lang University; thanh.lk@vlu.edu.vn

Ho Chi Minh City, Viet Nam.

## Licence

MIT. See [LICENSE](LICENSE).

## How to cite

Nguyễn TNM, Nguyễn MS, Phùng HT, Lâm KT. PartnerQC: glucose as a built-in partner for patient-based quality control of HbA1c [software]. Zenodo; 2026. https://doi.org/10.5281/zenodo.24076346

See also [CITATION.cff](CITATION.cff).

---

**Tóm tắt tiếng Việt.** PartnerQC (phần mềm nguồn mở, giấy phép MIT) kiểm tra từng kết quả HbA1c với glucose đo trên cùng mẫu. Quy luật phân bố glucose–HbA1c có số mũ ổn định giữa các quần thể, nên chỉ cần hiệu chỉnh hệ số chặn tại chỗ. Khi HbA1c lệch khỏi mức glucose dự đoán, công cụ báo động trước lần chạy IQC kế tiếp. Ứng dụng web chạy hoàn toàn trên trình duyệt; gói Python cung cấp dịch vụ HTTP để tích hợp với LIS.
