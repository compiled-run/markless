// A test heavy-tests.json names under "inWorkerBuilds" or "slotHolders" holds a build slot until the file ends.
import { readFileSync } from 'node:fs';
import { relative, resolve } from 'node:path';
import { afterAll, beforeAll, expect } from 'vitest';
import { holdBuildSlot } from '../../packages/router/test/support/build-slots.ts';
import { holdsSlotForFile, type HeavyTestsManifest } from './in-worker-builds.ts';

const repoRoot = resolve(import.meta.dirname, '../..');
const manifest = JSON.parse(
	readFileSync(resolve(import.meta.dirname, 'heavy-tests.json'), 'utf8'),
) as HeavyTestsManifest;
const file = expect.getState().testPath;
const test = file && relative(repoRoot, file);

if (test && holdsSlotForFile(manifest, test)) {
	let release: (() => Promise<void>) | undefined;
	beforeAll(async () => {
		release = await holdBuildSlot();
	}, 600_000);
	// The slot frees here, before the worker exits, so a build elsewhere can start while this worker's memory is still resident.
	afterAll(() => release?.());
}
