# Interaction benchmark behavior contract (v1)

Every entrant (Markless, Qwik v2, Octane, React Router, Remix 3, SolidStart v2, SvelteKit with Svelte 5, Ripple) implements this application. One external Playwright runner drives all of them with the same inputs and the same assertions. Frameworks differ; this contract does not.

"MUST" items are checked by the runner's correctness suite. A visit that fails an assertion is recorded as a failure, never as a slow sample.

Shared inputs, copied into each app by `shared/sync.mjs`:

- `shared/data.ts`: every fixture, visible string, and pure helper named below (records, tree, tabs, filter items, settings validation, server decision). Apps MUST render these values, not retyped copies.
- `shared/styles.css`: the one stylesheet. Apps MUST put the class names listed below on the listed elements.

## 1. Rules

1. Idiomatic implementation. Each app uses its framework's supported rendering, reactivity, events, routing, and server APIs. No shared imperative DOM code, no hand-written event delegation that bypasses the framework, no `innerHTML` rendering of app content.
2. Rendering mode is labeled. Default is server-side rendering (SSR) of every route on request. Prerendered or client-rendered (CSR) builds are separate, labeled variants (`renderMode` in results). A hand-authored static HTML shell is never an SSR substitute. If a framework cannot do something in the contract, record it as `unsupported`; do not fake it.
3. No benchmark detection. Apps MUST NOT inspect the user agent, `navigator.webdriver`, query strings, cookies, runner-injected globals, or timing to change behavior. There is no "benchmark mode".
4. Same data, same content, same styles. The document, visible text, element roles, and class names match this contract. Framework-owned markers, comments, attributes, serialized state, and script tags may differ; their bytes are counted.
5. No hidden or delayed controls. Controls are visible from the first paint of server HTML. Do not disable, hide, or cover a control until it is interactive to improve a number, and do not add a spinner or "loading" state for client activation.
6. No warm-up tricks. No service workers, no prefetch of other routes beyond what the framework does by default in its recommended production configuration, no eager initialization added only to move click cost before measurement. Documented, ordinary optimizations (framework preload settings, bundling groups) are allowed equally for every entrant; tuned configurations are recorded as a separate `variant`.
7. No debouncing or throttling of inputs. Every input event MUST produce its response.
8. Identity. The document `<head>` MUST contain `<meta name="benchmark:entrant" content="<entrant>">` (`markless`, `qwik`, `octane`, `react-router`, `remix3`, `solidstart`, `sveltekit`, `ripple`) and `<meta name="benchmark:build" content="<build id>">`. The build id is `process.env.BENCHMARK_BUILD_ID` at build time, falling back to the short git commit. The runner rejects a visit whose build id does not match the recorded build (`build-mismatch`).
9. Document basics: `<html lang="en">`, `<meta charset="utf-8">`, `<meta name="viewport" content="width=device-width, initial-scale=1">`, `<title>` equal to `documentTitle(route)` (for example `Records | Interaction benchmark`), updated on client navigation.
10. Local state lives in the browser. Only the settings submit talks to the server after the document loads (plus whatever route data or code the framework itself fetches during client navigation, which is counted).

## 2. Shared layout (every route)

```
div.app
  header.app-header
    span.app-brand            "Interaction benchmark"
    nav.app-nav[aria-label="Main"]
      a  data-testid="nav-overview"  href="/"          "Overview"
      a  data-testid="nav-records"   href="/records"   "Records"
      a  data-testid="nav-settings"  href="/settings"  "Settings"
  div.app-body
    aside.sidebar[aria-label="Sections"]
      ul.tree                 (SIDEBAR_TREE)
    main.main
      h1.page-title  data-testid="page-title"   route title
      ...route content
```

- Nav links are real `<a href>` elements. Clicking one MUST perform client-side navigation (no full document load) where the framework supports it; the runner records whether a document request occurred. The link for the current route has `aria-current="page"`; the others have no `aria-current` attribute.
- `page-title` text is exactly `Overview`, `Records`, or `Settings`.
- Sidebar tree, rendered from `SIDEBAR_TREE`. For each node with `children`:
  - `button.tree-toggle` with `type="button"`, `data-testid="disclosure-<id>"`, `aria-expanded="false"` initially, `aria-controls` equal to the panel's `id`, text equal to `label`.
  - `ul.tree-panel` with `id="disclosure-panel-<id>"` and `data-testid="disclosure-panel-<id>"`, not visible while collapsed (either the `hidden` attribute or not rendered).
  - Activating the button (click, Enter, or Space) flips `aria-expanded` and the panel's visibility. Nested groups keep their own state when a parent collapses and re-expands.
