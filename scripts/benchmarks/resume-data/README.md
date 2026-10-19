# Resume data and handler table weights

Tools that weigh what a served page carries for resume: the html, its `markless/state` and `markless/view` data scripts split by record list, the JavaScript downloaded at load (split into module families from the build's `byte-attribution.json`), and the JavaScript executed at load (V8 precise coverage, OR-ed across takes until a take adds nothing).

```sh
node scripts/benchmarks/resume-data/measure-page.mjs <url> [--json]          # one served page
node scripts/benchmarks/resume-data/measure-apps.mjs --out results.json     # build, serve and weigh the demos and markless.dev
MARKLESS_SHADCN_ADMIN_DIR=<dir> node scripts/benchmarks/resume-data/measure-apps.mjs ...   # also the shadcn-admin port
node scripts/benchmarks/resume-data/table.mjs before.json [after.json]      # markdown table, before -> after
```

`measure-apps.mjs` builds every app with `MARKLESS_CONSUMER_BUILD=1` (no execution log). The shadcn-admin port lives outside this repository (markless-migrate `examples/shadcn-admin-markless`); measure a copy whose `node_modules/@markless/*` framework packages link to this tree and whose `@markless/ui` is a real copy, and never run `pnpm` inside it (pnpm re-installs through the links).

Units: kB is 1,000 bytes. "Raw" is the uncompressed size, "gzip" is level 9. Executed at load counts characters of same-origin scripts (inline scripts included) that V8 reports as run before the page goes quiet.

The per-row cost of resume data is gated by perf guard G13 (`scripts/benchmarks/perf-guards`), on the `packages/bundler/fixtures/vite-ssr-resume-rows` fixture.

## Measured on main 11bacc44 (2026-10-19), before the resume data changes

| App              | Page             | HTML kB (raw / gzip) | Resume data kB (raw / gzip) | JS downloaded at load kB (raw / gzip) | JS executed at load (bytes) |
| ---------------- | ---------------- | -------------------- | --------------------------- | ------------------------------------- | --------------------------- |
| static-router    | `/`              | 2.1 / 0.9            | 0.0 / 0.0                   | 10.1 / 4.8                            | 5491                        |
| static-router    | `/counter`       | 7.6 / 3.0            | 0.9 / 0.5                   | 100.4 / 33.5                          | 7232                        |
| music-player-ssr | `/`              | 22.6 / 5.3           | 13.4 / 2.1                  | 170.5 / 43.2                          | 2686                        |
| live-feed-ssr    | `/?latency=0`    | 9.1 / 3.5            | 2.3 / 0.9                   | 141.1 / 44.7                          | 2694                        |
| music-player     | `/`              | 7.0 / 2.2            | 0.0 / 0.0                   | 463.0 / 90.0                          | 659                         |
| live-feed        | `/?latency=0`    | 5.8 / 2.4            | 0.0 / 0.0                   | 252.0 / 73.3                          | 6974                        |
| markless.dev     | `/`              | 2759.9 / 703.8       | 560.8 / 31.0                | 3544.8 / 873.2                        | 204167                      |
| markless.dev     | `/start/new-app` | 1474.7 / 279.4       | 524.8 / 29.6                | 2480.6 / 531.4                        | 50967                       |
| markless.dev     | `/reference`     | 598.7 / 47.4         | 421.1 / 19.9                | 769.5 / 144.5                         | 49806                       |
| markless.dev     | `/ui/accordion`  | 987.6 / 73.8         | 676.2 / 37.8                | 1932.0 / 317.3                        | 42493                       |
| markless.dev     | `/ui/combobox`   | 876.1 / 63.9         | 653.3 / 34.0                | 1764.9 / 269.8                        | 40686                       |
| shadcn-admin     | `/users`         | 1274.1 / 69.7        | 679.1 / 36.2                | 829.8 / 166.6                         | 10506                       |
| shadcn-admin     | `/`              | 318.6 / 29.7         | 133.1 / 9.7                 | 384.2 / 88.1                          | 17048                       |
| shadcn-admin     | `/sign-in`       | 52.6 / 10.0          | 26.7 / 3.1                  | 326.5 / 87.1                          | 4890                        |

The CSR demos (music-player, live-feed) are prerendered: their resume records live in JavaScript render data, not in the html.

### Where the resume data goes (largest record lists, records and raw kB)

| App              | Page            | Largest lists                                                                                                   |
| ---------------- | --------------- | --------------------------------------------------------------------------------------------------------------- |
| music-player-ssr | `/`             | view.domUpdates 35, 6.2; state.cells 10, 3.0; view.locators 30, 2.3; view.branches 1, 0.9                       |
| live-feed-ssr    | `/?latency=0`   | state.cells 3, 0.6; view.asyncBoundaries 1, 0.5; state.computed 1, 0.4; view.domUpdates 2, 0.3                  |
| markless.dev     | `/`             | view.domUpdates 599, 159.2; state.computed 355, 142.3; state.sharedDefinitions 70, 110.2; state.cells 156, 77.1 |
| markless.dev     | `/ui/accordion` | view.domUpdates 737, 188.5; state.computed 469, 179.5; state.sharedDefinitions 95, 143.0; state.cells 182, 64.4 |
| shadcn-admin     | `/users`        | state.computed 1249, 305.0; view.domUpdates 1352, 200.2; view.locators 841, 64.5; view.events 247, 48.3         |

Each composed instance repeats its whole record per row: on `/users` the 50 row slots each carry the same 25 records, differing only in the instance number (`c0:p45:computed:rowState`, `c45:h2`) and the element index. On markless.dev the repeated part is a keyed row segment (`r:Collections:`) and long shared-definition ids.

On the G13 fixture, a keyed `@for` row costs 1,298 B of resume data (74 B gzip, 8 records) and a fixed row slot 3,631 B (171 B gzip, 25 records).

### Where the JavaScript downloaded at load goes (raw kB)

| App              | Page            | handler code | handler lookup tables | handler startup wrappers | render data | runtime |
| ---------------- | --------------- | ------------ | --------------------- | ------------------------ | ----------- | ------- |
| static-router    | `/counter`      | 0.6          | 0.6                   | 0.0                      | 0.0         | 83.4    |
| music-player-ssr | `/`             | 14.4         | 41.1                  | 0.0                      | 0.0         | 102.9   |
| live-feed-ssr    | `/?latency=0`   | 2.2          | 8.8                   | 0.4                      | 0.0         | 122.2   |
| music-player     | `/`             | 12.3         | 35.1                  | 0.0                      | 47.2        | 178.7   |
| live-feed        | `/?latency=0`   | 3.0          | 7.5                   | 0.4                      | 16.5        | 195.2   |
| markless.dev     | `/`             | 190.3        | 212.8                 | 25.1                     | 1386.2      | 332.4   |
| markless.dev     | `/ui/accordion` | 196.8        | 279.6                 | 20.5                     | 992.3       | 332.4   |
| shadcn-admin     | `/users`        | 234.1        | 212.9                 | 54.3                     | 0.0         | 111.7   |
| shadcn-admin     | `/`             | 88.6         | 100.3                 | 27.4                     | 0.0         | 104.5   |

Handler lookup tables are the per-module symbol resolvers and `?markless-symbols` tables: one entry per handler, each repeating the symbol id, its chunk specifier (twice) and its export name. Handler startup wrappers are the `symbol:<n>:entry` modules. Family bytes share each chunk out by rendered module length, so they are estimates; the totals are exact.
