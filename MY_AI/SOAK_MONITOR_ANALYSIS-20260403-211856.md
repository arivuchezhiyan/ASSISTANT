# Soak Monitor Analysis

Input CSV: ./SOAK_MONITOR_REPORT-20260403-211856.csv
Rows: 658
Duration (minutes): 59.98

| Metric | Value |
|---|---|
| Peak RAM (GB) | 9.25 |
| Average RAM (GB) | 8.34 |
| Sidecar health up (%) | 77.51 |
| Unreal detected (%) | 0 |

| Gate | Verdict | Rule |
|---|---|---|
| RAM never exceeds 14GB during normal use | PASS | peak RAM <= 14GB |
| Validate stability on 1-hour continuous session | SKIP | soak duration >= 60 minutes |

## Notes
- Run longer soak: 59.98 min observed, 60 min required.
- Sidecar health was below 95% of samples (77.51%).
