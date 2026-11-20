// A test named under "inWorkerBuilds" or "slotHolders" in heavy-tests.json holds a build slot until the file ends: it builds in
// this worker, or keeps so much memory outside the slot that no build may run beside it.
import { readFileSync } from 'node:fs';
import { relative, resolve } from 'node:path';
import { afterAll, beforeAll, expect } from 'vitest';
import { holdBuildSlot } from '../../packages/router/test/support/build-slots.ts';
import type { InWorkerBuildRule, SlotHolderRule } from './in-worker-builds.ts';

const repoRoot = resolve(import.meta.dirname, '../..');
const { inWorkerBuilds, slotHolders } = JSON.parse(
	readFileSync(resolve(import.meta.dirname, 'heavy-tests.json'), 'utf8'),
) as { inWorkerBuilds: InWorkerBuildRule; slotHolders: SlotHolderRule };
const file = expect.getState().testPath;
const test = file && relative(repoRoot, file);

if (test && [...inWorkerBuilds.tests, ...slotHolders.tests].some((entry) => entry.test === test)) {
	let release: (() => Promise<void>) | undefined;
	beforeAll(async () => {
		release = await holdBuildSlot();
	}, 600_000);
	afterAll(() => release?.());
}
