# Deployed docs comparison

Workflow guidance: .ruler/skills/markless-implementation/implementation.md, .ruler/skills/markless-implementation/performance.md, .ruler/skills/markless-implementation/release.md

Owner instruction: deploy the updated docs through Vercel CLI and compare against next.qwik.dev again. Scope: deployment outputs, the two live comparison scripts, and this report/results. No production source changes, package publication, branch push, or goal closure.

## Results, September 22

The new deployment removes Markless's previous repeat-sidebar wait. Both sites now respond in under a millisecond on normal-CPU repeats. Markless responds sooner to early sidebar clicks while loading; Qwik responds sooner to the first sidebar click after downloads have settled. These results do not establish a universal framework winner.

Sidebar medians, captured click to DOM mutation:

| Scenario | Markless | Qwik |
|---|---:|---:|
| Earliest hittable click, normal | 58.10 ms | 191.30 ms |
| Earliest hittable click, constrained | 3,488.10 ms | 5,567.30 ms |
| First click after loading, normal CPU | 42.85 ms | 20.60 ms |
| Second click, normal CPU | 0.80 ms | 0.30 ms |
| Third click, normal CPU | 0.60 ms | 0.20 ms |
| First click after loading, 4× CPU | 85.35 ms | 36.20 ms |
| Second click, 4× CPU | 3.15 ms | 1.35 ms |
| Third click, 4× CPU | 2.45 ms | 0.60 ms |

The early-sidebar and settled-first-click differences exceed the predefined threshold. Repeat differences between the sites do not. Markless's previous deployed third-sidebar-click median was 16.20 ms; it is now 0.60 ms. The separately recorded local paired build comparison establishes that the import-reuse change causes that improvement without relying on this historical cross-deployment comparison.

Navigation to the first verified sidebar response: normal 438.30 ms for Markless versus 760.10 ms for Qwik; constrained 4,304.40 versus 6,073.00 ms. The constrained profile is 4× CPU, 150 ms latency, 5 Mbps download and 1 Mbps upload. Both sites still have multi-second early waits under this profile.

### Network

Each settled state-docs visit requested five framework JS files in the main document for Markless versus 306 for Qwik. Encoded body totals were 280,104 bytes for Markless and approximately 1,047,000 bytes for Qwik. These totals exclude unrelated site scripts and iframe activity. Neither site's settled clicks started additional script requests.

No framework responses in the settled visits came from disk cache or a service worker, and none failed. Qwik's observed service-worker response was its Partytown analytics sandbox document. Within-page module reuse after loading is expected and distinct from a warm browser visit.

### Counter and failure checks

This comparison uses Markless's counter inside its full state documentation page and Qwik's standalone counter demo. Their surrounding workloads differ:

| Earliest counter click | Markless | Qwik |
|---|---:|---:|
| Normal | 44.80 ms | 137.80 ms |
| Constrained | 3,433.60 ms | 1,862.95 ms among four successful visits |

Normal navigation-to-working medians were 429.60 versus 665.40 ms; constrained medians were 4,228.20 versus 2,271.75 ms among successes.

The primary run passed 79 of 80 visits: 40/40 Markless and 39/40 Qwik. It verified 389 successful primary clicks; a failing visit stopped before its planned burst. Nineteen counter visits retained the ten-click burst after the first successful click. One of five constrained Qwik counter visits captured a trusted first click at approximately 394 ms after navigation but remained at zero for the ten-second deadline. A second click then changed the connected button to one. There were no page errors or failed framework responses in that visit. The recovery click is excluded from first-click latency statistics. Cause is not established; a separate ten-visit follow-up is recorded below rather than replacing this failure.

Qwik's state-docs visits also reported `Identifier 't' has already been declared`; the sidebar interactions succeeded. This is a page-observed error, not an attribution to the Qwik framework. Markless reported no page errors. Failed analytics requests and requests aborted when closing a test context are retained in the raw local records and are not classified as interaction failures.

The separate Qwik-only follow-up passed nine of ten constrained counter visits and reproduced the timeout once. That first click was captured at approximately 418 ms after navigation; the counter remained zero through the ten-second deadline and changed to one after the recovery click. No page errors or failed framework requests accompanied it. Thus two first-click timeouts were observed across the original five and the follow-up ten constrained Qwik counter visits. This is a small diagnostic sample, not a production failure-rate estimate or a diagnosed Qwik defect. The follow-up does not replace the primary results.

The browser subsequently verified that the five served Markless JS response bodies exactly match the uploaded files, with HTTP 200 responses and no page errors, and the deployed counter advanced to three. Screenshot: `/private/tmp/markless-deployed-import-reuse.png`.

Timing rows, summaries, framework network observations, failure audits, deployment-byte verification, and source hashes are preserved in [LIVE-QWIK-COMPARISON.json](./LIVE-QWIK-COMPARISON.json). Full local request logs: `/private/tmp/markless-qwik-live-sidebar-updated.json`, `/private/tmp/markless-qwik-early-updated.json`, and `/private/tmp/markless-qwik-counter-followup.json`. Preview authorization cookies are stored separately and are not included in these results.

## Protocol

Protocol recorded before measurement: use the same published-site controls as the preceding comparison. Markless state docs sidebar versus Qwik state docs sidebar; Markless's embedded counter versus Qwik's standalone counter demo as a separately labelled comparison. Fresh Chrome contexts, 1440 × 1000 viewport, HTTP cache disabled. Allow each site's normal service-worker behavior and record actual cache/service-worker responses. No source rewriting, response interception, CPU profiling, concurrent builds, or other owned browser tests during timing.

Settled sidebar: ten visits per site at normal and 4× CPU, three trusted clicks each, alternate site order, one discarded warmup per site. Wait for framework downloads to finish before the first click. Record main-document framework request count and transferred body bytes separately from iframe activity.

Early input: five visits per site/control/profile, alternate site order. Click immediately after first contentful paint and a visible, hittable control; scroll the counter into view. Test normal conditions and 4× CPU with 150 ms network latency, 5 Mbps download, 1 Mbps upload. Measure captured click to expected DOM mutation and navigation to first verified response; check ten rapid counter clicks retain each increment. Record pending downloads at input and failures separately.

Compare medians and MAD. A meaningful difference exceeds max(10 ms, 10% of the slower median, twice the larger MAD). These are published-application measurements, not equivalent applications compiled with two frameworks; the counter pages in particular have different surrounding workloads. DOM response is not compositor paint or formal TTI. Do not infer a universal framework advantage from request counts or tiny sub-millisecond differences.

Deployment: https://markless-docs-j1c0voi9l-jack-shelton.vercel.app/markless/ (`dpl_3Nu7gWRVgrzJGZ8sXpVzs7f9ZQCH`), created with `NITRO_PRESET=vercel pnpm run build` and `vercel deploy --prebuilt --yes`. Vercel reports READY. The 63 emitted client file hashes match the saved locally tested candidate, with no mismatches. Authenticated deployment HTML returns 200 and contains the counter and five modulepreloads.

Root `pnpm run typecheck` passes for the experiment-script addition. This task changes no production source. The previous change's root/docs typechecks, 205 router tests, 64 docs tests, and navigation/execution checks remain applicable; six previously recorded whole-repository fixture-budget failures are not resolved by a preview deployment.