- For each leaf: `<li><span class="tree-leaf" data-testid="tree-leaf-<id>">label</span></li>`. Leaves are not links.
- All groups start collapsed on every route render. Disclosure state is not required to persist across route navigation.

Disclosure ids: `guides` (children `getting-started`, `advanced` -> `caching`, `streaming`) and `reference` (children `api`, `plugins` -> `bundler`, `router`).

## 3. Route `/` Overview

Content order inside `main.main`:

1. `page-title` "Overview".
2. `div.prose` with one `<p>` per `OVERVIEW_PROSE` entry.
3. `h2.section-title` "Panels", then `div.panels` with three `section.panel` elements, each with an `h3.panel-title`.
4. `div.tabs` with the tab widget.
5. `section.filter` with the filter.

### 3.1 Counter panel (title "Counter")

| testid | element | initial | action | outcome |
| --- | --- | --- | --- | --- |
| `counter-value` | `output.value` | `0` | | |
| `counter-increment` | `button.button` type=button, text `Increment` | enabled | click / Enter / Space | `counter-value` text increases by exactly 1 per activation |

N activations in any rhythm (including 10 clicks sent without waiting) MUST end at text `N`. Lost or duplicated clicks are failures.

### 3.2 Toggle panel (title "Toggle")

| testid | element | initial | action | outcome |
| --- | --- | --- | --- | --- |
| `toggle-button` | `button.button` type=button, text `Notifications`, `aria-pressed` | `aria-pressed="false"` | click / Enter / Space | `aria-pressed` flips between `"false"` and `"true"` |
| `toggle-status` | `output.value` | `Off` | | `On` when pressed, `Off` otherwise (`toggleStatusText`) |

### 3.3 Stepper panel (title "Stepper")

| testid | element | initial | action | outcome |
| --- | --- | --- | --- | --- |
| `stepper-decrement` | `button.button` type=button, text `−` (U+2212), `aria-label="Decrease"` | enabled | activate | value −1; `disabled` when value is `STEPPER_MIN` (0) |
| `stepper-value` | `output.value` | `5` | | |
| `stepper-increment` | `button.button` type=button, text `+`, `aria-label="Increase"` | enabled | activate | value +1; `disabled` when value is `STEPPER_MAX` (10) |
| `stepper-derived` | `p.derived` | `Squared: 25` | | always `stepperDerivedText(value)` |

The buttons sit in a `div.row` between which `stepper-value` appears.

Panels are independent: activating one panel MUST NOT change any other panel's visible text or attributes.

### 3.4 Tabs

- `div.tablist` with `role="tablist"`, `aria-label="Details"`, `data-testid="overview-tabs"`.
- One `button.tab` per `TABS` entry: `type="button"`, `role="tab"`, `id="tab-<id>"`, `data-testid="tab-<id>"`, `aria-controls="tab-panel"`, text `label`. The selected tab has `aria-selected="true"` and `tabindex="0"`; the others `aria-selected="false"` and `tabindex="-1"`.
- One `div.tabpanel` with `role="tabpanel"`, `id="tab-panel"`, `data-testid="tab-panel"`, `aria-labelledby="tab-<selected id>"`, `tabindex="0"`, text exactly the selected tab's `content`.
- Initial: `summary` selected, panel text `Summary: 200 records across 5 teams.`
- Click, Enter, or Space on a tab selects it. With focus on a tab, ArrowRight/ArrowLeft move focus to the next/previous tab (wrapping) and select it; Home/End select the first/last tab.

### 3.5 Filter

- `section.filter` containing `div.field` with `label.field-label` "Filter items" bound (`for`/`id`) to `input.input` `type="search"`, `data-testid="filter-input"`, initial value empty, `autocomplete="off"`.
- `p.muted` `data-testid="filter-count"`, text `filterCountText(n)`: initial `12 items`.
- `ul.list` `data-testid="filter-list"` with one `<li data-testid="filter-item">` per `filterItems(FILTER_ITEMS, query)` result, in `FILTER_ITEMS` order.
- When no item matches: the list is empty or absent and `p.muted` `data-testid="filter-empty"` shows `No matching items`. `filter-empty` is absent otherwise.
- Every `input` event updates count and list. Query `berry` gives `2 items`: `Blueberry`, `Elderberry`.

## 4. Route `/records`

