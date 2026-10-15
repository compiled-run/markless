# Interaction benchmark run 2026-10-13T06-32-52-462Z-7df060

Started 2026-10-13T06:32:52.600Z; finished 2026-10-13T16:53:18.890Z. Playwright 1.58.2. Browsers: chromium 145.0.7632.6, webkit 26.0.
Visits per cell: 30 (warmup 0, excluded). Order alternates (rotates) across targets per visit index.

`inputToResponseMs` is a presentation estimate (rAF then next rAF after the DOM assertion holds), not a paint timestamp. `inputToDomMs` is the DOM diagnostic. Failed visits are counted, never folded into the distributions.

| entrant | browser | profile | case | phase | ok/visits | failures | inputToResponse median | p95 | IQR | stddev | inputToDom median | navToResponse median | JS KB (compressed) | initial req |
| --- | --- | --- | --- | --- | --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| markless | chromium | normal | overview-counter-first | early | 30/30 | 0 | 32.5 | 34.5 | 1.5 | 1.2 | 12.1 | 328.0 | 56.4 | 6 |
| qwik | chromium | normal | overview-counter-first | early | 0/30 | input-lost:30 | - | - | - | - | - | - | - | - |
| qwik (tuned) | chromium | normal | overview-counter-first | early | 30/30 | 0 | 109.9 | 156.0 | 22.3 | 47.6 | 88.7 | 351.6 | 66.5 | 14 |
| octane | chromium | normal | overview-counter-first | early | 0/30 | input-lost:30 | - | - | - | - | - | - | - | - |
| react-router | chromium | normal | overview-counter-first | early | 17/30 | input-lost:13 | 25.0 | 29.2 | 2.0 | 2.8 | 1.7 | 339.3 | 116.4 | 10 |
| remix3 | chromium | normal | overview-counter-first | early | 6/30 | input-lost:24 | 25.2 | 25.7 | 1.3 | 1.6 | 0.8 | 439.3 | 54.4 | 67 |
| solidstart | chromium | normal | overview-counter-first | early | 30/30 | 0 | 24.4 | 36.4 | 1.7 | 10.1 | 1.0 | 322.7 | 53.2 | 6 |
| sveltekit | chromium | normal | overview-counter-first | early | 21/30 | input-lost:9 | 24.6 | 26.0 | 2.1 | 1.5 | 0.9 | 316.7 | 35.7 | 12 |
| ripple | chromium | normal | overview-counter-first | early | 0/30 | input-lost:30 | - | - | - | - | - | - | - | - |
| markless | chromium | normal | overview-disclosure | early | 30/30 | 0 | 32.0 | 40.9 | 1.7 | 4.1 | 12.8 | 334.2 | 56.4 | 6 |
| qwik | chromium | normal | overview-disclosure | early | 0/30 | input-lost:30 | - | - | - | - | - | - | - | - |
| qwik (tuned) | chromium | normal | overview-disclosure | early | 30/30 | 0 | 114.6 | 133.5 | 16.3 | 13.7 | 95.7 | 361.4 | 66.5 | 14 |
| octane | chromium | normal | overview-disclosure | early | 0/30 | input-lost:30 | - | - | - | - | - | - | - | - |
| react-router | chromium | normal | overview-disclosure | early | 14/30 | input-lost:16 | 23.6 | 27.5 | 1.4 | 3.0 | 1.8 | 340.5 | 116.4 | 10 |
| remix3 | chromium | normal | overview-disclosure | early | 1/30 | input-lost:29 | 21.2 | 21.2 | 0.0 | 0.0 | 0.9 | 404.7 | 54.4 | 67 |
| solidstart | chromium | normal | overview-disclosure | early | 30/30 | 0 | 23.6 | 45.3 | 2.2 | 10.5 | 1.1 | 325.1 | 53.2 | 6 |
| sveltekit | chromium | normal | overview-disclosure | early | 20/30 | input-lost:10 | 22.8 | 25.2 | 2.0 | 1.4 | 0.9 | 320.9 | 35.7 | 12 |
| ripple | chromium | normal | overview-disclosure | early | 0/30 | input-lost:30 | - | - | - | - | - | - | - | - |
| markless | chromium | normal | overview-tab | early | 30/30 | 0 | 32.0 | 44.5 | 1.1 | 20.1 | 13.1 | 333.2 | 56.4 | 6 |
| qwik | chromium | normal | overview-tab | early | 0/30 | input-lost:30 | - | - | - | - | - | - | - | - |
| qwik (tuned) | chromium | normal | overview-tab | early | 30/30 | 0 | 106.5 | 150.2 | 18.3 | 26.7 | 88.2 | 355.8 | 66.5 | 14 |
| octane | chromium | normal | overview-tab | early | 0/30 | input-lost:30 | - | - | - | - | - | - | - | - |
| react-router | chromium | normal | overview-tab | early | 18/30 | input-lost:12 | 23.8 | 25.1 | 4.8 | 2.8 | 1.7 | 329.9 | 116.4 | 10 |
| remix3 | chromium | normal | overview-tab | early | 0/30 | input-lost:30 | - | - | - | - | - | - | - | - |
| solidstart | chromium | normal | overview-tab | early | 30/30 | 0 | 23.9 | 66.3 | 2.3 | 32.3 | 1.0 | 324.8 | 53.2 | 6 |
| sveltekit | chromium | normal | overview-tab | early | 21/30 | input-lost:9 | 23.2 | 25.6 | 3.1 | 1.7 | 0.8 | 317.8 | 35.7 | 12 |
| ripple | chromium | normal | overview-tab | early | 0/30 | input-lost:30 | - | - | - | - | - | - | - | - |
| markless | chromium | rtt150-down5mbps-up1mbps@proxy+4x-slowdown | overview-counter-first | early | 0/1 | unsupported:1 | - | - | - | - | - | - | - | - |
| qwik | chromium | rtt150-down5mbps-up1mbps@proxy+4x-slowdown | overview-counter-first | early | 0/1 | unsupported:1 | - | - | - | - | - | - | - | - |
| qwik (tuned) | chromium | rtt150-down5mbps-up1mbps@proxy+4x-slowdown | overview-counter-first | early | 0/1 | unsupported:1 | - | - | - | - | - | - | - | - |
| octane | chromium | rtt150-down5mbps-up1mbps@proxy+4x-slowdown | overview-counter-first | early | 0/1 | unsupported:1 | - | - | - | - | - | - | - | - |
| react-router | chromium | rtt150-down5mbps-up1mbps@proxy+4x-slowdown | overview-counter-first | early | 0/1 | unsupported:1 | - | - | - | - | - | - | - | - |
| remix3 | chromium | rtt150-down5mbps-up1mbps@proxy+4x-slowdown | overview-counter-first | early | 0/1 | unsupported:1 | - | - | - | - | - | - | - | - |
| solidstart | chromium | rtt150-down5mbps-up1mbps@proxy+4x-slowdown | overview-counter-first | early | 0/1 | unsupported:1 | - | - | - | - | - | - | - | - |
| sveltekit | chromium | rtt150-down5mbps-up1mbps@proxy+4x-slowdown | overview-counter-first | early | 0/1 | unsupported:1 | - | - | - | - | - | - | - | - |
| ripple | chromium | rtt150-down5mbps-up1mbps@proxy+4x-slowdown | overview-counter-first | early | 0/1 | unsupported:1 | - | - | - | - | - | - | - | - |
| markless | chromium | rtt150-down5mbps-up1mbps@proxy+4x-slowdown | overview-disclosure | early | 0/1 | unsupported:1 | - | - | - | - | - | - | - | - |
| qwik | chromium | rtt150-down5mbps-up1mbps@proxy+4x-slowdown | overview-disclosure | early | 0/1 | unsupported:1 | - | - | - | - | - | - | - | - |
| qwik (tuned) | chromium | rtt150-down5mbps-up1mbps@proxy+4x-slowdown | overview-disclosure | early | 0/1 | unsupported:1 | - | - | - | - | - | - | - | - |
| octane | chromium | rtt150-down5mbps-up1mbps@proxy+4x-slowdown | overview-disclosure | early | 0/1 | unsupported:1 | - | - | - | - | - | - | - | - |
| react-router | chromium | rtt150-down5mbps-up1mbps@proxy+4x-slowdown | overview-disclosure | early | 0/1 | unsupported:1 | - | - | - | - | - | - | - | - |
| remix3 | chromium | rtt150-down5mbps-up1mbps@proxy+4x-slowdown | overview-disclosure | early | 0/1 | unsupported:1 | - | - | - | - | - | - | - | - |
| solidstart | chromium | rtt150-down5mbps-up1mbps@proxy+4x-slowdown | overview-disclosure | early | 0/1 | unsupported:1 | - | - | - | - | - | - | - | - |
| sveltekit | chromium | rtt150-down5mbps-up1mbps@proxy+4x-slowdown | overview-disclosure | early | 0/1 | unsupported:1 | - | - | - | - | - | - | - | - |
| ripple | chromium | rtt150-down5mbps-up1mbps@proxy+4x-slowdown | overview-disclosure | early | 0/1 | unsupported:1 | - | - | - | - | - | - | - | - |
| markless | chromium | rtt150-down5mbps-up1mbps@proxy+4x-slowdown | overview-tab | early | 0/1 | unsupported:1 | - | - | - | - | - | - | - | - |
| qwik | chromium | rtt150-down5mbps-up1mbps@proxy+4x-slowdown | overview-tab | early | 0/1 | unsupported:1 | - | - | - | - | - | - | - | - |
| qwik (tuned) | chromium | rtt150-down5mbps-up1mbps@proxy+4x-slowdown | overview-tab | early | 0/1 | unsupported:1 | - | - | - | - | - | - | - | - |
| octane | chromium | rtt150-down5mbps-up1mbps@proxy+4x-slowdown | overview-tab | early | 0/1 | unsupported:1 | - | - | - | - | - | - | - | - |
| react-router | chromium | rtt150-down5mbps-up1mbps@proxy+4x-slowdown | overview-tab | early | 0/1 | unsupported:1 | - | - | - | - | - | - | - | - |
| remix3 | chromium | rtt150-down5mbps-up1mbps@proxy+4x-slowdown | overview-tab | early | 0/1 | unsupported:1 | - | - | - | - | - | - | - | - |
| solidstart | chromium | rtt150-down5mbps-up1mbps@proxy+4x-slowdown | overview-tab | early | 0/1 | unsupported:1 | - | - | - | - | - | - | - | - |
| sveltekit | chromium | rtt150-down5mbps-up1mbps@proxy+4x-slowdown | overview-tab | early | 0/1 | unsupported:1 | - | - | - | - | - | - | - | - |
| ripple | chromium | rtt150-down5mbps-up1mbps@proxy+4x-slowdown | overview-tab | early | 0/1 | unsupported:1 | - | - | - | - | - | - | - | - |
| markless | webkit | normal | overview-counter-first | early | 30/30 | 0 | 25.0 | 62.0 | 6.8 | 17.4 | 12.0 | 334.5 | 56.5 | 6 |
| qwik | webkit | normal | overview-counter-first | early | 0/30 | input-lost:30 | - | - | - | - | - | - | - | - |
| qwik (tuned) | webkit | normal | overview-counter-first | early | 30/30 | 0 | 115.5 | 227.4 | 14.0 | 50.8 | 97.0 | 373.5 | 61.8 | 15 |
| octane | webkit | normal | overview-counter-first | early | 0/30 | input-lost:29 navigation-error:1 | - | - | - | - | - | - | - | - |
| react-router | webkit | normal | overview-counter-first | early | 16/30 | input-lost:13 navigation-error:1 | 25.0 | 28.0 | 8.3 | 4.5 | 3.0 | 367.5 | 116.6 | 9 |
| remix3 | webkit | normal | overview-counter-first | early | 0/30 | input-lost:30 | - | - | - | - | - | - | - | - |
| solidstart | webkit | normal | overview-counter-first | early | 29/30 | navigation-error:1 | 25.0 | 42.2 | 9.0 | 39.5 | 7.0 | 330.0 | 53.3 | 6 |
| sveltekit | webkit | normal | overview-counter-first | early | 12/30 | input-lost:18 | 21.0 | 25.4 | 5.5 | 3.8 | 1.0 | 314.5 | 35.9 | 12 |
| ripple | webkit | normal | overview-counter-first | early | 2/30 | input-lost:28 | 21.0 | 22.8 | 2.0 | 2.8 | 2.5 | 423.5 | 21.6 | 6 |
| markless | webkit | normal | overview-disclosure | early | 30/30 | 0 | 28.0 | 76.0 | 29.8 | 21.4 | 13.5 | 344.5 | 56.5 | 6 |
| qwik | webkit | normal | overview-disclosure | early | 4/30 | input-lost:26 | 64.0 | 64.8 | 0.5 | 0.8 | 18.5 | 344.5 | 54.1 | 15 |
| qwik (tuned) | webkit | normal | overview-disclosure | early | 30/30 | 0 | 123.0 | 279.3 | 20.8 | 67.4 | 97.5 | 393.5 | 71.5 | 15 |
| octane | webkit | normal | overview-disclosure | early | 0/30 | input-lost:30 | - | - | - | - | - | - | - | - |
| react-router | webkit | normal | overview-disclosure | early | 14/30 | input-lost:16 | 26.5 | 47.3 | 11.3 | 11.3 | 5.0 | 364.0 | 116.6 | 9 |
| remix3 | webkit | normal | overview-disclosure | early | 0/30 | input-lost:30 | - | - | - | - | - | - | - | - |
| solidstart | webkit | normal | overview-disclosure | early | 30/30 | 0 | 32.0 | 122.6 | 36.8 | 39.2 | 12.5 | 347.0 | 53.3 | 6 |
| sveltekit | webkit | normal | overview-disclosure | early | 17/30 | input-lost:13 | 25.0 | 63.0 | 13.0 | 16.2 | 1.0 | 343.0 | 35.9 | 12 |
| ripple | webkit | normal | overview-disclosure | early | 0/30 | input-lost:30 | - | - | - | - | - | - | - | - |
| markless | webkit | normal | overview-tab | early | 30/30 | 0 | 50.5 | 74.2 | 15.8 | 15.8 | 14.0 | 360.5 | 56.5 | 6 |
| qwik | webkit | normal | overview-tab | early | 17/30 | input-lost:13 | 131.0 | 273.2 | 3.0 | 123.1 | 79.0 | 422.0 | 63.0 | 15 |
| qwik (tuned) | webkit | normal | overview-tab | early | 30/30 | 0 | 127.5 | 182.7 | 27.8 | 100.8 | 74.5 | 416.5 | 61.8 | 15 |
| octane | webkit | normal | overview-tab | early | 0/30 | input-lost:30 | - | - | - | - | - | - | - | - |
| react-router | webkit | normal | overview-tab | early | 17/30 | input-lost:13 | 50.0 | 66.0 | 18.0 | 9.8 | 3.0 | 393.0 | 116.6 | 9 |
| remix3 | webkit | normal | overview-tab | early | 0/30 | input-lost:30 | - | - | - | - | - | - | - | - |
| solidstart | webkit | normal | overview-tab | early | 30/30 | 0 | 57.0 | 120.2 | 19.5 | 64.3 | 6.5 | 366.5 | 53.3 | 6 |
| sveltekit | webkit | normal | overview-tab | early | 14/30 | input-lost:16 | 57.0 | 64.0 | 16.0 | 10.4 | 1.0 | 360.5 | 35.9 | 12 |
| ripple | webkit | normal | overview-tab | early | 1/30 | input-lost:29 | 34.0 | 34.0 | 0.0 | 0.0 | 0.0 | 366.0 | 21.6 | 6 |
| markless | webkit | rtt150-down5mbps-up1mbps@proxy+unthrottled-no-cdp | overview-counter-first | early | 0/1 | unsupported:1 | - | - | - | - | - | - | - | - |
| qwik | webkit | rtt150-down5mbps-up1mbps@proxy+unthrottled-no-cdp | overview-counter-first | early | 0/1 | unsupported:1 | - | - | - | - | - | - | - | - |
| qwik (tuned) | webkit | rtt150-down5mbps-up1mbps@proxy+unthrottled-no-cdp | overview-counter-first | early | 0/1 | unsupported:1 | - | - | - | - | - | - | - | - |
| octane | webkit | rtt150-down5mbps-up1mbps@proxy+unthrottled-no-cdp | overview-counter-first | early | 0/1 | unsupported:1 | - | - | - | - | - | - | - | - |
| react-router | webkit | rtt150-down5mbps-up1mbps@proxy+unthrottled-no-cdp | overview-counter-first | early | 0/1 | unsupported:1 | - | - | - | - | - | - | - | - |
| remix3 | webkit | rtt150-down5mbps-up1mbps@proxy+unthrottled-no-cdp | overview-counter-first | early | 0/1 | unsupported:1 | - | - | - | - | - | - | - | - |
| solidstart | webkit | rtt150-down5mbps-up1mbps@proxy+unthrottled-no-cdp | overview-counter-first | early | 0/1 | unsupported:1 | - | - | - | - | - | - | - | - |
| sveltekit | webkit | rtt150-down5mbps-up1mbps@proxy+unthrottled-no-cdp | overview-counter-first | early | 0/1 | unsupported:1 | - | - | - | - | - | - | - | - |
| ripple | webkit | rtt150-down5mbps-up1mbps@proxy+unthrottled-no-cdp | overview-counter-first | early | 0/1 | unsupported:1 | - | - | - | - | - | - | - | - |
| markless | webkit | rtt150-down5mbps-up1mbps@proxy+unthrottled-no-cdp | overview-disclosure | early | 0/1 | unsupported:1 | - | - | - | - | - | - | - | - |
| qwik | webkit | rtt150-down5mbps-up1mbps@proxy+unthrottled-no-cdp | overview-disclosure | early | 0/1 | unsupported:1 | - | - | - | - | - | - | - | - |
| qwik (tuned) | webkit | rtt150-down5mbps-up1mbps@proxy+unthrottled-no-cdp | overview-disclosure | early | 0/1 | unsupported:1 | - | - | - | - | - | - | - | - |
| octane | webkit | rtt150-down5mbps-up1mbps@proxy+unthrottled-no-cdp | overview-disclosure | early | 0/1 | unsupported:1 | - | - | - | - | - | - | - | - |
| react-router | webkit | rtt150-down5mbps-up1mbps@proxy+unthrottled-no-cdp | overview-disclosure | early | 0/1 | unsupported:1 | - | - | - | - | - | - | - | - |
| remix3 | webkit | rtt150-down5mbps-up1mbps@proxy+unthrottled-no-cdp | overview-disclosure | early | 0/1 | unsupported:1 | - | - | - | - | - | - | - | - |
| solidstart | webkit | rtt150-down5mbps-up1mbps@proxy+unthrottled-no-cdp | overview-disclosure | early | 0/1 | unsupported:1 | - | - | - | - | - | - | - | - |
| sveltekit | webkit | rtt150-down5mbps-up1mbps@proxy+unthrottled-no-cdp | overview-disclosure | early | 0/1 | unsupported:1 | - | - | - | - | - | - | - | - |
| ripple | webkit | rtt150-down5mbps-up1mbps@proxy+unthrottled-no-cdp | overview-disclosure | early | 0/1 | unsupported:1 | - | - | - | - | - | - | - | - |
| markless | webkit | rtt150-down5mbps-up1mbps@proxy+unthrottled-no-cdp | overview-tab | early | 0/1 | unsupported:1 | - | - | - | - | - | - | - | - |
| qwik | webkit | rtt150-down5mbps-up1mbps@proxy+unthrottled-no-cdp | overview-tab | early | 0/1 | unsupported:1 | - | - | - | - | - | - | - | - |
| qwik (tuned) | webkit | rtt150-down5mbps-up1mbps@proxy+unthrottled-no-cdp | overview-tab | early | 0/1 | unsupported:1 | - | - | - | - | - | - | - | - |
| octane | webkit | rtt150-down5mbps-up1mbps@proxy+unthrottled-no-cdp | overview-tab | early | 0/1 | unsupported:1 | - | - | - | - | - | - | - | - |
| react-router | webkit | rtt150-down5mbps-up1mbps@proxy+unthrottled-no-cdp | overview-tab | early | 0/1 | unsupported:1 | - | - | - | - | - | - | - | - |
| remix3 | webkit | rtt150-down5mbps-up1mbps@proxy+unthrottled-no-cdp | overview-tab | early | 0/1 | unsupported:1 | - | - | - | - | - | - | - | - |
| solidstart | webkit | rtt150-down5mbps-up1mbps@proxy+unthrottled-no-cdp | overview-tab | early | 0/1 | unsupported:1 | - | - | - | - | - | - | - | - |
| sveltekit | webkit | rtt150-down5mbps-up1mbps@proxy+unthrottled-no-cdp | overview-tab | early | 0/1 | unsupported:1 | - | - | - | - | - | - | - | - |
| ripple | webkit | rtt150-down5mbps-up1mbps@proxy+unthrottled-no-cdp | overview-tab | early | 0/1 | unsupported:1 | - | - | - | - | - | - | - | - |
