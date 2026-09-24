# Holdout lane: 2026-09-24

Source: `c8da68b3`. Browsers: webkit. Profiles: normal, constrained.

Columns: load requests / wire KB (brotli via the runner proxy) / JS files at load (preloaded, preloaded but never executed at load) / V8 characters executed at load (Chromium) / first contentful paint / early clicks that survived out of those with an observable response (lost) and their median input-to-response ms / settled first click input-to-response median ms / JS fetched by first clicks (requests, KB, summed over controls) / internal-link navigations: median serial request rounds and input-to-URL-response ms.

## sr-app

client-only (render() into #app), every shipped @markless/ui family. Routes: `/`.

| variant | browser | profile | load req | load KB | JS files (pre / unused) | exec chars | FCP ms | early survived (lost) | early click ms | first click ms | click JS req / KB | nav rounds | nav ms |
| --- | --- | --- | ---: | ---: | --- | ---: | ---: | --- | ---: | ---: | --- | ---: | ---: |
| default | webkit | normal | 2398 | 918.2 | 2381 (2380 / -) | - | 4645 | 0/0 (0) | - | - | 0 / 0.0 | 230 | 286 |
| default | webkit | constrained | 2398 | 918.2 | 2381 (2380 / -) | - | 6328 | 0/0 (0) | - | - | 0 / 0.0 | 224 | 455 |
| packed | webkit | normal | 4 | 550.6 | 2 (1 / -) | - | 390 | 0/0 (0) | - | - | 0 / 0.0 | 3 | 42 |
| packed | webkit | constrained | 4 | 550.6 | 2 (1 / -) | - | 1909 | 0/0 (0) | - | - | 0 / 0.0 | 2 | 366 |

## live-feed-ssr

SSR + router, async computed feed behind @try/@pending, keyed list. Routes: `/`.

| variant | browser | profile | load req | load KB | JS files (pre / unused) | exec chars | FCP ms | early survived (lost) | early click ms | first click ms | click JS req / KB | nav rounds | nav ms |
| --- | --- | --- | ---: | ---: | --- | ---: | ---: | --- | ---: | ---: | --- | ---: | ---: |
| default | webkit | normal | 73 | 92.5 | 71 (71 / -) | - | 263 | 0/0 (0) | - | - | 0 / 0.0 | - | - |
| default | webkit | constrained | 73 | 92.5 | 71 (71 / -) | - | 807 | 0/0 (0) | - | - | 0 / 0.0 | - | - |
| packed | webkit | normal | 20 | 80.7 | 18 (18 / -) | - | 261 | 0/0 (0) | - | - | 0 / 0.0 | - | - |
| packed | webkit | constrained | 20 | 80.7 | 18 (18 / -) | - | 761 | 0/0 (0) | - | - | 0 / 0.0 | - | - |

## router-app

SSR + router multi-route: TSRX pages, MDX catch-all with an interactive island, streamed @pending page, Link navigation. Routes: `/`, `/harbor`, `/docs/getting-started`.

| variant | browser | profile | load req | load KB | JS files (pre / unused) | exec chars | FCP ms | early survived (lost) | early click ms | first click ms | click JS req / KB | nav rounds | nav ms |
| --- | --- | --- | ---: | ---: | --- | ---: | ---: | --- | ---: | ---: | --- | ---: | ---: |
| default | webkit | normal | 77 | 81.7 | 76 (76 / -) | - | 17 | 0/0 (0) | - | - | 0 / 0.0 | 0 | 48 |
| default | webkit | constrained | 77 | 81.7 | 76 (76 / -) | - | 503 | 0/0 (0) | - | - | 0 / 0.0 | 0 | 48 |
| packed | webkit | normal | 16 | 68.2 | 15 (15 / -) | - | 17 | 0/0 (0) | - | - | 0 / 0.0 | 0 | 40 |
| packed | webkit | constrained | 16 | 68.2 | 15 (15 / -) | - | 501 | 0/0 (0) | - | - | 0 / 0.0 | 0 | 39 |
