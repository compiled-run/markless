# Interaction benchmark runner

The external Playwright runner for the interaction benchmark. It drives every entrant with the same trusted inputs and assertions, all taken from `../CONTRACT.md` (contract v1), and writes records that follow `../shared/result.schema.json`. It is plain Node ESM with no install step: Playwright resolves from the repository root (`@playwright/test` 1.58.2).

| File | Purpose |
| --- | --- |
| `run.mjs` | Timing runner. It runs a correctness pass first, then timed visits. |
| `correctness.mjs` | Correctness-only suite. It reports pass or fail with no timing claims and exits 1 on any failure. |
| `cases.mjs` | CONTRACT.md section 10 as data (the testid selectors, untimed setup steps, measured input, and assertions). Adding or changing a case only means editing this data. |
| `targets.mjs` | Target registry. Each entry holds a serve command and port from `apps/<name>/BENCH.md`, plus the package list used to record versions. |
| `proxy.mjs` | One reverse proxy placed in front of every local entrant, plus the shaped listeners that emulate the constrained network. |
| `lib/page-agent.mjs` | Script injected into every page before the app's own scripts. It records input time, checks assertions, and estimates presentation time. |
| `lib/measure.mjs` | One visit: a fresh browser context, throttling, network accounting, and the schema record. |
| `selftest/` | Plain-JS fixture, its server, and `run.mjs`, which checks the runner end to end. |

## Usage

```sh
# Correctness for every registry entrant (each starts from apps/<name>, fronted by the proxy)
node demos/interaction-benchmark/runner/correctness.mjs

# Timing: 30 visits per cell, Chromium + WebKit, normal + constrained profiles
node demos/interaction-benchmark/runner/run.mjs --visits 30 --out /tmp/bench-run

# Subsets
node demos/interaction-benchmark/runner/run.mjs --targets markless,qwik --cases overview-counter-first,records-sort \
  --phases early --profiles constrained --browsers chromium --visits 10

# Deployed previews: visit URLs directly (no proxy); host is recorded as vercel for *.vercel.app
node demos/interaction-benchmark/runner/run.mjs --targets markless,qwik \
  --target-url markless=https://….vercel.app --target-url qwik=https://….vercel.app \
  --source-revision markless=<sha> --source-revision qwik=<sha>

# An app server you already started: front it with the proxy
node demos/interaction-benchmark/runner/run.mjs --targets qwik --target-upstream qwik=http://127.0.0.1:4420

node demos/interaction-benchmark/runner/selftest/run.mjs
```

Flags: `--visits N` (default 30), `--warmup N` (default 0; warmup visits are written to `raw.jsonl` only), `--targets`, `--cases`, `--phases early,settled`, `--profiles normal,constrained`, `--browsers chromium,webkit`, `--out <dir>` (default `runner/results/<runId>`), `--target-url name=url`, `--target-upstream name=url`, `--proxy-port name=port`, `--shaped-proxy-port name=port` (first shaped listener's port, one more per further shaped profile; default: any free port), `--network-shaping proxy|cdp` (default `proxy`), `--transport proxy|direct`, `--variant name=label`, `--source-revision name=rev`, `--action-timeout ms` (default 10000), `--nav-timeout`, `--settle-timeout`, `--drain-timeout`, `--skip-correctness`, `--chromium-channel chrome`, `--headed`.

## Outputs (`--out`)

- `results.jsonl`: one schema record for each visit, including failed ones. A failed visit has a non-null `failure` and null latencies. Every record is checked against `shared/result.schema.json` with a small built-in validator. Any invalid record makes the run exit 1.
- `raw.jsonl`: one diagnostic record per visit, joined to `results.jsonl` by `order`. It holds every failure with the observed DOM, the stage timings, which detector fired, pending requests at input time, the measured click's ready-check paint entry (`inputPaintGate`; focus steps record theirs in `steps`), `inputAfterFcpMs` (measured input time minus that document's first contentful paint, recorded for failed visits too when the input reached the page), the per-request network log, preload hints, console and page errors, service-worker evidence, and each `unavailable` reason.
- `summary.json` / `summary.md`: statistics for each cell (entrant, variant, browser, profile, case, phase). Each cell has success and visit counts, failure counts by kind, and median, p95, mean, stddev, q1/q3/IQR, MAD, min, and max for every metric. Only successful visits enter these statistics. Failures are counted beside them and never dropped.
- `run.json`: configuration, browser and Playwright versions, and target identities (URL, build id, source revision, versions, proxy protocol and compression counters). It also holds metric labels, schema validation results, and the correctness totals.
- `correctness.json`: results of the correctness pass.

