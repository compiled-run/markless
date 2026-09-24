# Cold docs comparison

Generated from actual Nitro builds in Chrome. Fresh context per first interaction; HTTP cache disabled; service workers blocked. HTTP/2 over local TLS, Brotli quality 5 for JS and HTML. Constrained: 150 ms RTT, 5 Mbps down, 1 Mbps up, 4× CPU. Ten visits per route/condition; three actions per successful visit.

First-response timing is captured trusted click to expected DOM mutation, not compositor presentation. p95 uses nearest rank; with ten samples it is the largest observation. The baseline predates early event capture; the comparison covers the combined packing, intent-preload and capture changes.

| Route / condition | Failed visits before → after | Framework JS requests before → after | First median ms before → after | First p95 ms before → after | Median JS transfer KiB before → after |
|---|---:|---:|---:|---:|---:|
| state-counter/normal | 0/10 → 0/10 | 758.0 → 5.0 | 36.7 → 38.6 | 37.3 → 41.6 | 891.4 → 229.1 |
| computed-total/normal | 0/10 → 0/10 | 756.0 → 5.0 | 37.4 → 39.2 | 39.9 → 41.2 | 888.4 → 227.8 |
| mode-select/normal | 0/10 → 0/10 | 766.0 → 5.0 | 42.7 → 40.3 | 46.2 → 44.7 | 896.9 → 236.1 |
| accordion/normal | 0/10 → 0/10 | 1274.0 → 5.0 | 75.8 → 63.3 | 78.0 → 69.7 | 1139.2 → 228.5 |
| state-counter/constrained | 0/10 → 0/10 | 758.0 → 5.0 | 67.6 → 70.6 | 75.4 → 76.7 | 891.4 → 229.1 |
| computed-total/constrained | 0/10 → 0/10 | 756.0 → 5.0 | 65.9 → 74.1 | 72.1 → 89.1 | 888.3 → 227.8 |
| mode-select/constrained | 0/10 → 0/10 | 766.0 → 5.0 | 1556.0 → 81.5 | 1566.7 → 90.5 | 896.9 → 236.1 |
| accordion/constrained | 0/10 → 0/10 | 1274.0 → 5.0 | 3840.2 → 185.3 | 3858.4 → 194.2 | 1139.3 → 228.5 |

The site also requests three small scripts outside the framework packs. HTTP cache hits: baseline 0, packed 0.

Raw baseline: /private/tmp/markless-docs-cold-uPSxFi/results.json

Raw packed: /private/tmp/markless-docs-cold-eEFnd5/results.json

The companion JSON retains MAD, repeat timings, pending script counts, page errors and analyzer preload-integrity evaluations. Those evaluations check action-window fetches; they do not prove that an in-flight preload had finished before input. This comparison does not establish earliest-exposure, failed-delivery, offline or navigation acceptance.
