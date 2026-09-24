# Holdout lane: 2026-09-24

Source: `c8da68b3`. Browsers: chromium, webkit. Profiles: normal, constrained.

Columns: load requests / wire KB (brotli via the runner proxy) / JS files at load (preloaded, preloaded but never executed at load) / V8 characters executed at load (Chromium) / first contentful paint / early clicks that survived out of those with an observable response (lost) and their median input-to-response ms / settled first click input-to-response median ms / JS fetched by first clicks (requests, KB, summed over controls) / internal-link navigations: median serial request rounds and input-to-URL-response ms.

## sr-app

client-only (render() into #app), every shipped @markless/ui family. Routes: `/`.

| variant | browser | profile | load req | load KB | JS files (pre / unused) | exec chars | FCP ms | early survived (lost) | early click ms | first click ms | click JS req / KB | nav rounds | nav ms |
| --- | --- | --- | ---: | ---: | --- | ---: | ---: | --- | ---: | ---: | --- | ---: | ---: |
| default | chromium | normal | 2398 | 1004.1 | 2381 (2380 / 1384) | 3902601 | 2704 | 6/6 (0) | 62.7 | 66.9 | 0 / 0.0 | 19 | 124 |
| default | chromium | constrained | 2398 | 1004.3 | 2381 (2380 / 1384) | 3902601 | 9860 | 6/6 (0) | 163.1 | 159.4 | 0 / 0.0 | 19 | 563 |
| default | webkit | normal | 2398 | 918.2 | 2381 (2380 / -) | - | 2827 | 7/7 (0) | 48.0 | 53.0 | 0 / 0.0 | - | 292 |
| default | webkit | constrained | 2398 | 918.2 | 2381 (2380 / -) | - | 6437 | 6/6 (0) | 46.5 | 39.0 | 0 / 0.0 | - | 466 |
| packed | chromium | normal | 4 | 550.9 | 2 (1 / 0) | 4072585 | 268 | 6/6 (0) | 43.0 | 46.0 | 0 / 0.0 | 2 | 60 |
| packed | chromium | constrained | 4 | 550.9 | 2 (1 / 0) | 4072585 | 2664 | 6/6 (0) | 122.5 | 101.1 | 0 / 0.0 | 2 | 417 |
| packed | webkit | normal | 4 | 550.6 | 2 (1 / -) | - | 383 | 7/7 (0) | 31.0 | 35.0 | 0 / 0.0 | - | 45 |
| packed | webkit | constrained | 4 | 550.6 | 2 (1 / -) | - | 1912 | 7/7 (0) | 33.0 | 32.0 | 0 / 0.0 | - | 375 |

## live-feed-ssr

SSR + router, async computed feed behind @try/@pending, keyed list. Routes: `/`.

| variant | browser | profile | load req | load KB | JS files (pre / unused) | exec chars | FCP ms | early survived (lost) | early click ms | first click ms | click JS req / KB | nav rounds | nav ms |
| --- | --- | --- | ---: | ---: | --- | ---: | ---: | --- | ---: | ---: | --- | ---: | ---: |
| default | chromium | normal | 73 | 93.7 | 71 (71 / 37) | 41954 | 44 | 1/1 (0) | 25.6 | 43.3 | 3 / 0.7 | - | - |
| default | chromium | constrained | 73 | 93.7 | 71 (71 / 37) | 41967 | 1008 | 1/1 (0) | 62.9 | 508.9 | 3 / 0.7 | - | - |
| default | webkit | normal | 73 | 92.5 | 71 (71 / -) | - | 261 | 1/1 (0) | 29.0 | 44.0 | 3 / 0.6 | - | - |
| default | webkit | constrained | 73 | 92.5 | 71 (71 / -) | - | 777 | 1/1 (0) | 523.0 | 500.0 | 3 / 0.6 | - | - |
| packed | chromium | normal | 20 | 81.1 | 18 (18 / 8) | 49701 | 32 | 1/1 (0) | 82.3 | 40.5 | 0 / 0.0 | - | - |
| packed | chromium | constrained | 20 | 81.1 | 18 (18 / 8) | 49714 | 1008 | 1/1 (0) | 49.2 | 38.5 | 0 / 0.0 | - | - |
| packed | webkit | normal | 20 | 80.7 | 18 (18 / -) | - | 260 | 1/1 (0) | 28.0 | 29.0 | 0 / 0.0 | - | - |
| packed | webkit | constrained | 20 | 80.7 | 18 (18 / -) | - | 746 | 1/1 (0) | 65.0 | 26.0 | 0 / 0.0 | - | - |

## router-app

SSR + router multi-route: TSRX pages, MDX catch-all with an interactive island, streamed @pending page, Link navigation. Routes: `/`, `/harbor`, `/docs/getting-started`.

| variant | browser | profile | load req | load KB | JS files (pre / unused) | exec chars | FCP ms | early survived (lost) | early click ms | first click ms | click JS req / KB | nav rounds | nav ms |
| --- | --- | --- | ---: | ---: | --- | ---: | ---: | --- | ---: | ---: | --- | ---: | ---: |
| default | chromium | normal | 77 | 82.9 | 76 (76 / 76) | 6463 | 24 | 7/7 (0) | 39.4 | 45.8 | 0 / 0.0 | 0 | 48 |
| default | chromium | constrained | 77 | 82.9 | 76 (76 / 76) | 6463 | 848 | 7/7 (0) | 167.1 | 39.8 | 0 / 0.0 | 0 | 35 |
| default | webkit | normal | 77 | 81.7 | 76 (76 / -) | - | 16 | 7/7 (0) | 29.0 | 27.0 | 0 / 0.0 | - | 47 |
| default | webkit | constrained | 77 | 81.7 | 76 (76 / -) | - | 515 | 7/7 (0) | 211.0 | 27.0 | 0 / 0.0 | - | 48 |
| packed | chromium | normal | 16 | 68.5 | 15 (15 / 15) | 6463 | 20 | 7/7 (0) | 80.7 | 43.0 | 0 / 0.0 | 0 | 45 |
| packed | chromium | constrained | 16 | 68.5 | 15 (15 / 15) | 6463 | 840 | 7/7 (0) | 268.5 | 39.7 | 0 / 0.0 | 0 | 34 |
| packed | webkit | normal | 16 | 68.2 | 15 (15 / -) | - | 15 | 7/7 (0) | 63.0 | 27.0 | 0 / 0.0 | - | 47 |
| packed | webkit | constrained | 16 | 68.2 | 15 (15 / -) | - | 513 | 7/7 (0) | 287.0 | 28.0 | 0 / 0.0 | - | 40 |
