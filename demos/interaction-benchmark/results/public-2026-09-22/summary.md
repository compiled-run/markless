# Interaction benchmark run 2026-09-23T05-07-29-037Z-91aefc

Started 2026-09-23T05:07:29.185Z; finished 2026-09-23T07:29:13.274Z. Playwright 1.58.2. Browsers: chromium 145.0.7632.6.
Visits per cell: 10 (warmup 0, excluded). Order alternates (rotates) across targets per visit index.

`inputToResponseMs` is a presentation estimate (rAF then next rAF after the DOM assertion holds), not a paint timestamp. `inputToDomMs` is the DOM diagnostic. Failed visits are counted, never folded into the distributions.

| entrant | browser | profile | case | phase | ok/visits | failures | inputToResponse median | p95 | IQR | stddev | inputToDom median | navToResponse median | JS KB (compressed) | initial req |
| --- | --- | --- | --- | --- | --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| markless | chromium | normal | overview-counter-first | early | 10/10 | 0 | 31.7 | 73.4 | 1.6 | 23.9 | 12.0 | 307.2 | 56.4 | 6 |
| qwik | chromium | normal | overview-counter-first | early | 0/10 | input-lost:10 | - | - | - | - | - | - | - | - |
| qwik (tuned) | chromium | normal | overview-counter-first | early | 10/10 | 0 | 107.5 | 175.1 | 18.3 | 34.7 | 87.7 | 324.0 | 66.5 | 14 |
| octane | chromium | normal | overview-counter-first | early | 0/10 | input-lost:10 | - | - | - | - | - | - | - | - |
| react-router | chromium | normal | overview-counter-first | early | 7/10 | input-lost:3 | 23.1 | 28.4 | 4.4 | 3.6 | 1.7 | 291.0 | 116.4 | 10 |
| remix3 | chromium | normal | overview-counter-first | early | 1/10 | input-lost:9 | 25.3 | 25.3 | 0.0 | 0.0 | 0.8 | 495.6 | 54.4 | 67 |
| solidstart | chromium | normal | overview-counter-first | early | 10/10 | 0 | 24.1 | 94.4 | 8.8 | 35.7 | 1.0 | 295.7 | 53.2 | 6 |
| sveltekit | chromium | normal | overview-counter-first | early | 5/10 | input-lost:5 | 23.8 | 25.3 | 0.8 | 1.7 | 0.8 | 285.3 | 35.7 | 12 |
| ripple | chromium | normal | overview-counter-first | early | 0/10 | input-lost:10 | - | - | - | - | - | - | - | - |
| markless | chromium | normal | overview-counter-first | settled | 10/10 | 0 | 31.3 | 32.2 | 0.9 | 0.7 | 12.0 | - | 56.4 | 6 |
| qwik | chromium | normal | overview-counter-first | settled | 10/10 | 0 | 30.3 | 32.0 | 1.2 | 1.3 | 9.3 | - | 76.5 | 53 |
| qwik (tuned) | chromium | normal | overview-counter-first | settled | 10/10 | 0 | 31.0 | 32.5 | 1.7 | 1.5 | 11.0 | - | 70.9 | 36 |
| octane | chromium | normal | overview-counter-first | settled | 10/10 | 0 | 22.2 | 25.1 | 1.8 | 1.5 | 1.4 | - | 105.1 | 9 |
| react-router | chromium | normal | overview-counter-first | settled | 10/10 | 0 | 22.3 | 25.9 | 2.3 | 1.9 | 1.5 | - | 116.4 | 10 |
| remix3 | chromium | normal | overview-counter-first | settled | 10/10 | 0 | 22.2 | 24.1 | 1.3 | 1.1 | 0.9 | - | 54.4 | 67 |
| solidstart | chromium | normal | overview-counter-first | settled | 10/10 | 0 | 23.8 | 25.6 | 2.9 | 1.6 | 1.0 | - | 53.2 | 6 |
| sveltekit | chromium | normal | overview-counter-first | settled | 10/10 | 0 | 21.9 | 24.8 | 1.2 | 1.4 | 0.9 | - | 35.7 | 12 |
| ripple | chromium | normal | overview-counter-first | settled | 10/10 | 0 | 23.6 | 25.9 | 1.8 | 1.4 | 0.8 | - | 21.6 | 6 |
| markless | chromium | normal | overview-disclosure | early | 10/10 | 0 | 32.4 | 89.1 | 2.7 | 28.5 | 12.8 | 303.0 | 56.4 | 6 |
| qwik | chromium | normal | overview-disclosure | early | 0/10 | input-lost:10 | - | - | - | - | - | - | - | - |
| qwik (tuned) | chromium | normal | overview-disclosure | early | 10/10 | 0 | 111.2 | 119.2 | 15.9 | 8.8 | 89.1 | 317.7 | 66.5 | 14 |
| octane | chromium | normal | overview-disclosure | early | 0/10 | input-lost:10 | - | - | - | - | - | - | - | - |
| react-router | chromium | normal | overview-disclosure | early | 5/10 | input-lost:5 | 24.0 | 25.4 | 0.6 | 0.8 | 1.8 | 316.6 | 116.4 | 10 |
| remix3 | chromium | normal | overview-disclosure | early | 0/10 | input-lost:10 | - | - | - | - | - | - | - | - |
| solidstart | chromium | normal | overview-disclosure | early | 10/10 | 0 | 26.4 | 139.4 | 51.6 | 48.1 | 1.2 | 314.6 | 53.2 | 6 |
| sveltekit | chromium | normal | overview-disclosure | early | 7/10 | input-lost:3 | 22.5 | 23.8 | 2.5 | 1.6 | 0.8 | 293.5 | 35.7 | 12 |
| ripple | chromium | normal | overview-disclosure | early | 0/10 | input-lost:10 | - | - | - | - | - | - | - | - |
| markless | chromium | normal | overview-disclosure | settled | 10/10 | 0 | 31.9 | 32.7 | 1.0 | 0.7 | 12.7 | - | 56.4 | 6 |
| qwik | chromium | normal | overview-disclosure | settled | 10/10 | 0 | 31.8 | 32.2 | 0.7 | 0.6 | 10.3 | - | 76.5 | 53 |
| qwik (tuned) | chromium | normal | overview-disclosure | settled | 10/10 | 0 | 31.8 | 32.7 | 0.7 | 0.6 | 10.8 | - | 70.9 | 36 |
| octane | chromium | normal | overview-disclosure | settled | 10/10 | 0 | 23.5 | 24.9 | 1.9 | 1.0 | 1.7 | - | 105.1 | 9 |
| react-router | chromium | normal | overview-disclosure | settled | 10/10 | 0 | 23.4 | 24.6 | 0.6 | 0.7 | 1.5 | - | 116.4 | 10 |
| remix3 | chromium | normal | overview-disclosure | settled | 10/10 | 0 | 23.5 | 25.1 | 1.4 | 0.9 | 1.2 | - | 54.4 | 67 |
| solidstart | chromium | normal | overview-disclosure | settled | 10/10 | 0 | 23.8 | 25.2 | 1.6 | 1.0 | 1.1 | - | 53.2 | 6 |
| sveltekit | chromium | normal | overview-disclosure | settled | 10/10 | 0 | 23.6 | 24.5 | 0.7 | 0.7 | 1.0 | - | 35.7 | 12 |
| ripple | chromium | normal | overview-disclosure | settled | 10/10 | 0 | 23.8 | 25.3 | 2.0 | 1.2 | 0.9 | - | 21.6 | 6 |
| markless | chromium | normal | overview-tab | early | 10/10 | 0 | 32.1 | 60.3 | 0.8 | 16.0 | 13.2 | 297.5 | 56.4 | 6 |
| qwik | chromium | normal | overview-tab | early | 0/10 | input-lost:10 | - | - | - | - | - | - | - | - |
| qwik (tuned) | chromium | normal | overview-tab | early | 10/10 | 0 | 107.9 | 183.8 | 30.7 | 39.8 | 86.7 | 322.6 | 66.5 | 14 |
| octane | chromium | normal | overview-tab | early | 0/10 | input-lost:10 | - | - | - | - | - | - | - | - |
| react-router | chromium | normal | overview-tab | early | 4/10 | input-lost:6 | 24.8 | 25.6 | 1.2 | 0.9 | 1.7 | 316.6 | 116.4 | 10 |
| remix3 | chromium | normal | overview-tab | early | 0/10 | input-lost:10 | - | - | - | - | - | - | - | - |
| solidstart | chromium | normal | overview-tab | early | 10/10 | 0 | 23.9 | 25.5 | 0.7 | 1.4 | 1.0 | 281.9 | 53.2 | 6 |
| sveltekit | chromium | normal | overview-tab | early | 7/10 | input-lost:3 | 23.8 | 24.3 | 0.8 | 0.9 | 0.9 | 281.0 | 35.7 | 12 |
| ripple | chromium | normal | overview-tab | early | 0/10 | input-lost:10 | - | - | - | - | - | - | - | - |
| markless | chromium | normal | overview-tab | settled | 10/10 | 0 | 32.0 | 32.6 | 1.1 | 0.7 | 13.1 | - | 56.4 | 6 |
| qwik | chromium | normal | overview-tab | settled | 10/10 | 0 | 32.1 | 32.9 | 0.5 | 0.6 | 11.8 | - | 76.5 | 53 |
| qwik (tuned) | chromium | normal | overview-tab | settled | 10/10 | 0 | 32.1 | 32.7 | 0.4 | 0.5 | 11.8 | - | 70.9 | 36 |
| octane | chromium | normal | overview-tab | settled | 10/10 | 0 | 23.4 | 24.7 | 0.9 | 0.8 | 1.7 | - | 105.1 | 9 |
| react-router | chromium | normal | overview-tab | settled | 10/10 | 0 | 23.4 | 24.8 | 1.1 | 0.8 | 1.6 | - | 116.4 | 10 |
| remix3 | chromium | normal | overview-tab | settled | 10/10 | 0 | 23.0 | 24.7 | 1.0 | 0.9 | 1.1 | - | 54.4 | 67 |
| solidstart | chromium | normal | overview-tab | settled | 10/10 | 0 | 23.0 | 25.4 | 1.5 | 1.1 | 1.1 | - | 53.2 | 6 |
| sveltekit | chromium | normal | overview-tab | settled | 10/10 | 0 | 24.0 | 25.3 | 0.6 | 0.9 | 0.9 | - | 35.7 | 12 |
| ripple | chromium | normal | overview-tab | settled | 10/10 | 0 | 23.6 | 25.0 | 1.1 | 0.9 | 0.9 | - | 21.6 | 6 |
| markless | chromium | normal | records-search | early | 10/10 | 0 | 45.9 | 55.6 | 1.0 | 5.5 | 35.9 | 343.9 | 54.5 | 6 |
| qwik | chromium | normal | records-search | early | 0/10 | input-lost:10 | - | - | - | - | - | - | - | - |
| qwik (tuned) | chromium | normal | records-search | early | 10/10 | 0 | 92.0 | 164.5 | 12.3 | 38.3 | 87.8 | 362.0 | 71.2 | 14 |
| octane | chromium | normal | records-search | early | 0/10 | input-lost:10 | - | - | - | - | - | - | - | - |
| react-router | chromium | normal | records-search | early | 7/10 | input-lost:3 | 20.6 | 22.4 | 3.0 | 1.8 | 2.5 | 330.9 | 116.7 | 10 |
| remix3 | chromium | normal | records-search | early | 1/10 | input-lost:9 | 22.6 | 22.6 | 0.0 | 0.0 | 3.0 | 370.4 | 53.6 | 63 |
| solidstart | chromium | normal | records-search | early | 10/10 | 0 | 22.1 | 30.8 | 2.3 | 4.5 | 2.2 | 296.5 | 53.3 | 6 |
| sveltekit | chromium | normal | records-search | early | 10/10 | 0 | 21.8 | 37.2 | 1.8 | 6.7 | 1.8 | 305.1 | 36.3 | 12 |
| ripple | chromium | normal | records-search | early | 0/10 | input-lost:10 | - | - | - | - | - | - | - | - |
| markless | chromium | normal | records-search | settled | 10/10 | 0 | 46.5 | 46.8 | 2.7 | 1.5 | 35.4 | - | 54.5 | 6 |
| qwik | chromium | normal | records-search | settled | 10/10 | 0 | 46.3 | 47.0 | 2.0 | 1.2 | 39.7 | - | 78.3 | 55 |
| qwik (tuned) | chromium | normal | records-search | settled | 10/10 | 0 | 46.4 | 46.9 | 1.1 | 0.9 | 39.5 | - | 71.2 | 36 |
| octane | chromium | normal | records-search | settled | 10/10 | 0 | 19.3 | 21.5 | 1.5 | 1.2 | 2.7 | - | 105.1 | 9 |
| react-router | chromium | normal | records-search | settled | 10/10 | 0 | 20.0 | 22.8 | 3.3 | 2.0 | 2.2 | - | 116.7 | 10 |
| remix3 | chromium | normal | records-search | settled | 10/10 | 0 | 19.5 | 22.7 | 2.4 | 1.6 | 3.1 | - | 53.7 | 63 |
| solidstart | chromium | normal | records-search | settled | 10/10 | 0 | 19.7 | 22.0 | 1.7 | 1.3 | 2.2 | - | 53.3 | 6 |
| sveltekit | chromium | normal | records-search | settled | 10/10 | 0 | 20.7 | 23.2 | 1.9 | 1.6 | 1.9 | - | 36.3 | 12 |
| ripple | chromium | normal | records-search | settled | 10/10 | 0 | 22.2 | 22.9 | 3.5 | 2.1 | 1.9 | - | 21.7 | 6 |
| markless | chromium | normal | records-dialog-open | early | 10/10 | 0 | 41.7 | 91.4 | 19.3 | 21.8 | 20.9 | 342.2 | 54.5 | 6 |
| qwik | chromium | normal | records-dialog-open | early | 0/10 | input-lost:10 | - | - | - | - | - | - | - | - |
| qwik (tuned) | chromium | normal | records-dialog-open | early | 10/10 | 0 | 106.5 | 124.9 | 15.1 | 11.9 | 101.2 | 337.9 | 66.3 | 14 |
| octane | chromium | normal | records-dialog-open | early | 0/10 | input-lost:10 | - | - | - | - | - | - | - | - |
| react-router | chromium | normal | records-dialog-open | early | 5/10 | input-lost:5 | 29.6 | 30.3 | 5.0 | 4.1 | 13.2 | 320.6 | 116.7 | 9 |
| remix3 | chromium | normal | records-dialog-open | early | 0/10 | input-lost:10 | - | - | - | - | - | - | - | - |
| solidstart | chromium | normal | records-dialog-open | early | 10/10 | 0 | 22.9 | 49.2 | 2.4 | 14.5 | 3.6 | 304.6 | 53.3 | 6 |
| sveltekit | chromium | normal | records-dialog-open | early | 8/10 | input-lost:2 | 22.9 | 26.2 | 1.6 | 2.0 | 3.2 | 293.9 | 36.3 | 12 |
| ripple | chromium | normal | records-dialog-open | early | 0/10 | input-lost:10 | - | - | - | - | - | - | - | - |
| markless | chromium | normal | records-dialog-open | settled | 10/10 | 0 | 38.5 | 41.4 | 1.6 | 1.5 | 17.6 | - | 54.5 | 6 |
| qwik | chromium | normal | records-dialog-open | settled | 10/10 | 0 | 47.5 | 49.1 | 4.1 | 2.6 | 46.5 | - | 78.3 | 55 |
| qwik (tuned) | chromium | normal | records-dialog-open | settled | 10/10 | 0 | 44.0 | 48.7 | 4.9 | 2.8 | 28.1 | - | 71.2 | 36 |
| octane | chromium | normal | records-dialog-open | settled | 10/10 | 0 | 22.4 | 24.1 | 1.8 | 1.1 | 5.1 | - | 105.1 | 9 |
| react-router | chromium | normal | records-dialog-open | settled | 10/10 | 0 | 22.6 | 28.8 | 3.1 | 3.2 | 4.1 | - | 116.7 | 10 |
| remix3 | chromium | normal | records-dialog-open | settled | 10/10 | 0 | 23.9 | 25.1 | 1.8 | 1.1 | 5.3 | - | 53.7 | 63 |
| solidstart | chromium | normal | records-dialog-open | settled | 10/10 | 0 | 22.8 | 25.5 | 2.0 | 1.7 | 3.7 | - | 53.3 | 6 |
| sveltekit | chromium | normal | records-dialog-open | settled | 10/10 | 0 | 23.2 | 26.1 | 2.6 | 1.8 | 3.3 | - | 36.3 | 12 |
| ripple | chromium | normal | records-dialog-open | settled | 10/10 | 0 | 22.8 | 24.0 | 1.2 | 0.8 | 3.3 | - | 21.7 | 6 |
| markless | chromium | normal | settings-submit | settled | 10/10 | 0 | 413.9 | 453.1 | 7.8 | 19.2 | 398.8 | - | 55.3 | 6 |
| qwik | chromium | normal | settings-submit | settled | 10/10 | 0 | 389.9 | 484.6 | 15.2 | 41.7 | 380.8 | - | 78.5 | 56 |
| qwik (tuned) | chromium | normal | settings-submit | settled | 10/10 | 0 | 397.3 | 419.9 | 8.7 | 11.9 | 384.0 | - | 71.4 | 37 |
| octane | chromium | normal | settings-submit | settled | 10/10 | 0 | 419.6 | 515.6 | 47.7 | 46.2 | 410.0 | - | 105.1 | 9 |
| react-router | chromium | normal | settings-submit | settled | 10/10 | 0 | 423.7 | 443.8 | 9.4 | 10.2 | 412.7 | - | 116.4 | 11 |
| remix3 | chromium | normal | settings-submit | settled | 10/10 | 0 | 381.8 | 406.9 | 9.4 | 11.8 | 374.9 | - | 53.4 | 63 |
| solidstart | chromium | normal | settings-submit | settled | 10/10 | 0 | 422.8 | 491.2 | 69.0 | 41.8 | 411.0 | - | 52.9 | 6 |
| sveltekit | chromium | normal | settings-submit | settled | 10/10 | 0 | 406.9 | 438.5 | 21.8 | 17.2 | 392.7 | - | 35.3 | 12 |
| ripple | chromium | normal | settings-submit | settled | 10/10 | 0 | 397.9 | 474.8 | 63.8 | 37.3 | 386.9 | - | 21.2 | 6 |
| markless | chromium | normal | nav-overview-to-records | early | 10/10 | 0 | 185.4 | 267.8 | 21.1 | 40.0 | 167.1 | 427.4 | 91.3 | 6 |
| qwik | chromium | normal | nav-overview-to-records | early | 10/10 | 0 | 144.7 | 185.4 | 19.1 | 23.0 | 128.5 | 338.8 | 97.2 | 12 |
| qwik (tuned) | chromium | normal | nav-overview-to-records | early | 10/10 | 0 | 253.3 | 277.7 | 28.7 | 35.3 | 235.9 | 452.8 | 71.3 | 14 |
| octane | chromium | normal | nav-overview-to-records | early | 10/10 | 0 | 150.9 | 194.5 | 15.2 | 46.3 | 90.3 | 410.3 | 118.0 | 6 |
| react-router | chromium | normal | nav-overview-to-records | early | 9/10 | page-error:1 | 159.3 | 178.7 | 17.2 | 19.8 | 104.7 | 405.2 | 231.8 | 9 |
| remix3 | chromium | normal | nav-overview-to-records | early | 10/10 | 0 | 241.7 | 379.3 | 124.7 | 72.4 | 140.9 | 647.1 | 108.2 | 67 |
| solidstart | chromium | normal | nav-overview-to-records | early | 10/10 | 0 | 81.8 | 156.6 | 83.1 | 42.3 | 64.7 | 342.6 | 55.0 | 6 |
| sveltekit | chromium | normal | nav-overview-to-records | early | 10/10 | 0 | 73.3 | 159.5 | 11.6 | 37.4 | 55.8 | 341.0 | 38.0 | 12 |
| ripple | chromium | normal | nav-overview-to-records | early | 10/10 | 0 | 154.5 | 170.6 | 10.2 | 10.6 | 91.9 | 401.2 | 38.5 | 6 |
| markless | chromium | normal | nav-overview-to-records | settled | 10/10 | 0 | 193.1 | 210.2 | 14.5 | 12.3 | 174.2 | - | 91.3 | 6 |
| qwik | chromium | normal | nav-overview-to-records | settled | 10/10 | 0 | 86.3 | 101.5 | 8.2 | 7.6 | 69.0 | - | 78.3 | 53 |
| qwik (tuned) | chromium | normal | nav-overview-to-records | settled | 10/10 | 0 | 92.3 | 99.6 | 7.7 | 6.6 | 75.0 | - | 71.3 | 36 |
| octane | chromium | normal | nav-overview-to-records | settled | 10/10 | 0 | 29.4 | 30.4 | 0.5 | 0.7 | 11.8 | - | 105.1 | 9 |
| react-router | chromium | normal | nav-overview-to-records | settled | 10/10 | 0 | 75.3 | 118.9 | 16.2 | 19.1 | 57.5 | - | 117.9 | 10 |
| remix3 | chromium | normal | nav-overview-to-records | settled | 10/10 | 0 | 139.3 | 169.1 | 21.8 | 20.4 | 121.5 | - | 55.9 | 67 |
| solidstart | chromium | normal | nav-overview-to-records | settled | 10/10 | 0 | 79.2 | 93.9 | 7.4 | 8.4 | 61.6 | - | 55.0 | 6 |
| sveltekit | chromium | normal | nav-overview-to-records | settled | 10/10 | 0 | 74.1 | 83.8 | 4.7 | 6.3 | 56.1 | - | 38.0 | 12 |
| ripple | chromium | normal | nav-overview-to-records | settled | 10/10 | 0 | 165.6 | 253.3 | 29.8 | 41.9 | 100.1 | - | 38.5 | 6 |
| markless | chromium | rtt150-down5mbps-up1mbps@cdp+4x-slowdown | overview-counter-first | early | 10/10 | 0 | 83.2 | 85.1 | 1.4 | 1.4 | 61.9 | 554.7 | 56.4 | 6 |
| qwik | chromium | rtt150-down5mbps-up1mbps@cdp+4x-slowdown | overview-counter-first | early | 0/10 | input-lost:10 | - | - | - | - | - | - | - | - |
| qwik (tuned) | chromium | rtt150-down5mbps-up1mbps@cdp+4x-slowdown | overview-counter-first | early | 10/10 | 0 | 328.8 | 336.5 | 6.9 | 4.3 | 307.8 | 635.0 | 66.5 | 14 |
| octane | chromium | rtt150-down5mbps-up1mbps@cdp+4x-slowdown | overview-counter-first | early | 0/10 | input-lost:10 | - | - | - | - | - | - | - | - |
| react-router | chromium | rtt150-down5mbps-up1mbps@cdp+4x-slowdown | overview-counter-first | early | 0/10 | input-lost:10 | - | - | - | - | - | - | - | - |
| remix3 | chromium | rtt150-down5mbps-up1mbps@cdp+4x-slowdown | overview-counter-first | early | 0/10 | input-lost:10 | - | - | - | - | - | - | - | - |
| solidstart | chromium | rtt150-down5mbps-up1mbps@cdp+4x-slowdown | overview-counter-first | early | 10/10 | 0 | 83.2 | 92.0 | 6.0 | 4.9 | 64.0 | 551.4 | 53.2 | 6 |
| sveltekit | chromium | rtt150-down5mbps-up1mbps@cdp+4x-slowdown | overview-counter-first | early | 1/10 | input-lost:9 | 22.3 | 22.3 | 0.0 | 0.0 | 3.2 | 522.7 | 35.7 | 12 |
| ripple | chromium | rtt150-down5mbps-up1mbps@cdp+4x-slowdown | overview-counter-first | early | 0/10 | input-lost:10 | - | - | - | - | - | - | - | - |
| markless | chromium | rtt150-down5mbps-up1mbps@cdp+4x-slowdown | overview-counter-first | settled | 10/10 | 0 | 49.0 | 51.6 | 1.5 | 1.5 | 26.9 | - | 56.4 | 6 |
| qwik | chromium | rtt150-down5mbps-up1mbps@cdp+4x-slowdown | overview-counter-first | settled | 10/10 | 0 | 41.8 | 43.6 | 2.5 | 1.8 | 19.1 | - | 76.5 | 53 |
| qwik (tuned) | chromium | rtt150-down5mbps-up1mbps@cdp+4x-slowdown | overview-counter-first | settled | 10/10 | 0 | 42.2 | 44.7 | 3.0 | 1.9 | 20.6 | - | 70.9 | 36 |
| octane | chromium | rtt150-down5mbps-up1mbps@cdp+4x-slowdown | overview-counter-first | settled | 10/10 | 0 | 25.4 | 26.8 | 0.8 | 1.0 | 5.8 | - | 105.1 | 9 |
| react-router | chromium | rtt150-down5mbps-up1mbps@cdp+4x-slowdown | overview-counter-first | settled | 10/10 | 0 | 25.3 | 26.3 | 0.8 | 0.7 | 6.0 | - | 116.4 | 10 |
| remix3 | chromium | rtt150-down5mbps-up1mbps@cdp+4x-slowdown | overview-counter-first | settled | 10/10 | 0 | 26.0 | 27.3 | 1.8 | 1.4 | 3.8 | - | 54.4 | 67 |
| solidstart | chromium | rtt150-down5mbps-up1mbps@cdp+4x-slowdown | overview-counter-first | settled | 10/10 | 0 | 26.0 | 27.7 | 1.9 | 1.4 | 4.3 | - | 53.2 | 6 |
| sveltekit | chromium | rtt150-down5mbps-up1mbps@cdp+4x-slowdown | overview-counter-first | settled | 10/10 | 0 | 24.2 | 27.2 | 1.9 | 1.6 | 3.7 | - | 35.7 | 12 |
| ripple | chromium | rtt150-down5mbps-up1mbps@cdp+4x-slowdown | overview-counter-first | settled | 10/10 | 0 | 25.0 | 26.4 | 2.7 | 1.6 | 3.3 | - | 21.6 | 6 |
| markless | chromium | rtt150-down5mbps-up1mbps@cdp+4x-slowdown | overview-disclosure | early | 10/10 | 0 | 85.8 | 96.3 | 7.8 | 5.5 | 64.4 | 555.3 | 56.4 | 6 |
| qwik | chromium | rtt150-down5mbps-up1mbps@cdp+4x-slowdown | overview-disclosure | early | 0/10 | input-lost:10 | - | - | - | - | - | - | - | - |
| qwik (tuned) | chromium | rtt150-down5mbps-up1mbps@cdp+4x-slowdown | overview-disclosure | early | 10/10 | 0 | 339.7 | 346.7 | 8.6 | 5.3 | 318.9 | 649.5 | 66.5 | 14 |
| octane | chromium | rtt150-down5mbps-up1mbps@cdp+4x-slowdown | overview-disclosure | early | 0/10 | input-lost:10 | - | - | - | - | - | - | - | - |
| react-router | chromium | rtt150-down5mbps-up1mbps@cdp+4x-slowdown | overview-disclosure | early | 0/10 | input-lost:10 | - | - | - | - | - | - | - | - |
| remix3 | chromium | rtt150-down5mbps-up1mbps@cdp+4x-slowdown | overview-disclosure | early | 0/10 | input-lost:10 | - | - | - | - | - | - | - | - |
| solidstart | chromium | rtt150-down5mbps-up1mbps@cdp+4x-slowdown | overview-disclosure | early | 10/10 | 0 | 82.3 | 85.7 | 4.7 | 3.0 | 62.9 | 548.1 | 53.2 | 6 |
| sveltekit | chromium | rtt150-down5mbps-up1mbps@cdp+4x-slowdown | overview-disclosure | early | 1/10 | input-lost:9 | 23.0 | 23.0 | 0.0 | 0.0 | 4.0 | 520.1 | 35.7 | 12 |
| ripple | chromium | rtt150-down5mbps-up1mbps@cdp+4x-slowdown | overview-disclosure | early | 0/10 | input-lost:10 | - | - | - | - | - | - | - | - |
| markless | chromium | rtt150-down5mbps-up1mbps@cdp+4x-slowdown | overview-disclosure | settled | 10/10 | 0 | 51.2 | 57.1 | 2.9 | 3.1 | 30.3 | - | 56.4 | 6 |
| qwik | chromium | rtt150-down5mbps-up1mbps@cdp+4x-slowdown | overview-disclosure | settled | 10/10 | 0 | 42.1 | 43.7 | 1.5 | 1.6 | 19.0 | - | 76.5 | 53 |
| qwik (tuned) | chromium | rtt150-down5mbps-up1mbps@cdp+4x-slowdown | overview-disclosure | settled | 10/10 | 0 | 41.5 | 43.9 | 2.3 | 1.9 | 20.4 | - | 70.9 | 36 |
| octane | chromium | rtt150-down5mbps-up1mbps@cdp+4x-slowdown | overview-disclosure | settled | 10/10 | 0 | 26.6 | 28.0 | 0.9 | 0.9 | 7.2 | - | 105.1 | 9 |
| react-router | chromium | rtt150-down5mbps-up1mbps@cdp+4x-slowdown | overview-disclosure | settled | 10/10 | 0 | 26.3 | 27.6 | 0.8 | 0.7 | 6.5 | - | 116.4 | 10 |
| remix3 | chromium | rtt150-down5mbps-up1mbps@cdp+4x-slowdown | overview-disclosure | settled | 10/10 | 0 | 25.2 | 27.4 | 1.7 | 1.1 | 4.8 | - | 54.4 | 67 |
| solidstart | chromium | rtt150-down5mbps-up1mbps@cdp+4x-slowdown | overview-disclosure | settled | 10/10 | 0 | 25.1 | 26.6 | 2.3 | 1.2 | 4.7 | - | 53.2 | 6 |
| sveltekit | chromium | rtt150-down5mbps-up1mbps@cdp+4x-slowdown | overview-disclosure | settled | 10/10 | 0 | 25.2 | 26.7 | 2.0 | 1.1 | 4.5 | - | 35.7 | 12 |
| ripple | chromium | rtt150-down5mbps-up1mbps@cdp+4x-slowdown | overview-disclosure | settled | 10/10 | 0 | 24.8 | 27.0 | 1.4 | 1.3 | 3.9 | - | 21.6 | 6 |
| markless | chromium | rtt150-down5mbps-up1mbps@cdp+4x-slowdown | overview-tab | early | 10/10 | 0 | 86.0 | 93.2 | 5.0 | 12.3 | 65.6 | 565.3 | 56.4 | 6 |
| qwik | chromium | rtt150-down5mbps-up1mbps@cdp+4x-slowdown | overview-tab | early | 0/10 | input-lost:10 | - | - | - | - | - | - | - | - |
| qwik (tuned) | chromium | rtt150-down5mbps-up1mbps@cdp+4x-slowdown | overview-tab | early | 10/10 | 0 | 336.3 | 344.0 | 8.0 | 6.9 | 314.0 | 647.3 | 66.5 | 14 |
| octane | chromium | rtt150-down5mbps-up1mbps@cdp+4x-slowdown | overview-tab | early | 0/10 | input-lost:10 | - | - | - | - | - | - | - | - |
| react-router | chromium | rtt150-down5mbps-up1mbps@cdp+4x-slowdown | overview-tab | early | 0/10 | input-lost:10 | - | - | - | - | - | - | - | - |
| remix3 | chromium | rtt150-down5mbps-up1mbps@cdp+4x-slowdown | overview-tab | early | 0/10 | input-lost:10 | - | - | - | - | - | - | - | - |
| solidstart | chromium | rtt150-down5mbps-up1mbps@cdp+4x-slowdown | overview-tab | early | 10/10 | 0 | 82.0 | 91.2 | 8.3 | 9.9 | 62.9 | 544.3 | 53.2 | 6 |
| sveltekit | chromium | rtt150-down5mbps-up1mbps@cdp+4x-slowdown | overview-tab | early | 0/10 | input-lost:10 | - | - | - | - | - | - | - | - |
| ripple | chromium | rtt150-down5mbps-up1mbps@cdp+4x-slowdown | overview-tab | early | 0/10 | input-lost:10 | - | - | - | - | - | - | - | - |
| markless | chromium | rtt150-down5mbps-up1mbps@cdp+4x-slowdown | overview-tab | settled | 10/10 | 0 | 51.8 | 58.7 | 2.1 | 3.6 | 32.1 | - | 56.4 | 6 |
| qwik | chromium | rtt150-down5mbps-up1mbps@cdp+4x-slowdown | overview-tab | settled | 10/10 | 0 | 44.9 | 50.1 | 2.2 | 2.6 | 25.8 | - | 76.5 | 53 |
| qwik (tuned) | chromium | rtt150-down5mbps-up1mbps@cdp+4x-slowdown | overview-tab | settled | 10/10 | 0 | 46.1 | 48.9 | 2.1 | 2.2 | 26.0 | - | 70.9 | 36 |
| octane | chromium | rtt150-down5mbps-up1mbps@cdp+4x-slowdown | overview-tab | settled | 10/10 | 0 | 27.3 | 27.7 | 0.8 | 0.6 | 7.2 | - | 105.1 | 9 |
| react-router | chromium | rtt150-down5mbps-up1mbps@cdp+4x-slowdown | overview-tab | settled | 10/10 | 0 | 25.9 | 27.0 | 0.8 | 0.7 | 6.4 | - | 116.4 | 10 |
| remix3 | chromium | rtt150-down5mbps-up1mbps@cdp+4x-slowdown | overview-tab | settled | 10/10 | 0 | 24.6 | 26.7 | 0.8 | 1.1 | 4.5 | - | 54.4 | 67 |
| solidstart | chromium | rtt150-down5mbps-up1mbps@cdp+4x-slowdown | overview-tab | settled | 10/10 | 0 | 25.2 | 26.2 | 0.8 | 0.9 | 4.8 | - | 53.2 | 6 |
| sveltekit | chromium | rtt150-down5mbps-up1mbps@cdp+4x-slowdown | overview-tab | settled | 10/10 | 0 | 24.6 | 26.7 | 1.2 | 1.1 | 3.9 | - | 35.7 | 12 |
| ripple | chromium | rtt150-down5mbps-up1mbps@cdp+4x-slowdown | overview-tab | settled | 10/10 | 0 | 24.3 | 26.6 | 1.7 | 1.5 | 3.9 | - | 21.6 | 6 |
| markless | chromium | rtt150-down5mbps-up1mbps@cdp+4x-slowdown | records-search | early | 10/10 | 0 | 88.7 | 92.4 | 3.0 | 2.5 | 85.2 | 600.4 | 54.5 | 6 |
| qwik | chromium | rtt150-down5mbps-up1mbps@cdp+4x-slowdown | records-search | early | 0/10 | input-lost:10 | - | - | - | - | - | - | - | - |
| qwik (tuned) | chromium | rtt150-down5mbps-up1mbps@cdp+4x-slowdown | records-search | early | 10/10 | 0 | 282.2 | 291.8 | 5.6 | 5.8 | 277.4 | 655.7 | 66.3 | 14 |
| octane | chromium | rtt150-down5mbps-up1mbps@cdp+4x-slowdown | records-search | early | 0/10 | input-lost:10 | - | - | - | - | - | - | - | - |
| react-router | chromium | rtt150-down5mbps-up1mbps@cdp+4x-slowdown | records-search | early | 0/10 | input-lost:10 | - | - | - | - | - | - | - | - |
| remix3 | chromium | rtt150-down5mbps-up1mbps@cdp+4x-slowdown | records-search | early | 6/10 | input-lost:4 | 36.5 | 38.1 | 2.3 | 1.5 | 13.6 | 746.6 | 53.6 | 63 |
| solidstart | chromium | rtt150-down5mbps-up1mbps@cdp+4x-slowdown | records-search | early | 10/10 | 0 | 90.9 | 288.7 | 1.4 | 113.3 | 86.4 | 600.1 | 53.3 | 6 |
| sveltekit | chromium | rtt150-down5mbps-up1mbps@cdp+4x-slowdown | records-search | early | 10/10 | 0 | 30.8 | 83.1 | 47.1 | 25.3 | 8.8 | 566.3 | 36.3 | 12 |
| ripple | chromium | rtt150-down5mbps-up1mbps@cdp+4x-slowdown | records-search | early | 0/10 | input-lost:10 | - | - | - | - | - | - | - | - |
| markless | chromium | rtt150-down5mbps-up1mbps@cdp+4x-slowdown | records-search | settled | 10/10 | 0 | 88.7 | 91.0 | 1.6 | 1.4 | 84.5 | - | 54.5 | 6 |
| qwik | chromium | rtt150-down5mbps-up1mbps@cdp+4x-slowdown | records-search | settled | 10/10 | 0 | 105.8 | 107.5 | 1.4 | 1.2 | 100.7 | - | 78.3 | 55 |
| qwik (tuned) | chromium | rtt150-down5mbps-up1mbps@cdp+4x-slowdown | records-search | settled | 10/10 | 0 | 105.1 | 106.6 | 0.7 | 0.9 | 101.2 | - | 71.2 | 36 |
| octane | chromium | rtt150-down5mbps-up1mbps@cdp+4x-slowdown | records-search | settled | 10/10 | 0 | 33.7 | 35.0 | 1.5 | 0.9 | 11.8 | - | 105.1 | 9 |
| react-router | chromium | rtt150-down5mbps-up1mbps@cdp+4x-slowdown | records-search | settled | 10/10 | 0 | 32.2 | 33.0 | 1.5 | 1.3 | 9.5 | - | 116.7 | 10 |
| remix3 | chromium | rtt150-down5mbps-up1mbps@cdp+4x-slowdown | records-search | settled | 10/10 | 0 | 35.1 | 36.7 | 0.6 | 0.9 | 13.6 | - | 53.7 | 63 |
| solidstart | chromium | rtt150-down5mbps-up1mbps@cdp+4x-slowdown | records-search | settled | 10/10 | 0 | 32.5 | 33.1 | 1.2 | 0.8 | 9.8 | - | 53.3 | 6 |
| sveltekit | chromium | rtt150-down5mbps-up1mbps@cdp+4x-slowdown | records-search | settled | 10/10 | 0 | 30.7 | 31.6 | 0.5 | 0.6 | 8.5 | - | 36.3 | 12 |
| ripple | chromium | rtt150-down5mbps-up1mbps@cdp+4x-slowdown | records-search | settled | 10/10 | 0 | 29.9 | 31.1 | 0.9 | 0.9 | 8.4 | - | 21.7 | 6 |
| markless | chromium | rtt150-down5mbps-up1mbps@cdp+4x-slowdown | records-dialog-open | early | 10/10 | 0 | 92.5 | 96.9 | 7.9 | 4.3 | 82.5 | 583.1 | 54.5 | 6 |
| qwik | chromium | rtt150-down5mbps-up1mbps@cdp+4x-slowdown | records-dialog-open | early | 0/10 | input-lost:10 | - | - | - | - | - | - | - | - |
| qwik (tuned) | chromium | rtt150-down5mbps-up1mbps@cdp+4x-slowdown | records-dialog-open | early | 10/10 | 0 | 358.8 | 364.7 | 7.7 | 6.0 | 352.6 | 707.5 | 66.3 | 14 |
| octane | chromium | rtt150-down5mbps-up1mbps@cdp+4x-slowdown | records-dialog-open | early | 0/10 | input-lost:10 | - | - | - | - | - | - | - | - |
| react-router | chromium | rtt150-down5mbps-up1mbps@cdp+4x-slowdown | records-dialog-open | early | 0/10 | input-lost:10 | - | - | - | - | - | - | - | - |
| remix3 | chromium | rtt150-down5mbps-up1mbps@cdp+4x-slowdown | records-dialog-open | early | 0/10 | input-lost:10 | - | - | - | - | - | - | - | - |
| solidstart | chromium | rtt150-down5mbps-up1mbps@cdp+4x-slowdown | records-dialog-open | early | 10/10 | 0 | 93.9 | 100.0 | 4.8 | 3.5 | 70.2 | 588.9 | 53.3 | 6 |
| sveltekit | chromium | rtt150-down5mbps-up1mbps@cdp+4x-slowdown | records-dialog-open | early | 6/10 | input-lost:4 | 36.4 | 37.8 | 0.7 | 0.9 | 13.5 | 572.3 | 36.3 | 12 |
| ripple | chromium | rtt150-down5mbps-up1mbps@cdp+4x-slowdown | records-dialog-open | early | 0/10 | input-lost:10 | - | - | - | - | - | - | - | - |
| markless | chromium | rtt150-down5mbps-up1mbps@cdp+4x-slowdown | records-dialog-open | settled | 10/10 | 0 | 89.2 | 98.4 | 6.9 | 4.8 | 81.1 | - | 54.5 | 6 |
| qwik | chromium | rtt150-down5mbps-up1mbps@cdp+4x-slowdown | records-dialog-open | settled | 10/10 | 0 | 123.3 | 126.4 | 2.2 | 2.4 | 118.2 | - | 78.3 | 55 |
| qwik (tuned) | chromium | rtt150-down5mbps-up1mbps@cdp+4x-slowdown | records-dialog-open | settled | 10/10 | 0 | 121.5 | 126.4 | 4.3 | 3.2 | 116.5 | - | 71.2 | 36 |
| octane | chromium | rtt150-down5mbps-up1mbps@cdp+4x-slowdown | records-dialog-open | settled | 10/10 | 0 | 45.4 | 46.0 | 0.6 | 0.6 | 21.5 | - | 105.1 | 9 |
| react-router | chromium | rtt150-down5mbps-up1mbps@cdp+4x-slowdown | records-dialog-open | settled | 10/10 | 0 | 42.0 | 43.0 | 1.2 | 0.9 | 17.6 | - | 116.7 | 10 |
| remix3 | chromium | rtt150-down5mbps-up1mbps@cdp+4x-slowdown | records-dialog-open | settled | 10/10 | 0 | 45.8 | 46.6 | 1.0 | 0.6 | 22.3 | - | 53.6 | 63 |
| solidstart | chromium | rtt150-down5mbps-up1mbps@cdp+4x-slowdown | records-dialog-open | settled | 10/10 | 0 | 39.2 | 41.0 | 0.7 | 1.0 | 15.5 | - | 53.3 | 6 |
| sveltekit | chromium | rtt150-down5mbps-up1mbps@cdp+4x-slowdown | records-dialog-open | settled | 10/10 | 0 | 38.1 | 39.0 | 0.5 | 0.6 | 14.0 | - | 36.3 | 12 |
| ripple | chromium | rtt150-down5mbps-up1mbps@cdp+4x-slowdown | records-dialog-open | settled | 10/10 | 0 | 37.8 | 39.3 | 1.0 | 0.9 | 14.3 | - | 21.7 | 6 |
| markless | chromium | rtt150-down5mbps-up1mbps@cdp+4x-slowdown | settings-submit | settled | 10/10 | 0 | 445.9 | 551.9 | 42.2 | 51.1 | 433.7 | - | 55.3 | 6 |
| qwik | chromium | rtt150-down5mbps-up1mbps@cdp+4x-slowdown | settings-submit | settled | 10/10 | 0 | 431.2 | 518.3 | 66.8 | 45.3 | 417.1 | - | 78.5 | 56 |
| qwik (tuned) | chromium | rtt150-down5mbps-up1mbps@cdp+4x-slowdown | settings-submit | settled | 10/10 | 0 | 418.8 | 486.2 | 47.3 | 31.9 | 409.9 | - | 71.4 | 37 |
| octane | chromium | rtt150-down5mbps-up1mbps@cdp+4x-slowdown | settings-submit | settled | 10/10 | 0 | 433.5 | 638.0 | 69.1 | 102.0 | 423.0 | - | 105.1 | 9 |
| react-router | chromium | rtt150-down5mbps-up1mbps@cdp+4x-slowdown | settings-submit | settled | 10/10 | 0 | 442.8 | 483.8 | 20.0 | 22.7 | 434.0 | - | 116.4 | 11 |
| remix3 | chromium | rtt150-down5mbps-up1mbps@cdp+4x-slowdown | settings-submit | settled | 10/10 | 0 | 400.9 | 468.5 | 26.9 | 35.2 | 387.7 | - | 53.4 | 63 |
| solidstart | chromium | rtt150-down5mbps-up1mbps@cdp+4x-slowdown | settings-submit | settled | 10/10 | 0 | 410.3 | 458.0 | 33.0 | 23.1 | 396.9 | - | 52.9 | 6 |
| sveltekit | chromium | rtt150-down5mbps-up1mbps@cdp+4x-slowdown | settings-submit | settled | 10/10 | 0 | 416.8 | 495.9 | 28.2 | 37.2 | 405.9 | - | 35.3 | 12 |
| ripple | chromium | rtt150-down5mbps-up1mbps@cdp+4x-slowdown | settings-submit | settled | 10/10 | 0 | 421.6 | 472.7 | 16.3 | 29.8 | 410.4 | - | 21.2 | 6 |
| markless | chromium | rtt150-down5mbps-up1mbps@cdp+4x-slowdown | nav-overview-to-records | early | 10/10 | 0 | 672.9 | 674.4 | 2.1 | 6.3 | 642.1 | 1136.7 | 91.3 | 6 |
| qwik | chromium | rtt150-down5mbps-up1mbps@cdp+4x-slowdown | nav-overview-to-records | early | 10/10 | 0 | 257.0 | 258.7 | 3.7 | 2.9 | 246.5 | 562.6 | 95.5 | 12 |
| qwik (tuned) | chromium | rtt150-down5mbps-up1mbps@cdp+4x-slowdown | nav-overview-to-records | early | 10/10 | 0 | 600.8 | 893.6 | 300.2 | 156.2 | 573.7 | 901.6 | 71.3 | 14 |
| octane | chromium | rtt150-down5mbps-up1mbps@cdp+4x-slowdown | nav-overview-to-records | early | 10/10 | 0 | 381.5 | 388.0 | 6.3 | 4.3 | 204.2 | 841.5 | 115.9 | 6 |
| react-router | chromium | rtt150-down5mbps-up1mbps@cdp+4x-slowdown | nav-overview-to-records | early | 10/10 | 0 | 402.0 | 414.4 | 9.2 | 7.0 | 209.6 | 871.6 | 233.1 | 9 |
| remix3 | chromium | rtt150-down5mbps-up1mbps@cdp+4x-slowdown | nav-overview-to-records | early | 10/10 | 0 | 466.8 | 600.5 | 56.1 | 72.7 | 215.1 | 962.4 | 108.2 | 67 |
| solidstart | chromium | rtt150-down5mbps-up1mbps@cdp+4x-slowdown | nav-overview-to-records | early | 10/10 | 0 | 451.7 | 457.1 | 7.3 | 4.9 | 448.1 | 912.8 | 106.4 | 6 |
| sveltekit | chromium | rtt150-down5mbps-up1mbps@cdp+4x-slowdown | nav-overview-to-records | early | 10/10 | 0 | 379.7 | 391.2 | 17.6 | 11.7 | 209.2 | 828.8 | 71.6 | 11 |
| ripple | chromium | rtt150-down5mbps-up1mbps@cdp+4x-slowdown | nav-overview-to-records | early | 10/10 | 0 | 385.3 | 396.8 | 7.4 | 6.2 | 207.8 | 848.0 | 38.5 | 6 |
| markless | chromium | rtt150-down5mbps-up1mbps@cdp+4x-slowdown | nav-overview-to-records | settled | 10/10 | 0 | 671.0 | 880.3 | 8.6 | 120.6 | 639.3 | - | 91.3 | 6 |
| qwik | chromium | rtt150-down5mbps-up1mbps@cdp+4x-slowdown | nav-overview-to-records | settled | 10/10 | 0 | 269.1 | 270.4 | 3.8 | 2.9 | 241.3 | - | 78.3 | 53 |
| qwik (tuned) | chromium | rtt150-down5mbps-up1mbps@cdp+4x-slowdown | nav-overview-to-records | settled | 10/10 | 0 | 265.4 | 270.7 | 4.2 | 3.2 | 237.8 | - | 71.3 | 36 |
| octane | chromium | rtt150-down5mbps-up1mbps@cdp+4x-slowdown | nav-overview-to-records | settled | 10/10 | 0 | 76.4 | 79.1 | 1.5 | 1.3 | 48.2 | - | 105.1 | 9 |
| react-router | chromium | rtt150-down5mbps-up1mbps@cdp+4x-slowdown | nav-overview-to-records | settled | 10/10 | 0 | 245.9 | 248.7 | 2.8 | 2.6 | 218.1 | - | 117.9 | 10 |
| remix3 | chromium | rtt150-down5mbps-up1mbps@cdp+4x-slowdown | nav-overview-to-records | settled | 10/10 | 0 | 262.4 | 290.3 | 4.1 | 14.2 | 234.3 | - | 55.8 | 67 |
| solidstart | chromium | rtt150-down5mbps-up1mbps@cdp+4x-slowdown | nav-overview-to-records | settled | 10/10 | 0 | 245.7 | 249.9 | 2.6 | 2.5 | 218.6 | - | 55.0 | 6 |
| sveltekit | chromium | rtt150-down5mbps-up1mbps@cdp+4x-slowdown | nav-overview-to-records | settled | 10/10 | 0 | 233.1 | 234.9 | 4.2 | 2.9 | 203.9 | - | 38.0 | 12 |
| ripple | chromium | rtt150-down5mbps-up1mbps@cdp+4x-slowdown | nav-overview-to-records | settled | 10/10 | 0 | 390.3 | 397.5 | 7.9 | 5.0 | 209.9 | - | 38.5 | 6 |
