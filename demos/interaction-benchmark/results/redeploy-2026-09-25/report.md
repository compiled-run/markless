### Determinism (two clean builds of the unchanged tree)

| entrant | asset files | changed assets | any static file changed | load-set re-download (/ , /records, /settings) |
|---|---|---|---|---|
| markless | 29 | 0 | 0 | 0, 0, 0 |
| qwik | 61 | 0 | 0 | 0, 0, 0 |
| qwik-tuned | 42 | 0 | 0 | 0, 0, 0 |
| octane | 11 | 1 | 1 | 1, 1, 1 |
| react-router | 13 | 0 | 0 | 0, 0, 0 |
| remix3 | 68 | 0 | n/a | 0, 0, 0 |
| solidstart | 9 | 0 | 0 | 0, 0, 0 |
| sveltekit | 14 | 0 | 0 | 0, 0, 0 |
| ripple | 7 | 0 | 0 | 0, 0, 0 |

### e1: one-line text change in the /records page component ("Search records" -> "Search all records")

| rank | entrant | / | /records | /settings | sum gz KB (brotli) | route load gz KB (/, /records, /settings) | changed assets in build (gz KB) | same-URL changed, long-lived cache | open tab: lazy files 404 / needed | old files gone | revalidated at load |
|---|---|---|---|---|---|---|---|---|---|---|---|
| 1 | remix3 | 0.0 / 0 | 1.4 / 1 | 0.0 / 0 | 1.4 (1.2) | 55.8, 54.9, 54.7 | 1 of 68 (1.4) | 0 | 0 / 7 | 0 of 68 | 68 |
| 2 | react-router | 0.0 / 0 | 1.5 / 1 | 0.0 / 0 | 1.5 (1.3) | 116.8, 117.0, 116.8 | 2 of 13 (2.0) | 0 | 1 / 4 | 1 of 11 | 0 |
| 3 | sveltekit | 2.0 / 1 | 4.2 / 2 | 2.0 / 1 | 8.1 (7.0) | 36.3, 36.8, 35.9 | 2 of 14 (4.2) | 0 | 1 / 3 | 2 of 13 | 0 |
| 4 | ripple | 4.2 / 1 | 6.5 / 2 | 4.2 / 1 | 14.8 (13.3) | 23.0, 23.1, 22.6 | 2 of 7 (6.5) | 0 | 1 / 3 | 2 of 7 | 0 |
| 5 | markless | 8.7 / 1 | 8.7 / 1 | 8.7 / 1 | 26.0 (21.5) | 73.3, 73.3, 73.3 | 1 of 29 (8.7) | 0 | 0 / 0 | 1 of 13 | 0 |
| 6 | solidstart | 11.8 / 1 | 13.5 / 2 | 11.8 / 1 | 37.1 (33.8) | 53.6, 53.6, 53.3 | 3 of 9 (21.2) | 0 | 1 / 3 | 2 of 7 | 0 |
| 7 | octane | 12.8 / 2 | 12.8 / 2 | 12.8 / 2 | 38.3 (33.1) | 105.3, 105.3, 105.3 | 2 of 11 (12.8) | 0 | 0 / 0 | 2 of 8 | 0 |
| 8 | qwik | 18.5 / 16 | 18.3 / 15 | 18.5 / 16 | 55.3 (49.3) | 72.2, 73.2, 73.4 | 21 of 61 (20.0) | 0 | 2 / 5 | 17 of 55 | 0 |
| 9 | qwik-tuned | 19.5 / 17 | 19.3 / 16 | 19.5 / 17 | 58.3 (52.0) | 68.4, 68.5, 68.7 | 21 of 42 (20.7) | 0 | 2 / 3 | 18 of 36 | 0 |

### e2: shared app helper module used by every route: documentTitle() separator and one SIDEBAR_TREE label

