// Seeded interaction storms against every interactive shipped family. Gated: run
// on chaos/vitest.config.ts, not in the `ui` project's glob. See ./README.md.

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

test('a run is bounded: two storms per family, one gesture count for all of them', () => {
	expect(ACTIONS_PER_STORM).toBe(30);
	expect(families.every((family) => family.storms.length === 2)).toBe(true);
	expect(families.every((family) => family.storms.every((kind) => STORM_KINDS.includes(kind)))).toBe(
		true,
	);
	expect(new Set(families.map((family) => family.name)).size).toBe(families.length);
});

for (const family of families) {
	for (const kind of family.storms) {
		test(
			`${family.name}: survives a ${kind} storm and still works afterwards`,
			STORM_TIMEOUT,
			async () => {
				await runStorm(family, kind);
			},
		);
	}
}
