import { beforeAll, expect, test } from 'vitest';
import {
	evaluate,
	formatReport,
	measure,
	readAnchors,
	saveLastMeasurement,
	type Evaluation,
} from '../../../../scripts/benchmarks/perf-guards/index.mjs';

let evaluation: Evaluation;

beforeAll(async () => {
	const measurement = await measure({
		build: process.env.MARKLESS_PERF_GUARD_NO_BUILD !== '1',
		log: (message: string) => console.error(`[perf-guard] ${message}`),
	});
	saveLastMeasurement(measurement);
	evaluation = evaluate(measurement, readAnchors());
	console.error(formatReport(evaluation));
}, 600_000);

const guards = {
	G1: 'critical path: one fetch round (bytes reported, not gated)',
	G2: 'zero JS fetched by the first use of any control',
	G3: 'first-use execution cost per action',
	G4: 'no action leaves a lean dispatch path unannounced',
	G5: 'a started runtime dispatches in the input task',
	G6: 'over-preload waste (reported, not gated)',
	G7: 'eager compile hint only on preloaded packs',
	G8: 'client navigation fetches its code in one round',
	G9: 'no chunk names the hashed file of a chunk several pages load',
	G10: 'each framework runtime module within its per-feature anchor',
	G11: 'a page ships only runtime feature modules its own compiled demand names',
	G12: 'compiler-emitted glue per construct within its anchor',
	G13: 'resume data each list row adds within its anchor',
	G14: 'code for content a page has not shown does not run at load',
	G15: 'a page runs no more code at load for linking more routes',
	G16: 'no page runs or downloads more JS at load than its anchor',
} as const;

for (const [guard, title] of Object.entries(guards)) {
	test(`${guard} ${title}`, () => {
		const failures = evaluation.failures.filter((finding) => finding.guard === guard);
		expect(failures.map((finding) => finding.message)).toEqual([]);
	});
}

test('every failing guard has a test above', () => {
	const unnamed = evaluation.failures.filter((finding) => !Object.hasOwn(guards, finding.guard));
	expect(unnamed.map((finding) => `${finding.guard}: ${finding.message}`)).toEqual([]);
});