| rank | entrant | / | /records | /settings | sum gz KB (brotli) | route load gz KB (/, /records, /settings) | changed assets in build (gz KB) | same-URL changed, long-lived cache | open tab: lazy files 404 / needed | old files gone | revalidated at load |
|---|---|---|---|---|---|---|---|---|---|---|---|
| 1 | remix3 | 2.9 / 1 | 2.9 / 1 | 2.9 / 1 | 8.7 (7.4) | 55.8, 54.9, 54.7 | 1 of 68 (2.9) | 0 | 0 / 7 | 0 of 68 | 68 |
| 2 | react-router | 4.4 / 3 | 4.6 / 3 | 4.4 / 4 | 13.4 (11.7) | 116.8, 117.0, 116.8 | 7 of 13 (7.6) | 0 | 4 / 4 | 6 of 11 | 0 |
| 3 | sveltekit | 7.1 / 4 | 7.6 / 4 | 6.7 / 4 | 21.5 (18.6) | 36.3, 36.8, 35.9 | 6 of 14 (10.6) | 0 | 3 / 3 | 6 of 13 | 0 |
| 4 | markless | 7.3 / 2 | 7.3 / 2 | 7.3 / 2 | 21.9 (18.8) | 73.3, 73.3, 73.3 | 2 of 29 (7.3) | 0 | 0 / 0 | 2 of 13 | 0 |
| 5 | octane | 12.8 / 2 | 12.8 / 2 | 12.8 / 2 | 38.3 (33.1) | 105.3, 105.3, 105.3 | 2 of 11 (12.8) | 0 | 0 / 0 | 2 of 8 | 0 |
| 6 | ripple | 21.3 / 4 | 21.5 / 4 | 21.0 / 4 | 63.9 (57.1) | 23.0, 23.1, 22.6 | 6 of 7 (25.5) | 0 | 3 / 3 | 6 of 7 | 0 |
| 7 | qwik-tuned | 26.0 / 25 | 26.1 / 25 | 26.3 / 26 | 78.5 (69.5) | 68.4, 68.5, 68.7 | 30 of 42 (27.5) | 0 | 3 / 3 | 27 of 36 | 0 |
| 8 | qwik | 27.1 / 36 | 28.0 / 38 | 28.2 / 39 | 83.2 (74.1) | 72.2, 73.1, 73.3 | 44 of 61 (29.7) | 0 | 5 / 5 | 40 of 55 | 0 |
| 9 | solidstart | 52.0 / 4 | 52.0 / 4 | 51.7 / 4 | 155.7 (140.4) | 53.6, 53.6, 53.3 | 7 of 9 (62.7) | 0 | 3 / 3 | 6 of 7 | 0 |

### e3: new stateful component (toggle badge) added to /settings

| rank | entrant | / | /records | /settings | sum gz KB (brotli) | route load gz KB (/, /records, /settings) | changed assets in build (gz KB) | same-URL changed, long-lived cache | open tab: lazy files 404 / needed | old files gone | revalidated at load |
|---|---|---|---|---|---|---|---|---|---|---|---|
| 1 | react-router | 0.0 / 0 | 0.0 / 0 | 1.1 / 1 | 1.1 (1.0) | 116.8, 117.0, 116.9 | 2 of 13 (1.6) | 0 | 1 / 4 | 1 of 11 | 0 |
| 2 | remix3 | 0.0 / 0 | 0.0 / 0 | 1.4 / 2 | 1.4 (1.2) | 55.8, 54.9, 54.9 | 2 of 69 (1.4) | 0 | 0 / 7 | 0 of 68 | 69 |
| 3 | sveltekit | 2.0 / 1 | 2.0 / 1 | 3.4 / 2 | 7.3 (6.4) | 36.3, 36.8, 36.0 | 2 of 14 (3.4) | 0 | 1 / 3 | 2 of 13 | 0 |
| 4 | ripple | 4.2 / 1 | 4.2 / 1 | 6.1 / 2 | 14.4 (13.0) | 23.0, 23.1, 22.8 | 2 of 7 (6.1) | 0 | 1 / 3 | 2 of 7 | 0 |
| 5 | markless | 6.3 / 1 | 6.3 / 1 | 6.3 / 1 | 18.8 (14.1) | 73.9, 73.9, 73.9 | 2 of 29 (11.6) | 0 | 0 / 0 | 1 of 13 | 0 |
| 6 | solidstart | 11.8 / 1 | 11.8 / 1 | 13.3 / 2 | 37.0 (33.5) | 53.6, 53.6, 53.4 | 3 of 9 (21.0) | 0 | 1 / 3 | 2 of 7 | 0 |
| 7 | qwik | 18.8 / 19 | 18.8 / 19 | 18.8 / 19 | 56.5 (50.2) | 72.8, 73.7, 73.9 | 24 of 64 (20.3) | 0 | 1 / 5 | 17 of 55 | 0 |
| 8 | qwik-tuned | 19.7 / 20 | 19.7 / 20 | 19.7 / 20 | 59.2 (52.8) | 69.0, 69.1, 69.2 | 24 of 45 (20.9) | 0 | 1 / 3 | 18 of 36 | 0 |
| 9 | octane | 97.1 / 3 | 97.1 / 3 | 97.1 / 3 | 291.2 (249.4) | 105.6, 105.6, 105.6 | 3 of 11 (97.1) | 0 | 0 / 0 | 3 of 8 | 0 |

