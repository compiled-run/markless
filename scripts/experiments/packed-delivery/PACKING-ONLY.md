# Packing-only docs comparison

Generated from actual Nitro builds in Chrome. Fresh context per first interaction; HTTP cache disabled; service workers blocked. HTTP/2 over local TLS, Brotli quality 5 for JS and HTML. Constrained: 150 ms RTT, 5 Mbps down, 1 Mbps up, 4× CPU. Ten visits per route/condition; three actions per successful visit.

First-response timing is captured trusted click to expected DOM mutation, not compositor presentation. p95 uses nearest rank; with ten samples it is the largest observation. Both builds use current early event capture and destination intent preloading. The controlled option is experimentalNativePacking, including its compiler import emission and native bundle grouping.

| Route / condition | Failed visits before → after | Framework JS requests before → after | First median ms before → after | First p95 ms before → after | Median JS transfer KiB before → after |
|---|---:|---:|---:|---:|---:|
| state-counter/normal | 0/10 → 0/10 | 286.0 → 5.0 | 37.0 → 38.3 | 40.1 → 40.2 | 230.6 → 229.1 |
| computed-total/normal | 0/10 → 0/10 | 278.0 → 5.0 | 36.4 → 39.1 | 38.5 → 41.9 | 223.3 → 227.8 |
| mode-select/normal | 0/10 → 0/10 | 370.0 → 5.0 | 42.3 → 39.5 | 43.7 → 42.1 | 255.0 → 236.1 |
| accordion/normal | 0/10 → 0/10 | 582.0 → 5.0 | 75.0 → 62.7 | 82.0 → 63.9 | 372.7 → 228.5 |
| state-counter/constrained | 0/10 → 0/10 | 286.0 → 5.0 | 68.3 → 68.8 | 75.0 → 73.5 | 230.6 → 229.1 |
| computed-total/constrained | 0/10 → 0/10 | 278.0 → 5.0 | 72.6 → 70.2 | 78.4 → 74.9 | 223.3 → 227.8 |
| mode-select/constrained | 0/10 → 0/10 | 370.0 → 5.0 | 1500.8 → 77.8 | 1510.5 → 82.2 | 255.0 → 236.1 |
| accordion/constrained | 0/10 → 0/10 | 582.0 → 5.0 | 4913.1 → 182.4 | 4924.8 → 190.5 | 372.8 → 228.5 |

The site also requests three small scripts outside the framework packs. HTTP cache hits: baseline 0, packed 0.

Raw baseline: /private/tmp/markless-docs-cold-ry5ttW/results.json

Raw packed: /private/tmp/markless-docs-cold-Kw8QAm/results.json

The companion JSON retains MAD, repeat timings, pending script counts, page errors and analyzer preload-integrity evaluations. Those evaluations check action-window fetches; they do not prove that an in-flight preload had finished before input. This comparison does not establish earliest-exposure, failed-delivery, offline or navigation acceptance.
