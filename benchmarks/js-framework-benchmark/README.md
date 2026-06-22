# JS Framework Benchmark Guard

Arcade keeps an accepted keyed `js-framework-benchmark` baseline in
[`baseline.json`](./baseline.json). The baseline includes Arcade plus fixed
comparison scores for Solid, Ripple, `vanillajs`, `vanillajs-3`, and
`vanillajs-lite`.

`pnpm test` runs this guard. In CI, the workflow first benchmarks Arcade from
the base revision and the current revision on the same runner. It then runs the
normal test command with `ARCADE_JSFB_BASELINE_RESULTS` and
`ARCADE_JSFB_RESULTS` pointed at those fresh result directories. If the current
revision is slower than the base revision beyond the configured tolerances,
`pnpm test` fails.

When only `ARCADE_JSFB_RESULTS` is provided, the guard compares against the
accepted Arcade numbers in `baseline.json`. That is useful for local
reproduction on the same machine that accepted the baseline, but CI uses
same-runner base/current results because absolute browser timings are
machine-dependent.

To reproduce the CI setup locally with a JSFB checkout:

```sh
git clone https://github.com/krausest/js-framework-benchmark.git ../js-framework-benchmark
cd ../js-framework-benchmark
npm ci --ignore-scripts
npm run install-webdriver-ts
npm run install-server
cd ../arcade
pnpm bench:jsfb:prepare -- --jsfb-root ../js-framework-benchmark
cd ../js-framework-benchmark
ARCADE_REPO_ROOT=../arcade node --input-type=module -e "import { rebuildFrameworks } from './cli/rebuild-build-single.js'; if (!rebuildFrameworks(['keyed/arcade'], true)) process.exit(1);"
npm start
```

In a second shell:

```sh
cd ../js-framework-benchmark
npm run bench -- \
	--headless \
	--framework keyed/arcade \
	--count 5 \
	--benchmark 01_ 02_ 03_ 04_ 05_ 06_ 07_ 08_ 09_ 40_

cd ../arcade
ARCADE_JSFB_RESULTS=../js-framework-benchmark/webdriver-ts/results pnpm test
```

Run the guard against a JS Framework Benchmark results directory:

```sh
pnpm bench:jsfb:compare -- --results /path/to/js-framework-benchmark/webdriver-ts-results/results
```

Or run it against a normalized JSON file:

```sh
pnpm bench:jsfb:compare -- --results ./current-arcade-results.json
```

The normalized file can be as small as:

```json
{
	"results": {
		"01_run1k": 22.65,
		"02_replace1k": 25.1,
		"03_update10th1k": 16.15,
		"04_select1k": 3.45,
		"05_swap1k": 15.9,
		"06_remove-one-1k": 12.1,
		"07_create10k": 229.9,
		"08_create1k-after1k": 24.05,
		"09_clear1k": 9.5,
		"41_size-uncompressed": 10.8,
		"42_size-compressed": 3.7,
		"43_first-paint": 74
	}
}
```

The command exits non-zero when Arcade gets materially worse than the accepted
Arcade baseline:

- CPU geomean regression over 3%.
- Any individual CPU benchmark regression over 7%.
- Raw size regression over 0.5 kB.
- Gzip size regression over 0.15 kB.

First paint is reported as a warning because it is too noisy for a hard PR gate
unless repeated runs confirm the regression.