Rows are exactly the 200 `RECORDS`, all rendered (no virtualization, no pagination, no lazy rendering of off-screen rows).

### 4.1 Toolbar (`div.records-toolbar`)

- `div.field` with `label.field-label` "Search records" bound to `input.input` `type="search"`, `data-testid="records-search"`, initial empty. Matching is `recordMatches` (case-insensitive substring of name or email, trimmed).
- `p.muted` `data-testid="records-count"`: `recordsCountText(visible, 200)`, initial `Showing 200 of 200`.
- `p.summary` `data-testid="selection-summary"` with `role="status"`: `selectionSummaryText(n)`, initial `0 selected`. `n` counts every selected record, including those hidden by the current search.

### 4.2 Table

```
table.records-table  data-testid="records-table"
  thead tr
    th  (no text, aria-label="Select")
    th[aria-sort]  button.sort-button type=button data-testid="sort-name"   "Name"
    th                                                                      "Email"
    th                                                                      "Team"
    th[aria-sort]  button.sort-button type=button data-testid="sort-score"  "Score"
    th                                                                      "Updated"
    th  (no text, aria-label="Actions")
  tbody
    tr data-testid="record-row" data-id="<id>"     (one per visibleRecords(RECORDS, query, sort))
      td  input type=checkbox data-testid="record-select" aria-label="Select <name>"
      td  data-testid="record-name"    name
      td  data-testid="record-email"   email
      td  data-testid="record-team"    team
      td  data-testid="record-score"   score
      td  data-testid="record-updated" formatUpdatedAt(updatedAt)   (YYYY-MM-DD)
      td  button.button type=button data-testid="record-edit" aria-label="Edit <name>"  "Edit"
```

- Rows are keyed by `id`; row DOM identity for an unchanged record SHOULD survive search, sort, and selection changes (the idiomatic keyed-list mechanism of each framework).
- When no row matches, `tbody` contains one `tr` with a `td colspan="7" data-testid="records-empty"` showing `No records match`.
- Sorting. Initial order is by `id` ascending and both sortable `th` elements have `aria-sort="none"`. Activating a sort button applies `nextSort(current, key)`: a new column starts `ascending`; activating the active column flips direction. The active column's `th` gets `aria-sort="ascending"` or `"descending"`, the other gets `"none"`. Order is `compareRecords` (code-unit comparison, ties by id). Sort and search compose: filter, then sort.
- Selection. Checking or unchecking `record-select` (click or Space) updates `checked` and `selection-summary`. Selection is kept by id across search and sort.
- Search, sort, selection, and edits are not required to persist across route navigation or reload.

### 4.3 Edit dialog

- Activating `record-edit` opens a modal dialog for that record. Either a native `<dialog class="dialog">` opened with `showModal()`, or `div.dialog-backdrop` containing `div.dialog` with `role="dialog"` and `aria-modal="true"`. The dialog element has `data-testid="edit-dialog"` and `aria-labelledby` pointing to `h2.dialog-title` `data-testid="edit-dialog-title"` with text `Edit record`.
- Contents: `div.field` with `label.field-label` "Name" bound to `input.input` `data-testid="edit-name"`, initial value = the record's current name; `div.dialog-actions` with `button.button` `data-testid="edit-cancel"` "Cancel" and `button.button.button-primary` `data-testid="edit-save"` "Save" (inside a `<form>`, `edit-save` is `type="submit"` and Enter in `edit-name` saves).
- On open, focus moves to `edit-name`.
- `edit-save` is `disabled` while `normalizeEditedName(value)` is empty. Saving sets the record's name to the trimmed value, closes the dialog, and returns focus to the row's `record-edit` button. The row's `record-name` text and the aria-labels update; `selection-summary`, checkbox state, row count, and row order under the current sort are recomputed from the new data (a name-sorted table re-sorts).
- `edit-cancel`, Escape, or (for a native dialog) the dialog's cancel event close without changes and return focus to the triggering `record-edit` button.
- When closed, `edit-dialog` is not visible (not rendered, or a closed `<dialog>`). Only one dialog exists at a time.

## 5. Route `/settings`

`form.form` `data-testid="settings-form"` `novalidate` (browser validation bubbles differ, so the app shows its own messages).

| field | testid | label (`label.field-label`) | input | initial |
| --- | --- | --- | --- | --- |
| name | `settings-name` | Display name | `input.input type="text"` | `Ada Lovelace` |
| email | `settings-email` | Email | `input.input type="email"` | `ada@example.test` |
| quantity | `settings-quantity` | Quantity | `input.input type="text" inputmode="numeric"` | `2` |
| unitPrice | `settings-unit-price` | Unit price | `input.input type="text" inputmode="decimal"` | `12.50` |

