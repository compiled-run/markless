import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, expect, test } from 'vitest';
import type { LinkedArtifactChild } from '@markless/compiler';
import { materializeDelegateChildren } from '../src/link-driver.ts';

const directory = mkdtempSync(join(tmpdir(), 'markless-delegate-'));
afterAll(() => rmSync(directory, { recursive: true, force: true }));

const child = (edgeId: string): LinkedArtifactChild => ({
	edgeId,
	componentName: 'Frame',
	importSource: '@acme/frame',
	importKind: 'default',
	hasChildren: false,
	props: [],
});

test('a delegate this runtime cannot import fails open instead of crashing the link', async () => {
	// A resolved source the plan marks loadable and `import()` rejects: the
	// workspace states no Node engine requirement, so a raw TypeScript delegate
	// is exactly this case wherever type stripping is unavailable.
	const source = join(directory, 'frame.mjs');
	writeFileSync(source, 'this is not valid JavaScript (\n', 'utf8');

	await expect(
		materializeDelegateChildren(
			{ resolve: async () => source },
			'/workspace/app/src/App.tsrx',
			[child('edge-1'), child('edge-2')],
		),
	).resolves.toEqual({});
});
