# Interaction benchmark results site

A static site built from runner output with plain HTML, CSS, a little JS and inline SVG charts. It uses no framework, including none of the entrants.

## Build

```sh
node demos/interaction-benchmark/site/build.mjs --runs <run-dir> [<run-dir>...] [--out <dir>]
```

Each run directory is a `runner/run.mjs --out` directory (`run.json`, `results.jsonl`, `raw.jsonl`, `summary.json`, ...). Without `--runs`, the build uses `data/site.json` `defaultRuns`. Output goes to `site/dist/`:

- `index.html`: entrants (versions, prerelease status, rendering, deploy runtime, navigation, variants, deviations, demo links) and dated runs with build IDs.
- `runs/<run-id>/index.html`: targets and build identities, every cell with failure counts, bytes and requests, raw downloads (`results.jsonl`, `raw.jsonl`, `summary.json`, ... copied verbatim).
- `runs/<run-id>/cases/<case>.html`: per browser × profile × phase, charts and tables of median, p95, IQR, std dev, n and failures, with input-to-response and navigation-to-response separate.
- `protocol.html`: generated from `CONTRACT.md`, `runner/README.md` and the goal's sampling and fairness rules.
- `compare.html`: rendering, activation, delivery and navigation per entrant, with source links.
- `observations.html`: upstream observations.

Statistics use `runner/lib/stats.mjs` and the runner's cell key, so the site's numbers match `summary.json`.

## Data you maintain

- `data/entrants.json`: extracted by hand from each `apps/<id>/BENCH.md`. Recheck it when a BENCH.md changes.
- `data/deployments.json`: preview URLs and the runtime and region Vercel actually used, filled in by the deploy task. A `null` URL shows as "not deployed yet".
- `data/observations.json`: upstream observations. They are phrased as observations, not diagnosed bugs.

## Sample data

`node demos/interaction-benchmark/site/scripts/sample-run.mjs` runs the real runner against its plain-JS selftest fixture (ports 4495 and 4496) and writes `sample-runs/selftest-fixture/` with a `SAMPLE.json` marker. The site labels any run with that marker as SAMPLE fixture data. It never shows sample data as framework results, even though the records carry the entrant name `markless` to satisfy the schema.

## Checks

```sh
node demos/interaction-benchmark/site/scripts/check.mjs    # document basics, balanced tags, ids, ARIA refs, internal links and fragments
node demos/interaction-benchmark/site/scripts/smoke.mjs    # Chromium opens the index, a run and a case page (PORT, default 4497)
```

## Deploy

`build.mjs` reads `../runner` and repository docs, so a Vercel-side build cannot run it. Build locally, then run `vercel deploy` from `site/`. `.vercelignore` uploads only `dist/` and `vercel.json`, and `vercel.json` serves `dist` as a static output with no build step.
