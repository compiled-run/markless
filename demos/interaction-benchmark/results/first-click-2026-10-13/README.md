# First click while the page loads

Each visit opens a fresh browser on a deployed build and clicks a control before the page has finished loading. A click counts as answered when the expected change appears on screen. A lost click is one the page never answered. Three controls are tested: the counter, the disclosure and the tab on the Overview route. Every framework builds the same app from [CONTRACT.md](../../CONTRACT.md).

30 visits per control, browser and profile. Runs from 2026-10-13: this folder (Chromium and WebKit, normal speed) and [first-click-2026-10-13-slow](../first-click-2026-10-13-slow) (Chromium with 150 ms latency, 5 Mbps and a 4x slower CPU).

| Framework | Normal speed, Chromium + WebKit | Slow, Chromium | Median time to answer (normal / slow, Chromium) |
| --- | ---: | ---: | ---: |
| Markless | 180 / 180 | 90 / 90 | 32 ms / 86 ms |
| SolidStart | 179 / 180 | 90 / 90 | 24 ms / 86 ms |
| Qwik (tuned) | 180 / 180 | 90 / 90 | 110 ms / 337 ms |
| SvelteKit | 105 / 180 | 9 / 90 | 23 ms / 28 ms |
| React Router | 96 / 180 | 1 / 90 | 24 ms / 48 ms |
| Qwik | 21 / 180 | 0 / 90 | - |
| Remix 3 | 7 / 180 | 0 / 90 | 23 ms / - |
| Ripple | 3 / 180 | 0 / 90 | - |
| Octane | 0 / 180 | 0 / 90 | - |

SolidStart's one miss is a page-load error, not a lost click. Every other miss is a lost click. Times count only answered clicks, so a framework that answers few clicks can still show a fast median.

Not covered: WebKit on the slow profile (the slow network can only be applied to deployed sites through Chromium's own throttling), and clicks after the page has finished loading (see [public-2026-09-22](../public-2026-09-22), 10 visits, where Markless answers in about 31 ms and most others in about 23 ms).

Full statistics: `summary.md` in each folder. Every visit, failures included: `results.jsonl` and `raw.jsonl`.