### e4: one style rule of one component (.sort-button) in the app stylesheet

| rank | entrant | / | /records | /settings | sum gz KB (brotli) | route load gz KB (/, /records, /settings) | changed assets in build (gz KB) | same-URL changed, long-lived cache | open tab: lazy files 404 / needed | old files gone | revalidated at load |
|---|---|---|---|---|---|---|---|---|---|---|---|
| 1 | qwik | 0.0 / 0 | 0.0 / 0 | 0.0 / 0 | 0.0 (0.0) | 72.2, 73.2, 73.4 | 1 of 61 (1.6) | 0 | 0 / 5 | 0 of 55 | 0 |
| 2 | qwik-tuned | 0.0 / 0 | 0.0 / 0 | 0.0 / 0 | 0.0 (0.0) | 68.4, 68.5, 68.7 | 1 of 42 (1.6) | 0 | 0 / 3 | 0 of 36 | 0 |
| 3 | remix3 | 1.6 / 1 | 1.6 / 1 | 1.6 / 1 | 4.8 (4.0) | 55.8, 54.9, 54.7 | 1 of 68 (1.6) | 0 | 0 / 7 | 0 of 68 | 68 |
| 4 | markless | 1.6 / 1 | 1.6 / 1 | 1.6 / 1 | 4.9 (4.1) | 73.3, 73.3, 73.3 | 1 of 29 (1.6) | 0 | 0 / 0 | 1 of 13 | 0 |
| 5 | react-router | 2.5 / 2 | 2.5 / 2 | 2.5 / 2 | 7.4 (6.4) | 116.8, 117.0, 116.8 | 3 of 13 (3.0) | 0 | 0 / 4 | 2 of 11 | 0 |
| 6 | sveltekit | 4.7 / 3 | 4.7 / 3 | 4.7 / 3 | 14.2 (12.2) | 36.3, 36.8, 35.9 | 3 of 14 (4.7) | 0 | 0 / 3 | 3 of 13 | 0 |
| 7 | ripple | 5.8 / 2 | 5.8 / 2 | 5.8 / 2 | 17.3 (15.4) | 23.0, 23.1, 22.6 | 2 of 7 (5.8) | 0 | 0 / 3 | 2 of 7 | 0 |
| 8 | solidstart | 13.4 / 2 | 13.4 / 2 | 13.4 / 2 | 40.3 (36.3) | 53.6, 53.6, 53.3 | 3 of 9 (21.1) | 0 | 0 / 3 | 2 of 7 | 0 |
| 9 | octane | 14.4 / 3 | 14.4 / 3 | 14.4 / 3 | 43.1 (37.1) | 105.3, 105.3, 105.3 | 3 of 11 (14.4) | 0 | 0 / 0 | 3 of 8 | 0 |

### e5: framework patch release: one string literal changed in the shipped client runtime

| rank | entrant | / | /records | /settings | sum gz KB (brotli) | route load gz KB (/, /records, /settings) | changed assets in build (gz KB) | same-URL changed, long-lived cache | open tab: lazy files 404 / needed | old files gone | revalidated at load |
|---|---|---|---|---|---|---|---|---|---|---|---|
| 1 | remix3 | 2.9 / 1 | 2.9 / 1 | 2.9 / 1 | 8.7 (7.9) | 55.8, 54.9, 54.7 | 1 of 68 (2.9) | 0 | 0 / 7 | 0 of 68 | 68 |
| 2 | ripple | 4.1 / 1 | 4.1 / 1 | 4.1 / 1 | 12.4 (11.3) | 22.9, 23.1, 22.6 | 1 of 7 (4.1) | 0 | 0 / 3 | 1 of 7 | 0 |
| 3 | markless | 27.1 / 1 | 27.1 / 1 | 27.1 / 1 | 81.4 (72.6) | 73.3, 73.3, 73.3 | 1 of 29 (27.1) | 0 | 0 / 0 | 1 of 13 | 0 |
| 4 | sveltekit | 32.2 / 8 | 32.8 / 8 | 31.9 / 8 | 96.9 (87.5) | 36.2, 36.8, 35.9 | 10 of 14 (35.8) | 0 | 3 / 3 | 10 of 13 | 0 |
| 5 | solidstart | 52.0 / 4 | 52.0 / 4 | 51.7 / 4 | 155.7 (140.4) | 53.6, 53.6, 53.3 | 7 of 9 (62.7) | 0 | 3 / 3 | 6 of 7 | 0 |
| 6 | qwik-tuned | 63.3 / 30 | 63.3 / 30 | 63.5 / 31 | 190.1 (169.2) | 68.4, 68.5, 68.7 | 36 of 42 (64.8) | 0 | 3 / 3 | 32 of 36 | 0 |
| 7 | qwik | 63.7 / 36 | 64.6 / 38 | 64.8 / 39 | 193.1 (172.1) | 72.2, 73.1, 73.3 | 45 of 61 (66.4) | 0 | 5 / 5 | 40 of 55 | 0 |
| 8 | octane | 96.8 / 3 | 96.8 / 3 | 96.8 / 3 | 290.4 (248.6) | 105.3, 105.3, 105.3 | 3 of 11 (96.8) | 0 | 0 / 0 | 3 of 8 | 0 |
| 9 | react-router | 112.8 / 6 | 113.1 / 6 | 112.6 / 6 | 338.5 (296.5) | 116.8, 117.0, 116.8 | 9 of 13 (115.8) | 0 | 3 / 4 | 8 of 11 | 0 |