- Each field sits in `div.field`. Its error message is `p.field-error` with `data-testid="settings-<field>-error"` (`settings-name-error`, `settings-email-error`, `settings-quantity-error`, `settings-unit-price-error`) and an `id` referenced by the input's `aria-describedby` while shown.
- Validation is `validateSettings(values)` with the exact messages from `data.ts` (required, min length 3, email pattern, quantity 1 to 99, price with at most 2 decimals). Errors are hidden (absent) until the first submit attempt. After that, errors update on every `input` event, and invalid inputs carry `aria-invalid="true"` (valid inputs have no `aria-invalid` or `"false"`).
- Derived value: `p.derived` `data-testid="settings-total"`, text `settingsTotalText(values)`, updated on every `input` event regardless of submit attempts. Initial `Total: $25.00`; quantity `3` gives `Total: $37.50`; an invalid quantity or price gives `Total: n/a`.
- `div.form-actions` contains `button.button.button-primary` `type="submit"` `data-testid="settings-submit"`, text `Save`, and `p` `data-testid="settings-status"` (class `status`, `role="status"`, always present, initially empty text).
- Submitting (click or Enter in a field):
  1. If `validateSettings` reports errors, show them, send no request, move focus to the first invalid field.
  2. Otherwise, synchronously on the input, show the pending UI: `settings-submit` gets `disabled` and text `Saving…` (U+2026), `settings-status` text `Saving…`, and any previous `settings-error` is removed. Then send exactly one `POST /api/settings` with header `content-type: application/json` and body `{"name","email","quantity","unitPrice"}` (the raw field strings). Apps should use their framework's idiomatic mutation mechanism (route action, form action, server function, or `fetch`). If that mechanism posts to a framework-owned URL or encoding, that is allowed: the server behavior in 5.1 (300 ms delay, 422 for name `fail`, exact response fields and visible UI) is what must match, and the app records its request URL/encoding in BENCH.md. Exactly one server round trip per submit.
  3. On a 200 response: `settings-status` text is `body.message` (`Saved Ada Lovelace, total $25.00` for the initial values), `settings-submit` is enabled with text `Save`.
  4. On a non-200 response: `settings-status` is empty, `settings-submit` is enabled with text `Save`, and `p.alert` `data-testid="settings-error"` `role="alert"` shows `body.error`. Network failure shows `SETTINGS_NETWORK_ERROR_MESSAGE` (`Request failed.`).
- Deterministic error path: display name `fail` (any case, trimmed) passes client validation and the server answers 422 with `The server rejected this display name.`
- Form state is NOT required to persist across navigation: returning to `/settings` shows the initial values, no errors, empty status.

### 5.1 Server endpoint `POST /api/settings`

Implemented with the framework's own server routes/handlers (API route, resource route, endpoint, server function mounted at that path). Behavior:

1. Parse the JSON body (unparseable body is treated as `{}`).
2. `const result = settingsServerResponse(body)` from `data.ts`.
3. Wait `SETTINGS_DELAY_MS` (300 ms) with a timer, measured from when the handler starts.
4. Respond with `result.status`, `content-type: application/json`, `cache-control: no-store`, body `JSON.stringify(result.body)`.

Other methods on `/api/settings` return 405. The endpoint does no other work and keeps no state.

## 6. Navigation and history

- Header links navigate client-side between the three routes. After navigation: URL path matches, `page-title` text matches, `document.title` matches, `aria-current="page"` moves, and the route's content is present (Records: 200 `record-row` elements).
- Browser Back/Forward restore the route for the URL (title, content, `aria-current`).
- Scroll: on a Back navigation to a route that was scrolled, the window scroll position MUST be restored to within 50 px of its value when the route was left. A forward navigation via a header link lands at the top (`scrollY` 0) of the new route.
- Route-local UI state (counters, disclosures, search, selection, edits, form values) is NOT required to persist across navigation. Apps may keep it if the framework does so by default; the runner does not assert it.
- Full document reloads are allowed only for entrants without client routing in the recorded configuration; the result is then labeled, not hidden.

## 7. Keyboard and focus

