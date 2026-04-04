# Soak Monitor Analysis

Input CSV: ./SOAK_MONITOR_REPORT-20260403-210320.csv
Rows: 686
Duration (minutes): 59.92

| Metric | Value |
|---|---|
| Peak RAM (GB) | 10.1 |
| Average RAM (GB) | 8.4 |
| Sidecar health up (%) | 100 |
| Unreal detected (%) | 0 |

| Gate | Verdict | Rule |
|---|---|---|
| RAM never exceeds 14GB during normal use | PASS | peak RAM <= 14GB |
| Validate stability on 1-hour continuous session | SKIP | soak duration >= 60 minutes |

## Notes
- Run longer soak: 59.92 min observed, 60 min required.
