# Interaction benchmark run 2026-10-13T16-54-41-482Z-bf365e

Started 2026-10-13T16:54:41.637Z; finished 2026-10-13T18:38:25.595Z. Playwright 1.58.2. Browsers: chromium 145.0.7632.6.
Visits per cell: 30 (warmup 0, excluded). Order alternates (rotates) across targets per visit index.

`inputToResponseMs` is a presentation estimate (rAF then next rAF after the DOM assertion holds), not a paint timestamp. `inputToDomMs` is the DOM diagnostic. Failed visits are counted, never folded into the distributions.

| entrant | browser | profile | case | phase | ok/visits | failures | inputToResponse median | p95 | IQR | stddev | inputToDom median | navToResponse median | JS KB (compressed) | initial req |
| --- | --- | --- | --- | --- | --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| markless | chromium | rtt150-down5mbps-up1mbps@cdp+4x-slowdown | overview-counter-first | early | 30/30 | 0 | 83.4 | 86.1 | 5.2 | 5.3 | 60.0 | 610.4 | 56.4 | 6 |
| qwik | chromium | rtt150-down5mbps-up1mbps@cdp+4x-slowdown | overview-counter-first | early | 0/30 | input-lost:30 | - | - | - | - | - | - | - | - |
| qwik (tuned) | chromium | rtt150-down5mbps-up1mbps@cdp+4x-slowdown | overview-counter-first | early | 30/30 | 0 | 322.8 | 374.8 | 8.7 | 24.0 | 300.3 | 678.9 | 66.5 | 14 |
| octane | chromium | rtt150-down5mbps-up1mbps@cdp+4x-slowdown | overview-counter-first | early | 0/30 | input-lost:30 | - | - | - | - | - | - | - | - |
| react-router | chromium | rtt150-down5mbps-up1mbps@cdp+4x-slowdown | overview-counter-first | early | 0/30 | input-lost:30 | - | - | - | - | - | - | - | - |
| remix3 | chromium | rtt150-down5mbps-up1mbps@cdp+4x-slowdown | overview-counter-first | early | 0/30 | input-lost:30 | - | - | - | - | - | - | - | - |
| solidstart | chromium | rtt150-down5mbps-up1mbps@cdp+4x-slowdown | overview-counter-first | early | 30/30 | 0 | 85.7 | 91.6 | 5.1 | 4.8 | 64.0 | 590.2 | 53.2 | 6 |
| sveltekit | chromium | rtt150-down5mbps-up1mbps@cdp+4x-slowdown | overview-counter-first | early | 1/30 | input-lost:29 | 27.7 | 27.7 | 0.0 | 0.0 | 4.4 | 573.8 | 35.7 | 12 |
| ripple | chromium | rtt150-down5mbps-up1mbps@cdp+4x-slowdown | overview-counter-first | early | 0/30 | input-lost:29 navigation-error:1 | - | - | - | - | - | - | - | - |
| markless | chromium | rtt150-down5mbps-up1mbps@cdp+4x-slowdown | overview-disclosure | early | 30/30 | 0 | 89.8 | 96.5 | 9.1 | 18.8 | 64.4 | 611.0 | 56.4 | 6 |
| qwik | chromium | rtt150-down5mbps-up1mbps@cdp+4x-slowdown | overview-disclosure | early | 0/30 | input-lost:30 | - | - | - | - | - | - | - | - |
| qwik (tuned) | chromium | rtt150-down5mbps-up1mbps@cdp+4x-slowdown | overview-disclosure | early | 30/30 | 0 | 338.8 | 347.2 | 9.0 | 6.0 | 315.3 | 702.4 | 66.5 | 14 |
| octane | chromium | rtt150-down5mbps-up1mbps@cdp+4x-slowdown | overview-disclosure | early | 0/30 | input-lost:30 | - | - | - | - | - | - | - | - |
| react-router | chromium | rtt150-down5mbps-up1mbps@cdp+4x-slowdown | overview-disclosure | early | 0/30 | input-lost:30 | - | - | - | - | - | - | - | - |
| remix3 | chromium | rtt150-down5mbps-up1mbps@cdp+4x-slowdown | overview-disclosure | early | 0/30 | input-lost:30 | - | - | - | - | - | - | - | - |
| solidstart | chromium | rtt150-down5mbps-up1mbps@cdp+4x-slowdown | overview-disclosure | early | 30/30 | 0 | 83.9 | 92.0 | 6.1 | 5.2 | 63.4 | 583.5 | 53.2 | 6 |
| sveltekit | chromium | rtt150-down5mbps-up1mbps@cdp+4x-slowdown | overview-disclosure | early | 5/30 | input-lost:25 | 26.6 | 27.6 | 2.2 | 1.4 | 4.4 | 592.5 | 35.7 | 12 |
| ripple | chromium | rtt150-down5mbps-up1mbps@cdp+4x-slowdown | overview-disclosure | early | 0/30 | input-lost:30 | - | - | - | - | - | - | - | - |
| markless | chromium | rtt150-down5mbps-up1mbps@cdp+4x-slowdown | overview-tab | early | 30/30 | 0 | 85.9 | 94.4 | 6.6 | 5.0 | 61.6 | 606.0 | 56.4 | 6 |
| qwik | chromium | rtt150-down5mbps-up1mbps@cdp+4x-slowdown | overview-tab | early | 0/30 | input-lost:30 | - | - | - | - | - | - | - | - |
| qwik (tuned) | chromium | rtt150-down5mbps-up1mbps@cdp+4x-slowdown | overview-tab | early | 30/30 | 0 | 337.0 | 347.3 | 12.1 | 35.1 | 311.6 | 693.5 | 66.5 | 14 |
| octane | chromium | rtt150-down5mbps-up1mbps@cdp+4x-slowdown | overview-tab | early | 0/30 | input-lost:30 | - | - | - | - | - | - | - | - |
| react-router | chromium | rtt150-down5mbps-up1mbps@cdp+4x-slowdown | overview-tab | early | 1/30 | input-lost:29 | 48.2 | 48.2 | 0.0 | 0.0 | 25.5 | 826.2 | 116.4 | 9 |
| remix3 | chromium | rtt150-down5mbps-up1mbps@cdp+4x-slowdown | overview-tab | early | 0/30 | input-lost:30 | - | - | - | - | - | - | - | - |
| solidstart | chromium | rtt150-down5mbps-up1mbps@cdp+4x-slowdown | overview-tab | early | 30/30 | 0 | 86.4 | 91.4 | 6.7 | 4.5 | 63.2 | 601.1 | 53.2 | 6 |
| sveltekit | chromium | rtt150-down5mbps-up1mbps@cdp+4x-slowdown | overview-tab | early | 3/30 | input-lost:27 | 32.7 | 32.9 | 1.7 | 1.9 | 5.6 | 624.9 | 35.7 | 12 |
| ripple | chromium | rtt150-down5mbps-up1mbps@cdp+4x-slowdown | overview-tab | early | 0/30 | input-lost:30 | - | - | - | - | - | - | - | - |
