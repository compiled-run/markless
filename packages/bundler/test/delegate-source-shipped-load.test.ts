import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'pathe';
import { afterAll, expect, test, vi } from 'vitest';
import type { LinkedArtifactChild } from '@markless/compiler';
import { createBuildDelegateLoader } from '../src/build/delegate-loader.ts';
import { createDelegateModuleCache, materializeDelegateChildren } from '../src/link-driver.ts';
import { marklessClient } from '../src/rolldown.ts';
import { callBuildStart, callLoad, callTransform } from './helpers.ts';

const directory = mkdtempSync(join(tmpdir(), 'markless-source-delegate-'));
afterAll(() => rmSync(directory, { recursive: true, force: true }));

const AUTHORED_FRAME = 'export function Frame({ label }) @{\n\t<div class="frame">{label}</div>\n}\n';

// The shape a source-shipped package has on a consumer's disk: a TypeScript
// barrel under node_modules re-exporting the authored component module.
function installSourceShippedPackage(name: string, component = AUTHORED_FRAME) {
	const packageDirectory = join(directory, 'node_modules', name);
	mkdirSync(packageDirectory, { recursive: true });
	writeFileSync(
		join(packageDirectory, 'package.json'),
		`${JSON.stringify({ name, type: 'module', exports: './index.ts' })}\n`,
		'utf8',
	);
	writeFileSync(join(packageDirectory, 'index.ts'), "export { Frame } from './frame.tsrx';\n");
	writeFileSync(join(packageDirectory, 'frame.tsrx'), component, 'utf8');
	return join(packageDirectory, 'index.ts');
}

// Stands in for the build's `this.resolve`: a dependency's own files are not in
// the app's module graph, so its directory is what answers for them.
function packageRelativeResolve() {
	return vi.fn(async (specifier: string, importer?: string) =>
		specifier.startsWith('.') && importer ? resolve(dirname(importer), specifier) : undefined,
	);
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

test('the build-mode loader executes a source-shipped delegate with no dev server', async () => {
	const source = installSourceShippedPackage('@acme/built-frame');
	const loader = createBuildDelegateLoader();
	const resolveSpecifier = packageRelativeResolve();
	const importModule = (id: string) => loader.load(id, resolveSpecifier);

	const rendered = await materializeDelegateChildren(
		{ resolve: async () => source },
		join(directory, 'App.tsrx'),
		[child('edge-1')],
		{ modules: createDelegateModuleCache(), importModule },
	);

	// The barrel's `.ts` and the `.tsrx` behind it are compiled and run in
	// process, so the edge contributes real markup and real render data.
	expect(rendered.diagnostics).toEqual([]);
	expect(rendered.materializations['edge-1']?.html).toBe('<div class="frame">Sized</div>');
	expect(rendered.materializations['edge-1']?.elementCount).toBe(1);
	expect(rendered.materializations['edge-1']?.view.domUpdates).toEqual([
		expect.objectContaining({ source: 'label', path: ['label'] }),
	]);

	// Per build, not per page: a second page composing the same delegate reuses
	// the module this build already executed, even with its own edge table.
	const compiles = resolveSpecifier.mock.calls.length;
	const second = await materializeDelegateChildren(
		{ resolve: async () => source },
		join(directory, 'Other.tsrx'),
		[child('edge-2')],
		{ modules: createDelegateModuleCache(), importModule },
	);
	expect(second.materializations['edge-2']?.html).toBe('<div class="frame">Sized</div>');
	expect(resolveSpecifier.mock.calls.length).toBe(compiles);
	expect(await loader.load(source, resolveSpecifier)).toBe(
		await loader.load(source, resolveSpecifier),
	);
});

test('a production build inlines a source-shipped delegate into its render data', async () => {
	const barrel = installSourceShippedPackage('@acme/page-frame');
	const appRoot = join(directory, 'app');
	mkdirSync(join(appRoot, 'pages'), { recursive: true });
	const page = join(appRoot, 'pages/index.tsrx');
	// No `dev`, so the plugin has no dev server and no module runner to borrow.
	const plugin = marklessClient({ rootDir: appRoot });
	const warn = vi.fn();
	callBuildStart(plugin, { cwd: appRoot });

	await callTransform(
		plugin,
		`import { Frame } from '@acme/page-frame';
export default function Page() @{ <main><Frame label="Sized" /></main> }`,
		page,
		{
			resolve: vi.fn(async (specifier: string, importer?: string) =>
				specifier === '@acme/page-frame'
					? { id: barrel }
					: specifier.startsWith('.') && importer
						? { id: resolve(dirname(importer), specifier) }
						: null,
			),
			getModuleInfo: () => ({ isEntry: true }),
			warn,
		},
	);
	const loaded = await callLoad(
		plugin,
		`\0virtual:markless:render-data:${encodeURIComponent(page)}`,
	);
	const renderData =
		typeof loaded === 'string' ? loaded : ((loaded as { code?: string } | null)?.code ?? '');

	expect(renderData).toContain('<div class=\\"frame\\">Sized</div>');
	expect(warn.mock.calls.map(([message]) => String(message))).not.toContainEqual(
		expect.stringContaining('MARKLESS_DELEGATE_ARTIFACT_MISSING'),
	);
});

test('a delegate the build loader cannot compile keeps the fail-closed diagnostic', async () => {
	const source = installSourceShippedPackage('@acme/unparseable', 'export function Frame( @{\n');
	const loader = createBuildDelegateLoader();
	const resolveSpecifier = packageRelativeResolve();

	const result = await materializeDelegateChildren(
		{ resolve: async () => source },
		join(directory, 'App.tsrx'),
		[child('edge-1')],
		{
			modules: createDelegateModuleCache(),
			importModule: (id: string) => loader.load(id, resolveSpecifier),
		},
	);

	expect(result.materializations).toEqual({});
	expect(result.diagnostics.map((diagnostic) => diagnostic.code)).toEqual([
		'MARKLESS_DELEGATE_ARTIFACT_MISSING',
	]);
	expect(result.importFailures[0]?.source).toBe(source);
});
