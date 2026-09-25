### Determinism (two clean builds of the unchanged tree)

| entrant | asset files | changed assets | any static file changed | load-set re-download (/ , /records, /settings) |
|---|---|---|---|---|
| markless | 27 | 0 | 0 | 0, 0, 0 |

### e1: one-line text change in the /records page component ("Search records" -> "Search all records")

| rank | entrant | / | /records | /settings | sum gz KB (brotli) | route load gz KB (/, /records, /settings) | changed assets in build (gz KB) | same-URL changed, long-lived cache | open tab: lazy files 404 / needed | old files gone | revalidated at load |
|---|---|---|---|---|---|---|---|---|---|---|---|
| 1 | markless | 8.7 / 1 | 8.7 / 1 | 8.7 / 1 | 26.0 (21.4) | 71.8, 71.8, 71.8 | 1 of 27 (8.7) | 0 | 0 / 0 | 1 of 11 | 0 |

### e2: shared app helper module used by every route: documentTitle() separator and one SIDEBAR_TREE label

| rank | entrant | / | /records | /settings | sum gz KB (brotli) | route load gz KB (/, /records, /settings) | changed assets in build (gz KB) | same-URL changed, long-lived cache | open tab: lazy files 404 / needed | old files gone | revalidated at load |
|---|---|---|---|---|---|---|---|---|---|---|---|
| 1 | markless | 33.8 / 2 | 33.8 / 2 | 33.8 / 2 | 101.3 (89.2) | 71.8, 71.8, 71.8 | 2 of 27 (33.8) | 0 | 0 / 0 | 2 of 11 | 0 |

### e3: new stateful component (toggle badge) added to /settings

| rank | entrant | / | /records | /settings | sum gz KB (brotli) | route load gz KB (/, /records, /settings) | changed assets in build (gz KB) | same-URL changed, long-lived cache | open tab: lazy files 404 / needed | old files gone | revalidated at load |
|---|---|---|---|---|---|---|---|---|---|---|---|
| 1 | markless | 6.2 / 1 | 6.2 / 1 | 6.2 / 1 | 18.7 (14.0) | 72.4, 72.4, 72.4 | 2 of 27 (11.6) | 0 | 0 / 0 | 1 of 11 | 0 |

### e4: one style rule of one component (.sort-button) in the app stylesheet

| rank | entrant | / | /records | /settings | sum gz KB (brotli) | route load gz KB (/, /records, /settings) | changed assets in build (gz KB) | same-URL changed, long-lived cache | open tab: lazy files 404 / needed | old files gone | revalidated at load |
|---|---|---|---|---|---|---|---|---|---|---|---|
| 1 | markless | 1.6 / 1 | 1.6 / 1 | 1.6 / 1 | 4.9 (4.1) | 71.8, 71.8, 71.8 | 1 of 27 (1.6) | 0 | 0 / 0 | 1 of 11 | 0 |

### e5: framework patch release: one string literal changed in the shipped client runtime

| rank | entrant | / | /records | /settings | sum gz KB (brotli) | route load gz KB (/, /records, /settings) | changed assets in build (gz KB) | same-URL changed, long-lived cache | open tab: lazy files 404 / needed | old files gone | revalidated at load |
|---|---|---|---|---|---|---|---|---|---|---|---|
| 1 | markless | 30.4 / 1 | 30.4 / 1 | 30.4 / 1 | 91.1 (80.3) | 71.8, 71.8, 71.8 | 1 of 27 (30.4) | 0 | 0 / 0 | 1 of 11 | 0 |

### e6: route-only change on /settings (field label text)

| rank | entrant | / | /records | /settings | sum gz KB (brotli) | route load gz KB (/, /records, /settings) | changed assets in build (gz KB) | same-URL changed, long-lived cache | open tab: lazy files 404 / needed | old files gone | revalidated at load |
|---|---|---|---|---|---|---|---|---|---|---|---|
| 1 | markless | 0.0 / 0 | 0.0 / 0 | 0.0 / 0 | 0.0 (0.0) | 71.8, 71.8, 71.8 | 1 of 27 (4.9) | 0 | 0 / 0 | 0 of 11 | 0 |

### Navigation mode (document loads during the three navigations of each route visit)

| entrant | / | /records | /settings |
|---|---|---|---|
| markless | 0 | 0 | 0 |
