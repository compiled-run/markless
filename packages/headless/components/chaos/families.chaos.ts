// Seeded interaction storms against six high-interaction families. Gated: run on
// chaos/vitest.config.ts, not in the `ui` project's glob. See ./README.md.

import { afterEach, beforeAll, expect, test } from 'vitest';
import { tick } from './actions.ts';
import { families } from './families.ts';
import { RUN_SEED, replayHint } from './seed.ts';
import { ACTIONS_PER_STORM, STORM_KINDS, runStorm } from './storm.ts';

// Storms are long, and every gesture inside one waits on the widget.
const STORM_TIMEOUT = { timeout: 60_000 };

beforeAll(() => {
	console.log(`chaos run seed ${RUN_SEED} - replay with:\n  ${replayHint()}`);
});

// The overlay behaviour keeps one module-level stack for the whole page, so a
// storm that leaves a surface enlisted leaves the next one's dismissals going to it.
afterEach(async () => {
	for (let unwind = 0; unwind < 4; unwind++) {
		document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
		await tick();
	}
});

test('every storm is the same length, so a run is bounded by families x storms', () => {
	expect(STORM_KINDS.length).toBe(3);
	expect(ACTIONS_PER_STORM).toBe(40);
	expect(families.length).toBe(6);
});

for (const family of families) {
	for (const kind of STORM_KINDS) {
		test(
			`${family.name}: survives a ${kind} storm and still works afterwards`,
			STORM_TIMEOUT,
			async () => {
				await runStorm(family, kind);
			},
		);
	}
}