## Protocol

- **Fresh visits.** Every visit gets a new browser context with a 1440×1000 viewport. Service workers are allowed and recorded; the contract forbids them. In Chromium the HTTP cache is disabled through CDP (Chrome's debugging protocol).
- **Visit order.** Each visit index rotates the target order by one position, which alternates the order when there are two targets. The loop order is browser, then profile, case, phase, visit index, and target.
- **Phases** (CONTRACT.md section 9):
  - `early`: after `goto` commits, the runner waits until each control is painted and ready, then sends the input. The runner does not wait for DOMContentLoaded, load, or preloads.
- **Ready (both phases, every click and focus step).** The page agent checks the control from Playwright's `waitForFunction` polling. A check passes only when all of these hold:
  - the document has a `first-contentful-paint` or `first-paint` entry (skipped only in a browser without Paint Timing);
  - the control is visible, not `disabled`, and not `aria-disabled="true"`;
  - its box (left, top, width, height) is non-empty and identical in the current check and in the last two `requestAnimationFrame` callbacks the agent recorded for it, so at least one rendered frame showed it where the input will land;
  - its centre point is inside the viewport, and `document.elementFromPoint` at that point is the control or a descendant.
  A control outside the viewport is scrolled to the centre first, and its box must then settle again over two frames. No input can therefore arrive before the page's first paint.
  - `settled`: the runner waits for `load`, then 500 ms with no main-frame request in flight, then 500 ms more.
- **Profiles:**
  - `normal`: no throttling.
  - `constrained`: 150 ms round-trip time, 5 Mbps down, 1 Mbps up, and 4× CPU slowdown.
  - The network part is applied by the proxy's shaped listener (below) in both browsers, so Chromium and WebKit see the same link. `--network-shaping cdp` switches Chromium to CDP network emulation instead; CDP adds latency per request rather than per connection, so the two methods are not interchangeable. WebKit always uses the proxy.
  - The CPU slowdown needs CDP, so only Chromium gets it. WebKit constrained visits run at full CPU speed and say so: `profile.cpu` is `{ name: "unthrottled-no-cdp", slowdown: 1 }` and `raw.profileApplied.cpuNotApplied` gives the reason. (The schema requires a `cpu` object, so it cannot be null.)
  - `profile.network.name` ends in `@proxy` or `@cdp`, `deployment.responseEvidence.transport` names the method, and `run.json` lists what each browser applied per profile.
- **Trusted input.** Clicks are `page.mouse.click` at the element's centre. Keys use `keyboard.press`, and text uses `keyboard.insertText`. Select-all is `ControlOrMeta+A`. Back is `page.goBack()`. Focus steps wait for the same ready check, then call `el.focus()` (the contract's `locator.focus()`).
- **Timings.** A capture-phase listener takes the input time from the first `pointerdown`, `keydown`, or `input` event's `event.timeStamp`. For Back it uses the `popstate` or Navigation API `navigate` event. If Back loads a new document, it uses that document's navigation start. The assertion is checked after every DOM mutation and on every animation frame.
  - `inputToDomMs`: time until the assertion first holds.
  - `inputToResponseMs`: time until the presentation estimate, which is the first animation frame after the assertion holds plus the next frame callback. This is labeled an estimate, not a paint time.
  - `navToResponseMs`: from navigation start to the same estimate. It is reported for the early phase only.
  - `pendingMs` and `serverMs`: settings submit only. `serverMs` comes from Resource Timing.
  - `eventDurationMs`: Chromium's Event Timing duration for the interaction. It is null below the browser's 16 ms reporting threshold.
- **Failures.** Failure kinds come from the schema's enum.
  - `input-lost`: the page's capture listener saw the input, but the DOM never changed within 10 s. The usual cause in the early phase is an input that arrives after first paint and before the page's event listeners exist. `raw.jsonl` carries `inputLost` as proof: the input time, FCP, and the start and `responseEnd` of every script resource, all in ms since the document's time origin.
  - `timeout`: the input was sent but the page never saw it, and no response appeared within 10 s.
  - `wrong-response`: the state changed but not to the asserted value, the value was already present before the input, it did not persist for the hold period (100 ms, or 300 ms for x10), or a forbidden request was sent.
  - `precondition`: a setup step failed.
  - `build-mismatch`: the `benchmark:entrant` or `benchmark:build` meta tag differs from the run's recorded build, or is missing.
  - `page-error`: an uncaught exception or console error.
  - `request-failed`: a main-frame document, script, stylesheet, fetch, or XHR request failed, other than an abort.
  - `navigation-error`, `deployment-protection`, and `unsupported` cover the remaining cases.
