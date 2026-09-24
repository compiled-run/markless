# Interaction benchmark run 2026-09-22T22-58-05-717Z-ed4fb6

Started 2026-09-22T22:58:05.718Z; finished 2026-09-22T23:05:21.410Z. Playwright 1.58.2. Browsers: chromium 145.0.7632.6, webkit 26.0.
Visits per cell: 5 (warmup 0, excluded). Order alternates (rotates) across targets per visit index.

`inputToResponseMs` is a presentation estimate (rAF then next rAF after the DOM assertion holds), not a paint timestamp. `inputToDomMs` is the DOM diagnostic. Failed visits are counted, never folded into the distributions.

| entrant | browser | profile | case | phase | ok/visits | failures | inputToResponse median | p95 | IQR | stddev | inputToDom median | navToResponse median | JS KB (compressed) | initial req |
| --- | --- | --- | --- | --- | --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| markless (selftest-fixture) | chromium | normal | overview-counter-first | early | 5/5 | 0 | 23.3 | 23.8 | 0.8 | 1.5 | 0.6 | 40.9 | 0.0 | 2 |
| markless (selftest-fixture) | chromium | normal | overview-counter-first | settled | 5/5 | 0 | 24.6 | 26.0 | 0.8 | 0.8 | 0.6 | - | 0.0 | 2 |
| markless (selftest-fixture) | chromium | normal | overview-counter-repeat-x10 | early | 5/5 | 0 | 29.5 | 36.4 | 10.9 | 6.0 | 20.0 | 48.9 | 0.0 | 2 |
| markless (selftest-fixture) | chromium | normal | overview-counter-repeat-x10 | settled | 5/5 | 0 | 25.0 | 25.6 | 0.9 | 0.8 | 3.0 | - | 0.0 | 2 |
| markless (selftest-fixture) | chromium | normal | overview-toggle | early | 5/5 | 0 | 11.5 | 14.7 | 0.4 | 1.9 | 0.7 | 27.7 | 0.0 | 2 |
| markless (selftest-fixture) | chromium | normal | overview-toggle | settled | 5/5 | 0 | 16.2 | 17.2 | 1.7 | 1.3 | 0.7 | - | 0.0 | 2 |
| markless (selftest-fixture) | chromium | normal | overview-filter | early | 5/5 | 0 | 21.2 | 23.0 | 3.9 | 2.5 | 0.4 | 42.5 | 0.0 | 2 |
| markless (selftest-fixture) | chromium | normal | overview-filter | settled | 5/5 | 0 | 22.8 | 23.5 | 0.9 | 0.7 | 0.3 | - | 0.0 | 2 |
| markless (selftest-fixture) | chromium | normal | records-select | early | 5/5 | 0 | 22.0 | 23.0 | 1.1 | 1.7 | 0.7 | 40.5 | 0.0 | 2 |
| markless (selftest-fixture) | chromium | normal | records-select | settled | 5/5 | 0 | 24.4 | 25.6 | 1.5 | 1.1 | 0.7 | - | 0.0 | 2 |
| markless (selftest-fixture) | chromium | normal | nav-overview-to-records | early | 5/5 | 0 | 23.2 | 24.3 | 1.5 | 1.6 | 3.0 | 41.5 | 0.0 | 2 |
| markless (selftest-fixture) | chromium | normal | nav-overview-to-records | settled | 5/5 | 0 | 24.4 | 25.9 | 1.2 | 1.0 | 3.2 | - | 0.0 | 2 |
| markless (selftest-fixture) | chromium | normal | history-back | settled | 5/5 | 0 | 11.1 | 13.1 | 0.6 | 1.3 | 2.1 | - | 0.0 | 2 |
| markless (selftest-fixture) | chromium | normal | settings-derived | early | 5/5 | 0 | 21.0 | 23.1 | 1.5 | 1.4 | 0.2 | 40.6 | 0.0 | 2 |
| markless (selftest-fixture) | chromium | normal | settings-derived | settled | 5/5 | 0 | 21.2 | 22.0 | 0.7 | 0.6 | 0.2 | - | 0.0 | 2 |
| markless (selftest-fixture) | chromium | normal | settings-submit | settled | 5/5 | 0 | 315.2 | 315.6 | 0.1 | 0.6 | 304.6 | - | 0.0 | 2 |
| markless (selftest-fixture) | chromium | rtt150-down5mbps-up1mbps+4x-slowdown | overview-counter-first | early | 5/5 | 0 | 26.3 | 27.0 | 1.0 | 1.1 | 2.4 | 241.0 | 0.0 | 2 |
| markless (selftest-fixture) | chromium | rtt150-down5mbps-up1mbps+4x-slowdown | overview-counter-first | settled | 5/5 | 0 | 27.0 | 27.4 | 1.2 | 1.0 | 2.2 | - | 0.0 | 2 |
| markless (selftest-fixture) | chromium | rtt150-down5mbps-up1mbps+4x-slowdown | overview-counter-repeat-x10 | early | 5/5 | 0 | 46.6 | 47.7 | 2.2 | 2.8 | 34.4 | 262.5 | 0.0 | 2 |
| markless (selftest-fixture) | chromium | rtt150-down5mbps-up1mbps+4x-slowdown | overview-counter-repeat-x10 | settled | 5/5 | 0 | 45.8 | 48.0 | 0.7 | 2.8 | 32.6 | - | 0.0 | 2 |
| markless (selftest-fixture) | chromium | rtt150-down5mbps-up1mbps+4x-slowdown | overview-toggle | early | 5/5 | 0 | 16.0 | 17.9 | 3.8 | 3.1 | 2.9 | 228.7 | 0.0 | 2 |
| markless (selftest-fixture) | chromium | rtt150-down5mbps-up1mbps+4x-slowdown | overview-toggle | settled | 5/5 | 0 | 12.7 | 16.9 | 1.7 | 2.6 | 2.2 | - | 0.0 | 2 |
| markless (selftest-fixture) | chromium | rtt150-down5mbps-up1mbps+4x-slowdown | overview-filter | early | 5/5 | 0 | 22.6 | 25.9 | 1.0 | 2.1 | 1.4 | 245.8 | 0.0 | 2 |
| markless (selftest-fixture) | chromium | rtt150-down5mbps-up1mbps+4x-slowdown | overview-filter | settled | 5/5 | 0 | 22.3 | 25.8 | 3.0 | 1.8 | 1.3 | - | 0.0 | 2 |
| markless (selftest-fixture) | chromium | rtt150-down5mbps-up1mbps+4x-slowdown | records-select | early | 5/5 | 0 | 25.9 | 26.5 | 2.4 | 1.3 | 3.2 | 244.6 | 0.0 | 2 |
| markless (selftest-fixture) | chromium | rtt150-down5mbps-up1mbps+4x-slowdown | records-select | settled | 5/5 | 0 | 28.0 | 29.3 | 1.3 | 1.0 | 3.6 | - | 0.0 | 2 |
| markless (selftest-fixture) | chromium | rtt150-down5mbps-up1mbps+4x-slowdown | nav-overview-to-records | early | 5/5 | 0 | 42.5 | 46.1 | 3.4 | 2.9 | 14.6 | 266.9 | 0.0 | 2 |
| markless (selftest-fixture) | chromium | rtt150-down5mbps-up1mbps+4x-slowdown | nav-overview-to-records | settled | 5/5 | 0 | 38.5 | 38.9 | 0.8 | 0.5 | 12.8 | - | 0.0 | 2 |
| markless (selftest-fixture) | chromium | rtt150-down5mbps-up1mbps+4x-slowdown | history-back | settled | 5/5 | 0 | 14.2 | 15.1 | 1.1 | 0.7 | 9.4 | - | 0.0 | 2 |
| markless (selftest-fixture) | chromium | rtt150-down5mbps-up1mbps+4x-slowdown | settings-derived | early | 5/5 | 0 | 26.3 | 31.3 | 4.3 | 4.1 | 1.2 | 246.2 | 0.0 | 2 |
| markless (selftest-fixture) | chromium | rtt150-down5mbps-up1mbps+4x-slowdown | settings-derived | settled | 5/5 | 0 | 26.6 | 32.5 | 3.8 | 3.1 | 1.6 | - | 0.0 | 2 |
| markless (selftest-fixture) | chromium | rtt150-down5mbps-up1mbps+4x-slowdown | settings-submit | settled | 5/5 | 0 | 329.3 | 337.2 | 9.0 | 7.4 | 315.9 | - | 0.0 | 2 |
| markless (selftest-fixture) | webkit | normal | overview-counter-first | early | 5/5 | 0 | 29.0 | 30.6 | 0.0 | 4.3 | 0.0 | 60.0 | 0.1 | 2 |
| markless (selftest-fixture) | webkit | normal | overview-counter-first | settled | 5/5 | 0 | 26.0 | 27.0 | 2.0 | 2.1 | 1.0 | - | 0.1 | 2 |
| markless (selftest-fixture) | webkit | normal | overview-counter-repeat-x10 | early | 5/5 | 0 | 30.0 | 31.0 | 1.0 | 0.5 | 8.0 | 59.0 | 0.1 | 2 |
| markless (selftest-fixture) | webkit | normal | overview-counter-repeat-x10 | settled | 5/5 | 0 | 37.0 | 39.8 | 11.0 | 6.5 | 8.0 | - | 0.1 | 2 |
| markless (selftest-fixture) | webkit | normal | overview-toggle | early | 5/5 | 0 | 30.0 | 32.6 | 10.0 | 6.0 | 2.0 | 46.0 | 0.1 | 2 |
| markless (selftest-fixture) | webkit | normal | overview-toggle | settled | 5/5 | 0 | 29.0 | 32.6 | 3.0 | 2.2 | 2.0 | - | 0.1 | 2 |
| markless (selftest-fixture) | webkit | normal | overview-filter | early | 5/5 | 0 | 29.0 | 29.8 | 2.0 | 4.1 | 1.0 | 50.0 | 0.1 | 2 |
| markless (selftest-fixture) | webkit | normal | overview-filter | settled | 5/5 | 0 | 25.0 | 33.0 | 10.0 | 7.0 | 1.0 | - | 0.1 | 2 |
| markless (selftest-fixture) | webkit | normal | records-select | early | 5/5 | 0 | 27.0 | 29.6 | 2.0 | 1.9 | 0.0 | 50.0 | 0.1 | 2 |
| markless (selftest-fixture) | webkit | normal | records-select | settled | 5/5 | 0 | 24.0 | 28.0 | 5.0 | 3.4 | 1.0 | - | 0.1 | 2 |
| markless (selftest-fixture) | webkit | normal | nav-overview-to-records | early | 5/5 | 0 | 30.0 | 31.0 | 2.0 | 1.3 | 5.0 | 60.0 | 0.1 | 2 |
| markless (selftest-fixture) | webkit | normal | nav-overview-to-records | settled | 5/5 | 0 | 27.0 | 27.8 | 0.0 | 1.9 | 4.0 | - | 0.1 | 2 |
| markless (selftest-fixture) | webkit | normal | history-back | settled | 5/5 | 0 | 28.0 | 30.0 | 3.0 | 1.8 | 3.0 | - | 0.1 | 2 |
| markless (selftest-fixture) | webkit | normal | settings-derived | early | 5/5 | 0 | 28.0 | 30.0 | 3.0 | 1.8 | 1.0 | 51.0 | 0.1 | 2 |
| markless (selftest-fixture) | webkit | normal | settings-derived | settled | 5/5 | 0 | 25.0 | 30.6 | 1.0 | 4.0 | 1.0 | - | 0.1 | 2 |
| markless (selftest-fixture) | webkit | normal | settings-submit | settled | 5/5 | 0 | 324.0 | 334.6 | 2.0 | 6.1 | 306.0 | - | 0.1 | 2 |
| markless (selftest-fixture) | webkit | rtt150-down5mbps-up1mbps+4x-slowdown | overview-counter-first | early | 0/1 | unsupported:1 | - | - | - | - | - | - | - | - |
| markless (selftest-fixture) | webkit | rtt150-down5mbps-up1mbps+4x-slowdown | overview-counter-first | settled | 0/1 | unsupported:1 | - | - | - | - | - | - | - | - |
| markless (selftest-fixture) | webkit | rtt150-down5mbps-up1mbps+4x-slowdown | overview-counter-repeat-x10 | early | 0/1 | unsupported:1 | - | - | - | - | - | - | - | - |
| markless (selftest-fixture) | webkit | rtt150-down5mbps-up1mbps+4x-slowdown | overview-counter-repeat-x10 | settled | 0/1 | unsupported:1 | - | - | - | - | - | - | - | - |
| markless (selftest-fixture) | webkit | rtt150-down5mbps-up1mbps+4x-slowdown | overview-toggle | early | 0/1 | unsupported:1 | - | - | - | - | - | - | - | - |
| markless (selftest-fixture) | webkit | rtt150-down5mbps-up1mbps+4x-slowdown | overview-toggle | settled | 0/1 | unsupported:1 | - | - | - | - | - | - | - | - |
| markless (selftest-fixture) | webkit | rtt150-down5mbps-up1mbps+4x-slowdown | overview-filter | early | 0/1 | unsupported:1 | - | - | - | - | - | - | - | - |
| markless (selftest-fixture) | webkit | rtt150-down5mbps-up1mbps+4x-slowdown | overview-filter | settled | 0/1 | unsupported:1 | - | - | - | - | - | - | - | - |
| markless (selftest-fixture) | webkit | rtt150-down5mbps-up1mbps+4x-slowdown | records-select | early | 0/1 | unsupported:1 | - | - | - | - | - | - | - | - |
| markless (selftest-fixture) | webkit | rtt150-down5mbps-up1mbps+4x-slowdown | records-select | settled | 0/1 | unsupported:1 | - | - | - | - | - | - | - | - |
| markless (selftest-fixture) | webkit | rtt150-down5mbps-up1mbps+4x-slowdown | nav-overview-to-records | early | 0/1 | unsupported:1 | - | - | - | - | - | - | - | - |
| markless (selftest-fixture) | webkit | rtt150-down5mbps-up1mbps+4x-slowdown | nav-overview-to-records | settled | 0/1 | unsupported:1 | - | - | - | - | - | - | - | - |
| markless (selftest-fixture) | webkit | rtt150-down5mbps-up1mbps+4x-slowdown | history-back | settled | 0/1 | unsupported:1 | - | - | - | - | - | - | - | - |
| markless (selftest-fixture) | webkit | rtt150-down5mbps-up1mbps+4x-slowdown | settings-derived | early | 0/1 | unsupported:1 | - | - | - | - | - | - | - | - |
| markless (selftest-fixture) | webkit | rtt150-down5mbps-up1mbps+4x-slowdown | settings-derived | settled | 0/1 | unsupported:1 | - | - | - | - | - | - | - | - |
| markless (selftest-fixture) | webkit | rtt150-down5mbps-up1mbps+4x-slowdown | settings-submit | settled | 0/1 | unsupported:1 | - | - | - | - | - | - | - | - |
