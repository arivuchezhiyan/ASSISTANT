# Soak Monitor Analysis

Input CSV: ./SOAK_MONITOR_REPORT_SAMPLE.csv
Rows: 19
Duration (minutes): 1

| Metric | Value |
|---|---|
| Peak RAM (GB) | 11.93 |
| Average RAM (GB) | 11.86 |
| Sidecar health up (%) | 0 |
| Unreal detected (%) | 0 |

| Gate | Verdict | Rule |
|---|---|---|
| RAM never exceeds 14GB during normal use | PASS | peak RAM <= 14GB |
| Validate stability on 1-hour continuous session | SKIP | soak duration >= 60 minutes |

## Notes
- Run longer soak: 1 min observed, 60 min required.
- Sidecar health was below 95% of samples (0%).