- Every button activates on Enter and Space (native `<button>` provides this; custom elements are not allowed for controls).
- Checkboxes toggle on Space. Inputs are reachable by Tab in document order: header links, sidebar toggles, then route content.
- Focus is never moved by the app except: dialog open (to `edit-name`), dialog close (to the trigger), failed settings validation (to the first invalid field), tab arrow keys (to the newly selected tab).
- Focus indicators come from `:focus-visible` in `styles.css`; apps must not remove outlines.

## 8. Class names (styles.css)

`app`, `app-header`, `app-brand`, `app-nav`, `app-body`, `sidebar`, `tree`, `tree-toggle`, `tree-panel`, `tree-leaf`, `main`, `page-title`, `prose`, `section-title`, `panels`, `panel`, `panel-title`, `value`, `derived`, `row`, `button`, `button-primary`, `tabs`, `tablist`, `tab`, `tabpanel`, `filter`, `field`, `field-label`, `input`, `field-error`, `list`, `muted`, `records-toolbar`, `summary`, `records-table`, `sort-button`, `dialog`, `dialog-backdrop`, `dialog-title`, `dialog-actions`, `form`, `form-actions`, `status`, `alert`.

Apps load `styles.css` through their framework's normal CSS pipeline (link, bundled, or inlined as that framework does by default); its bytes are counted. Frameworks may add scoping classes, but the listed classes MUST remain on the listed elements. No other app styles are allowed beyond what a framework injects on its own.

## 9. Measurement definitions

- Trusted input. The runner uses Playwright's real input (mouse click at the element's center, `keyboard.press`, `keyboard.insertText`). Text entry uses a single `insertText` of the whole query after focusing the field (the focus click is a precondition, not measured); replacing a value selects all first (Meta/Control+A).
- Input time. The runner installs one capture-phase listener in every page (identical for all entrants) that records `event.timeStamp` of the first `pointerdown`, `keydown`, or `input` event of the measured input.
- Correct response. Each case names an assertion over the DOM. The runner evaluates it after every DOM mutation (MutationObserver) and on every animation frame.
  - `inputToDomMs`: input time to the first moment the assertion holds (DOM diagnostic).
  - `inputToResponseMs`: input time to the presentation estimate, the start of the first animation frame after the assertion holds plus the following frame callback (rAF then next rAF). This is a labeled estimate, not a paint measurement.
  - `eventDurationMs`: Event Timing `duration` for the input where the browser exposes it (Chromium), else null.
  - `navToResponseMs`: navigation start (`performance.timeOrigin`) to the same presentation estimate.
- Phases.
  - `early`: after `page.goto` commits, the runner issues each input (and each focus pre-step) as soon as the target has been painted and is ready: a `first-contentful-paint` (or `first-paint`) entry exists, and the target is visible, enabled, has the same non-empty box in two consecutive animation frames, and is the hit-test target at its in-viewport center. It does not wait for DOMContentLoaded, load, or preloads. Only cases marked `early` below run in this phase.
  - `settled`: the runner waits for the `load` event, then for network quiet (no request in flight for 500 ms), then 500 ms more, and then issues the input.
- A case fails after 10 s without the asserted response. If the page saw the input and the DOM never changed, the failure is `failure.kind="input-lost"` (the input arrived before anything listened for it); if the page never saw the input, it is `failure.kind="timeout"`. A wrong final state (for example counter shows 9 after 10 clicks, or a duplicated row) is `wrong-response`. Every visit is a fresh browser context with an empty cache.
- Settings submit reports three numbers: `pendingMs` (input to pending UI), `serverMs` (API request start to response end, from Resource Timing), and `inputToResponseMs` (input to result UI). Local and server time are never merged into one number.

## 10. Measured cases

Expected values derive from `data.ts` (mulberry32, seed 42). "Pre" steps run before the measured input and are not timed.

