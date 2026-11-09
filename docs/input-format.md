# Input format

PartnerQC needs one row per HbA1c result.

| Column | Required | Notes |
|---|---|---|
| HbA1c | yes | % (NGSP) or mmol/mol (IFCC). Values above 20 are treated as mmol/mol and converted. |
| Glucose from the same sample | yes, for checking | mmol/L or mg/dL. A median of 30 or more is treated as mg/dL. Leave empty when glucose was not requested. |
| Sample collection time | recommended | Needed for daily volume, IQC schedules and calibration periods. |
| Sample ID | optional | Shown in alarm lists. |

Glucose must come from the **same sample** (or the same draw) as the HbA1c. Pairing results from different patients does not work: the law describes the joint distribution within one population of patients.

## Dates

Day-first dates (`dd/mm/yyyy hh:mm`) are the default. Some Vietnamese LIS exports store dates as Excel dates that were read month-first whenever the day is 12 or less, while dates with a day above 12 stay as text. The web app detects this pattern and ticks *Swap day and month in cells stored as Excel dates*; the Python reader has `swap_excel_dates=True` for the same purpose.

## Privacy

The web app reads files in the browser and sends nothing to a server. Do not commit patient data to this repository. `examples/demo_lis_export.csv` is synthetic.