- **Network and bytes.** Only main-frame requests count. Chromium data comes from CDP events plus Resource Timing body sizes. `initial` counts requests started before the input. `perAction` counts requests from the input to the response, and `perActionDocument` shows whether the input loaded a new document. Byte totals cover responses whose request started before the response. The runner lets them finish after the timing is taken, up to `--drain-timeout`, and then counts them in full. The raw record also counts preload hints: `<link rel=modulepreload|preload>` in the HTML, the same rels in HTTP `Link` headers, and the link elements in the DOM at the end of the visit.
- **Correctness first.** Before timing, `run.mjs` runs each selected case once in Chromium under the normal profile. If a case fails there, each of its cells gets one record carrying that failure and is not timed.

## Controlled-host transport (`proxy.mjs`)

Local entrants run on their own production server (see `targets.mjs`). The proxy listens on `app port + 1000`, for example `https://127.0.0.1:5410` for Markless, so every entrant gets the same transport:

- HTTP/2 over TLS, with a self-signed certificate generated by `openssl`. The browser ignores the certificate errors. If `openssl` is missing, the proxy falls back to HTTP/1.1 keep-alive and records that.
- Responses the upstream sent uncompressed are compressed with brotli quality 5 as they stream, flushed per chunk. This covers text, JS, CSS, HTML, JSON, and SVG.
- Responses the upstream already encoded pass through unchanged.

For each network-shaped profile the proxy opens an extra listener. Its TCP connections are relayed to the proxy through an emulated link:

- Each direction is a FIFO bottleneck at the profile's rate (download for proxy to browser, upload for browser to proxy) followed by a fixed delay of half the round-trip time. The limit applies to the connection's whole byte stream, TLS records included, so HTTP/2 streams share it as on a real link. Up to 64 KB may queue at the bottleneck before the proxy side is paused.
- The browser's first bytes leave one round-trip time after the connection is accepted, which models the TCP handshake. A new connection therefore costs about 3 round trips before the first response (TCP, TLS 1.3, request).
- Not modeled: TCP slow start, packet loss, jitter, and kernel socket buffering on the loopback hop.

The selftest checks the link against this model within 15%: TLS handshake about 2 RTT, a small request on an open connection about 1 RTT, a 250 KiB incompressible download about RTT + size/5 Mbps (from Node and from both browsers), and a 32 KiB upload about RTT + size/1 Mbps.

`run.json` records the protocol, compression counters, and shaped listener URLs. Each record's `deployment.responseEvidence` records the document's protocol and encoding. Standalone use: `node runner/proxy.mjs --upstream http://127.0.0.1:4410 --port 5410`.

## Limitations

- **WebKit (no CDP):**
  - No CPU throttling: constrained cells get the proxy-shaped network but full CPU speed, labeled in every record. They are not directly comparable with Chromium constrained cells.
  - A target not fronted by the proxy (`--transport direct` or deployed URLs) cannot get proxy shaping; its constrained cells are recorded once as `failure.kind = "unsupported"`. Chromium can use `--network-shaping cdp` for such targets.
  - The HTTP cache cannot be disabled. Visits are cold only because each uses a fresh context, and cache reuse within a visit is possible.
  - Compressed bytes come from Playwright's `request.sizes()`. Decoded bytes come from Resource Timing, which reads 0 for cross-origin responses without `Timing-Allow-Origin`.
  - Long tasks, LCP, and Event Timing are feature-detected. WebKit reports them as null, and the raw record gives the reason.
- **LCP** is null when the input arrives before the browser reports its first LCP candidate, because the browser stops LCP at the first input.
- **Request start times** use CDP `wallTime` in Chromium and the Node clock at the Playwright `request` event in WebKit. They are compared with the page clock (`performance.timeOrigin + now`) to split requests into initial and per-action.
- **Server lifetime.** Servers stay up for the whole run, so warm server and function state is part of every sample. A cold browser does not mean a cold server.
- **Selftest identity.** The selftest fixture uses the entrant name `markless` only to satisfy the schema's entrant enum. Its records go to a temp directory and are not Markless results.
