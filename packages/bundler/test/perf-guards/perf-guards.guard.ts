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
	G9: 'built chunks name no other chunk file, so an edit renames only the chunks it changed',
	G10: 'each framework runtime module within its per-feature anchor',
	G11: 'a page ships only runtime feature modules its own compiled demand names',
	G12: 'compiler-emitted glue per construct within its anchor',
} as const;

for (const [guard, title] of Object.entries(guards)) {
	test(`${guard} ${title}`, () => {
		const failures = evaluation.failures.filter((finding) => finding.guard === guard);
		expect(failures.map((finding) => finding.message)).toEqual([]);
	});
}
