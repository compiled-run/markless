import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, expect, test } from 'vitest';
import type { LinkedArtifactChild } from '@markless/compiler';
import { createDelegateModuleCache, materializeDelegateChildren } from '../src/link-driver.ts';

const directory = mkdtempSync(join(tmpdir(), 'markless-source-delegate-'));
afterAll(() => rmSync(directory, { recursive: true, force: true }));

// The shape a source-shipped package has on a consumer's disk: a TypeScript
// barrel under node_modules re-exporting the authored component module.
function installSourceShippedPackage(name: string) {
	const packageDirectory = join(directory, 'node_modules', name);
	mkdirSync(packageDirectory, { recursive: true });
	writeFileSync(
		join(packageDirectory, 'package.json'),
		`${JSON.stringify({ name, type: 'module', exports: './index.ts' })}\n`,
		'utf8',
	);
	writeFileSync(join(packageDirectory, 'index.ts'), "export { Frame } from './frame.tsrx';\n");
	writeFileSync(join(packageDirectory, 'frame.tsrx'), 'component Frame() { <div /> }\n');
	return join(packageDirectory, 'index.ts');
}

const child = (edgeId: string): LinkedArtifactChild => ({
	edgeId,
	componentName: 'Frame',
	importSource: '@acme/frame',
	importKind: 'named',
	importedName: 'Frame',
	hasChildren: false,
	props: [{ name: 'label', kind: 'serializable', value: 'Sized' }],
});

test('a source-shipped delegate renders at build time through the environment loader', async () => {
	const source = installSourceShippedPackage('@acme/frame');
	const context = { resolve: async () => source };

	// Without a loader that can execute a source-shipped module there is nothing
	// to inline: the barrel re-exports TSRX, which no plain import can run.
	const unloaded = await materializeDelegateChildren(context, join(directory, 'App.tsrx'), [
		child('edge-1'),
	]);
	expect(unloaded.materializations).toEqual({});
	expect(unloaded.diagnostics.map((diagnostic) => diagnostic.code)).toEqual([
		'MARKLESS_DELEGATE_ARTIFACT_MISSING',
	]);

	// The environment's module runner compiles the package the same way the app's
	// own modules are compiled, so the delegate hands back its markup.
	const loads: string[] = [];
	const importModule = async (id: string) => {
		loads.push(id);
		return {
			Frame: {
				renderSsr: (props: { readonly label: string }) => ({
					html: `<div class="frame">${props.label}</div>`,
					elementCount: 1,
				}),
			},
		};
	};
	const modules = createDelegateModuleCache();
	const rendered = await materializeDelegateChildren(
		context,
		join(directory, 'App.tsrx'),
		[child('edge-1')],
		{ modules, importModule },
	);
	expect(rendered.diagnostics).toEqual([]);
	expect(rendered.materializations['edge-1']?.html).toBe('<div class="frame">Sized</div>');

	// Per build, not per call: a second page composing the same delegate reuses
	// the module this build already executed.
	const second = await materializeDelegateChildren(
		context,
		join(directory, 'Other.tsrx'),
		[child('edge-2')],
		{ modules, importModule },
	);
	expect(second.materializations['edge-2']?.html).toBe('<div class="frame">Sized</div>');
	expect(loads).toEqual([source]);
});

test('a delegate no loader can execute keeps the fail-closed diagnostic', async () => {
	const source = installSourceShippedPackage('@acme/broken');
	const modules = createDelegateModuleCache();
	const importModule = async () => {
		throw new Error('MARKLESS_DEV_MODULE_RUNNER_UNAVAILABLE: ssr');
	};

	const result = await materializeDelegateChildren(
		{ resolve: async () => source },
		join(directory, 'App.tsrx'),
		[child('edge-1'), child('edge-2')],
		{ modules, importModule },
	);

	expect(result.materializations).toEqual({});
	expect(result.importFailures).toHaveLength(1);
	expect(result.importFailures[0]?.edgeIds).toEqual(['edge-1', 'edge-2']);
	expect(result.importFailures[0]?.message).toContain('MARKLESS_DEV_MODULE_RUNNER_UNAVAILABLE');
	for (const diagnostic of result.diagnostics) {
		expect(diagnostic.code).toBe('MARKLESS_DELEGATE_ARTIFACT_MISSING');
	}

	// The failed load is remembered for the build instead of being retried per edge.
	const retried = await materializeDelegateChildren(
		{ resolve: async () => source },
		join(directory, 'Other.tsrx'),
		[child('edge-3')],
		{ modules, importModule },
	);
	expect(retried.materializations).toEqual({});
	expect(retried.importFailures[0]?.message).toContain(
		'MARKLESS_DEV_MODULE_RUNNER_UNAVAILABLE',
	);
});
