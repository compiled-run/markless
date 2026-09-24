# Graph demand experiment

The subscription index was removed after measurement. It eliminated unrelated subscription checks, but none of the first or repeat median gains cleared the predeclared threshold. The candidate also increased the music-player SSR download from the earlier 84,769 to 85,082 gzip bytes, above its 84,771-byte budget. No budget was raised. The candidate and its test source are retained as rejected-subscription-index.patch and rejected-subscription-index.test.txt.

The separate computed eligibility guard remains: records with no compute function skip dependency inspection. Its focused regression observes zero dependency-property reads across three writes instead of 100 on each write. The combined timing below does not isolate a latency benefit for that guard. The retained build must be checked separately.

## Cold Chrome comparison

Two sequential saved builds, ten fresh contexts per route and condition, three actions each, HTTP cache disabled and service workers blocked. Local HTTP/2 and Brotli 5 for HTML/JS. Constrained condition: 150 ms RTT, 5 Mbps down, 1 Mbps up and 4× CPU. No owned builds or tests ran concurrently. Timing measures trusted click to expected DOM mutation, not paint. The acceptance threshold is max(10 ms, 10% of the prior median, twice the larger MAD).

| Route / condition | First median ms, before → candidate | Repeat median ms, before → candidate |
|---|---:|---:|
| state-counter/normal | 38.0 → 38.1 | 15.1 → 15.2 |
| computed-total/normal | 37.2 → 37.4 | 15.7 → 15.7 |
| mode-select/normal | 40.2 → 40.2 | 16.1 → 16.0 |
| accordion/normal | 57.7 → 56.3 | 21.7 → 21.2 |
| state-counter/constrained | 67.4 → 65.3 | 14.6 → 14.5 |
| computed-total/constrained | 67.6 → 66.3 | 15.6 → 15.2 |
| mode-select/constrained | 78.2 → 76.6 | 18.0 → 17.6 |
| accordion/constrained | 162.5 → 151.1 | 40.5 → 37.8 |

Each build passed 80 visits and 240 actions with five framework requests per visit, zero page errors or failed actions, zero HTTP cache hits, no new script requests after input, and no pending script transfers at input. The three site scripts are separate from the framework count. These observations do not prove that the earliest possible click can never wait for an unfinished preload.

The JSON preserves individual second/third-action statistics, MAD, thresholds, raw result paths and build metadata. The tested candidate is not the retained source tree.