### e6: route-only change on /settings (field label text)

| rank | entrant | / | /records | /settings | sum gz KB (brotli) | route load gz KB (/, /records, /settings) | changed assets in build (gz KB) | same-URL changed, long-lived cache | open tab: lazy files 404 / needed | old files gone | revalidated at load |
|---|---|---|---|---|---|---|---|---|---|---|---|
| 1 | markless | 0.0 / 0 | 0.0 / 0 | 0.0 / 0 | 0.0 (0.0) | 73.3, 73.3, 73.3 | 1 of 29 (4.9) | 0 | 0 / 0 | 0 of 13 | 0 |
| 2 | react-router | 0.0 / 0 | 0.0 / 0 | 1.0 / 1 | 1.0 (0.9) | 116.8, 117.0, 116.8 | 2 of 13 (1.5) | 0 | 1 / 4 | 1 of 11 | 0 |
| 3 | remix3 | 0.0 / 0 | 0.0 / 0 | 1.1 / 1 | 1.1 (1.0) | 55.8, 54.9, 54.7 | 1 of 68 (1.1) | 0 | 0 / 7 | 0 of 68 | 68 |
| 4 | sveltekit | 2.0 / 1 | 2.0 / 1 | 3.3 / 2 | 7.2 (6.3) | 36.3, 36.8, 35.9 | 2 of 14 (3.3) | 0 | 1 / 3 | 2 of 13 | 0 |
| 5 | ripple | 4.2 / 1 | 4.2 / 1 | 6.0 / 2 | 14.3 (12.9) | 23.0, 23.1, 22.6 | 2 of 7 (6.0) | 0 | 1 / 3 | 2 of 7 | 0 |
| 6 | solidstart | 11.8 / 1 | 11.8 / 1 | 13.2 / 2 | 36.8 (33.4) | 53.6, 53.6, 53.3 | 3 of 9 (20.9) | 0 | 1 / 3 | 2 of 7 | 0 |
| 7 | octane | 12.8 / 2 | 12.8 / 2 | 12.8 / 2 | 38.3 (33.2) | 105.3, 105.3, 105.3 | 2 of 11 (12.8) | 0 | 0 / 0 | 2 of 8 | 0 |
| 8 | qwik | 18.3 / 16 | 18.3 / 16 | 18.3 / 16 | 54.9 (48.9) | 72.2, 73.2, 73.4 | 21 of 61 (19.8) | 0 | 1 / 5 | 17 of 55 | 0 |
| 9 | qwik-tuned | 19.2 / 17 | 19.2 / 17 | 19.2 / 17 | 57.7 (51.2) | 68.5, 68.5, 68.7 | 21 of 42 (20.4) | 0 | 1 / 3 | 18 of 36 | 0 |

### Navigation mode (document loads during the three navigations of each route visit)

| entrant | / | /records | /settings |
|---|---|---|---|
| markless | 0 | 0 | 0 |
| qwik | 0 | 0 | 0 |
| qwik-tuned | 0 | 0 | 0 |
| octane | 0 | 0 | 0 |
| react-router | 0 | 0 | 0 |
| remix3 | 0 | 0 | 0 |
| solidstart | 0 | 0 | 0 |
| sveltekit | 0 | 0 | 0 |
| ripple | 2 | 2 | 2 |
