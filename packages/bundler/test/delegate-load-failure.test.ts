import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, expect, test } from 'vitest';
import {
	type LinkedArtifactChild,
	linkDelegateChildren,
	planDelegateChildren,
} from '@markless/compiler';
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

	const result = await materializeDelegateChildren(
		{ resolve: async () => source },
		'/workspace/app/src/App.tsrx',
		[child('edge-1'), child('edge-2')],
	);

	expect(result.materializations).toEqual({});
	// The import error is the only account of why these edges rendered nothing,
	// so it travels with the source and every edge it left unrendered.
	expect(result.importFailures).toHaveLength(1);
	const [failure] = result.importFailures;
	expect(failure?.source).toBe(source);
	expect(failure?.edgeIds).toEqual(['edge-1', 'edge-2']);
	expect(failure?.message).toBeTruthy();

	// The pass names that cause in the diagnostic it emits for the edge.
	const { diagnostics } = linkDelegateChildren({
		children: planDelegateChildren([child('edge-1')], { 'edge-1': source }),
		renderings: {},
		importFailures: result.importFailures,
	});
	expect(diagnostics[0]?.code).toBe('MARKLESS_DELEGATE_ARTIFACT_MISSING');
	expect(diagnostics[0]?.message).toContain(failure!.message);
});
