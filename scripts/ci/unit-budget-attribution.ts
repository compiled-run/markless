// Records which test file this vitest worker runs, so unit-budget.mjs can split its memory peak by file,
// and how long the file's tests took, so it can tell the runner's speed from the suite's own files.
import { appendFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { afterAll, beforeAll, expect } from 'vitest';

const dir = process.env.MARKLESS_UNIT_BUDGET_FILES;
const file = expect.getState().testPath;
if (dir && file) {
	const name = relative(process.cwd(), file);
	writeFileSync(join(dir, String(process.pid)), name);
	// A setup file's beforeAll runs first and its afterAll last, so this spans what vitest reports as the file's duration.
	let started = 0;
	beforeAll(() => {
		started = performance.now();
	});
	afterAll(() => {
		const durations = join(dir, 'durations');
		mkdirSync(durations, { recursive: true });
		appendFileSync(
			join(durations, String(process.pid)),
			`${JSON.stringify({ file: name, ms: Math.round(performance.now() - started) })}\n`,
		);
	});
}
