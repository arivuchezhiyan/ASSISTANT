# Soak Monitor Analysis

Input CSV: ./SOAK_MONITOR_REPORT-20260403-210938.csv
Rows: 53
Duration (minutes): 1.97

| Metric | Value |
|---|---|
| Peak RAM (GB) | 9.27 |
| Average RAM (GB) | 9.09 |
| Sidecar health up (%) | 100 |
| Unreal detected (%) | 0 |

| Gate | Verdict | Rule |
|---|---|---|
| RAM never exceeds 14GB during normal use | PASS | peak RAM <= 14GB |
| Validate stability on 1-hour continuous session | SKIP | soak duration >= 60 minutes |

## Notes
- Run longer soak: 1.97 min observed, 60 min required.
