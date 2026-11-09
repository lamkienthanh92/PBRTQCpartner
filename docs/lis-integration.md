# Connecting PartnerQC to a laboratory information system

PartnerQC checks each HbA1c result against the glucose from the same sample **before the LIS releases it**.

```
HbA1c result ready in LIS/middleware
        │  POST /check {sample_id, hba1c, glucose, glucose_unit}
        ▼
PartnerQC service (partnerqc serve)
        │  {status, message, sample_discordant}
        ▼
status = ok / watch / no_partner  → release as usual
status = alarm                    → hold HbA1c results, check today's glucose IQC,
                                    then run HbA1c IQC; release only if IQC passes
sample_discordant = true          → review this sample (identity, haemoglobin variant,
                                    interference, non-fasting glucose)
```

## Steps

1. **Calibrate** on 2–4 weeks of results from a period when IQC was in control:
   ```bash
   partnerqc calibrate export.xlsx --hba1c-col "HbA1c" --glucose-col "Glucose" \
       --time-col "Collected" --id-col "SampleID" -o partnerqc_params.json
   ```
   or use *Calibrate* in the web app and download the JSON.
2. **Run the service** on a machine the LIS can reach:
   ```bash
   partnerqc serve --params partnerqc_params.json --state partnerqc_state.json --port 8765
   ```
3. **Call it** for each HbA1c result. Most middleware supports an HTTP rule or a script step; `partnerqc check` is available for script-based integration and exits with code 2 on an alarm.

## Rules that keep the monitor honest

- Run **one service per analyser pair**. Mixing results from two HbA1c or two glucose analysers creates alarms that reflect the instruments' difference.
- **Recalibrate** after reagent lot changes, calibrations or maintenance, but only after IQC confirms the system is in control. Re-centring blindly would hide slow drifts.
- When an alarm fires, **check glucose IQC first**: a glucose error moves the spread as well. If glucose IQC passed, suspect the HbA1c analyser.
- PartnerQC detects systematic errors. **Imprecision still needs IQC runs.**