| case id | route | phases | pre-conditions | measured trusted input | assertion (correct visible response) |
| --- | --- | --- | --- | --- | --- |
| `overview-counter-first` | `/` | early, settled | none | click `counter-increment` | `counter-value` = `1` |
| `overview-counter-repeat-x10` | `/` | early, settled | none | 10 clicks on `counter-increment`, sent back to back without awaiting responses; timed from the first | `counter-value` = `10` |
| `overview-independent-panel` | `/` | settled | click `counter-increment`, wait for `counter-value` = `1` | click `stepper-increment` | `stepper-value` = `6`, `stepper-derived` = `Squared: 36`, `counter-value` still `1`, `toggle-status` still `Off` |
| `overview-toggle` | `/` | early, settled | none | press Space (pre step: `toggle-button` focused with `locator.focus()`) | `toggle-button[aria-pressed="true"]`, `toggle-status` = `On` |
| `overview-disclosure` | `/` | early, settled | none | click `disclosure-guides` | `aria-expanded="true"`, `tree-leaf-getting-started` visible |
| `overview-disclosure-nested` | `/` | settled | click `disclosure-guides`, wait for it to open | click `disclosure-advanced` | `disclosure-advanced[aria-expanded="true"]`, `tree-leaf-caching` and `tree-leaf-streaming` visible |
| `overview-tab` | `/` | early, settled | none | click `tab-activity` | `tab-activity[aria-selected="true"]`, `tab-summary[aria-selected="false"]`, `tab-panel` text = `Activity: 12 updates in the last 24 hours.` |
| `overview-filter` | `/` | early, settled | click `filter-input` | insertText `berry` | `filter-count` = `2 items`, `filter-item` texts = `Blueberry`, `Elderberry` |
| `records-search` | `/records` | early, settled | click `records-search` | insertText `knuth` | `records-count` = `Showing 15 of 200`, 15 `record-row`, first `data-id` = `r016` |
| `records-sort` | `/records` | early, settled | none | click `sort-score` | th of `sort-score` has `aria-sort="ascending"`, first `record-row` `data-id` = `r004` (score 0), last = `r147` |
| `records-sort-toggle` (correctness only) | `/records` | settled | click `sort-score` | click `sort-score` | `aria-sort="descending"`, first row `r147` (score 100); `sort-name` then gives first row `r028` (`Ada Engelbart`) |
| `records-select` | `/records` | early, settled | none | click `record-select` in row `r003` | that checkbox `checked`, `selection-summary` = `1 selected` |
| `records-dialog-open` | `/records` | early, settled | none | click `record-edit` in row `r001` | `edit-dialog` visible, `edit-name` value = `Katherine Hopper`, `edit-name` focused |
| `records-dialog-save` | `/records` | settled | click `record-select` in `r003`; open dialog for `r001`; select all in `edit-name`; insertText `Renamed Record` | click `edit-save` | `edit-dialog` not visible, `r001` `record-name` = `Renamed Record`, `selection-summary` = `1 selected`, focus on `r001` `record-edit` |
| `records-dialog-cancel` (correctness only) | `/records` | settled | open dialog for `r002` | press Escape | `edit-dialog` not visible, `r002` name unchanged (`Hedy Floyd`), focus on `r002` `record-edit` |
| `settings-derived` | `/settings` | early, settled | click `settings-quantity`, select all | insertText `3` | `settings-total` = `Total: $37.50` |
| `settings-submit` | `/settings` | settled | none | click `settings-submit` | pending: `settings-status` = `Saving…` and `settings-submit` disabled (`pendingMs`); result: `settings-status` = `Saved Ada Lovelace, total $25.00`, `settings-submit` enabled with text `Save` (`inputToResponseMs`); `serverMs` from the API request |
| `settings-submit-error` | `/settings` | settled | select all in `settings-name`, insertText `fail` | click `settings-submit` | pending as above; then `settings-error` = `The server rejected this display name.`, `settings-status` empty |
| `settings-validation` (correctness only) | `/settings` | settled | select all in `settings-name`, insertText `Al`; select all in `settings-email`, insertText `nope` | click `settings-submit` | `settings-name-error` = `Display name must be at least 3 characters.`, `settings-email-error` = `Enter a valid email address.`, `aria-invalid="true"` on both, focus on `settings-name`, no settings request sent |
| `nav-overview-to-records` | `/` | early, settled | none | click `nav-records` | URL path `/records`, `page-title` = `Records`, 200 `record-row` elements, `nav-records[aria-current="page"]` |
| `history-back` | `/` | settled | click `nav-records`, wait for Records; scroll window to y=1200; click `nav-settings` (the header is sticky, so the click does not scroll), wait for Settings | `page.goBack()` (browser Back) | URL path `/records`, `page-title` = `Records`, 200 rows, `abs(scrollY - 1200) <= 50`; timed from the `popstate`/navigation start |

Correctness-only cases run in the correctness suite for every entrant and are not timed. Every measured case also runs in the correctness suite first; an entrant that fails a case's correctness check reports that case as a failure rather than a timing.

## 11. Changing this contract

The contract is versioned (`v1`). A change that alters visible text, testids, or case assertions bumps the version, re-syncs `shared/` into every app, and invalidates comparisons across versions. Results record `schemaVersion`; published results name the contract version they ran against.
