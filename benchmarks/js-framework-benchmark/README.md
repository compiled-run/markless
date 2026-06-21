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
npm ci
npm run install-local
cd ../arcade
pnpm bench:jsfb:prepare -- --jsfb-root ../js-framework-benchmark
cd ../js-framework-benchmark
npm run rebuild-ci -- keyed/arcade
npm start
```

In a second shell:

```sh
cd ../js-framework-benchmark
npm run bench -- \
	--headless \
	--framework keyed/arcade \
	--benchmark 01_ 02_ 03_ 04_ 05_ 06_ 07_ 08_ 09_ 41_ 42_ 43_ \
	--resultsDir "$PWD/webdriver-ts/results-arcade-local" \
	--tracesDir "$PWD/webdriver-ts/traces-arcade-local"

cd ../arcade
ARCADE_JSFB_RESULTS=../js-framework-benchmark/webdriver-ts/results-arcade-local pnpm test
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
		"01_run1k": 22.7,
		"02_replace1k": 24.6,
		"03_update10th1k": 6.9,
		"04_select1k": 2.4,
		"05_swap1k": 3.8,
		"06_remove-one-1k": 6.2,
		"07_create10k": 230.4,
		"08_create1k-after1k": 25.4,
		"09_clear1k": 2.6,
		"41_size-uncompressed": 10.8,
		"42_size-compressed": 3.7,
		"43_first-paint": 78.1
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
