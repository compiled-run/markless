// A test named under "inWorkerBuilds" in heavy-tests.json builds in this worker, so it holds a build slot until the file ends.
import { readFileSync } from 'node:fs';
import { relative, resolve } from 'node:path';
import { afterAll, beforeAll, expect } from 'vitest';
import { holdBuildSlot } from '../../packages/router/test/support/fixture-build.ts';
import type { InWorkerBuildRule } from './in-worker-builds.ts';

const repoRoot = resolve(import.meta.dirname, '../..');
const { inWorkerBuilds } = JSON.parse(
	readFileSync(resolve(import.meta.dirname, 'heavy-tests.json'), 'utf8'),
) as { inWorkerBuilds: InWorkerBuildRule };
const file = expect.getState().testPath;
const test = file && relative(repoRoot, file);

if (test && inWorkerBuilds.tests.some((entry) => entry.test === test)) {
	let release: (() => Promise<void>) | undefined;
	beforeAll(async () => {
		release = await holdBuildSlot();
	}, 600_000);
	afterAll(() => release?.());
}
