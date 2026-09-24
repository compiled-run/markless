# Same-pack import experiment

Later follow-up: [COMBINED-DEMAND.md](COMBINED-DEMAND.md) records a retained combination of this mechanism and MDX module-promise reuse. The standalone timing rejection below remains unchanged.

The candidate replaces a native import back into the current pack with a deferred call to its existing lazy initializer. Cross-pack imports and packs containing top-level await keep native imports. It passed the semantic and consuming-app checks, but is set aside because no first/repeat latency improvement clears the predeclared threshold. The production source returns to the prior import rewrite.

Each build completed 80 cold visits and 240 trusted interactions across four docs routes, with HTTP cache disabled and service workers blocked. Five framework script requests per visit; no failed visits, page errors, HTTP cache hits, click-triggered script requests or pending script requests at input. Three other site scripts are separate from that framework count.

| Route / condition | First click, before → candidate (ms) | Repeats, before → candidate (ms) |
|---|---:|---:|
| state-counter/normal | 37.9 → 37.5 | 15.0 → 16.1 |
| computed-total/normal | 37.4 → 37.1 | 15.3 → 15.5 |
| mode-select/normal | 40.4 → 40.4 | 16.5 → 16.0 |
| accordion/normal | 56.1 → 55.5 | 22.2 → 19.6 |
| state-counter/constrained | 64.2 → 60.9 | 15.0 → 15.3 |
| computed-total/constrained | 66.2 → 65.7 | 15.9 → 15.2 |
| mode-select/constrained | 75.0 → 72.9 | 17.8 → 17.1 |
| accordion/constrained | 147.6 → 140.6 | 39.0 → 29.8 |

Ten visits per route/condition; two repeats per visit. Local HTTP/2 with Brotli quality 5 HTML and JS. Constrained means 150 ms RTT, 5 Mbps down, 1 Mbps up, and 4× CPU. The acceptance threshold is max(10 ms, 10% of prior median, twice the larger MAD). The largest repeat improvement is 9.2 ms against a 10 ms threshold; no measured regression exceeds the threshold either. These are captured-click-to-expected-DOM-mutation times, not paint or earliest-visible-control tests.

Candidate was measured before the clean comparison build, in sequential groups rather than an interleaved order. No owned CPU-heavy work overlapped these runs. An abandoned process found during the earlier attempt was stopped before both included runs; the contaminated first attempt is excluded. The companion JSON retains paths, metadata, phase statistics and the exclusion.

The candidate source remains recoverable from the rejected patch and saved candidate output. Tests retain deferred initialization, identity, live-export and failure coverage for nested imports. The user-facing localhost preview stays on its prior immutable build. No timing acceptance is inferred from coverage, initializer counts or the absence of network fetches.
