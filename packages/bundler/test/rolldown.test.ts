import { describe, expect, test, vi } from 'vitest';
import {
	ARCADE_BUNDLE_GRAPH,
	ARCADE_MANIFEST_FILE,
	arcadeLib,
	arcadeClient,
	arcadeServer,
	transformTsrxModule,
} from '../src/rolldown.ts';
import {
	callBuildStart,
	callGenerateBundle,
	callLoad,
	callOptions,
	callResolveId,
	callTransform,
} from './helpers.ts';

const source = `
import { state } from '@arcade/core';

export function App() @{
	let count = state(0);

	<button onClick={() => count++}>{count}</button>
}
`;

const keyedSource = `
import { state } from '@arcade/core';

export function App() @{
	let entries = state([]);
	let chosen = state(null);

	<main>
		<section>
			@for (const entry of entries; key entry.code) {
				<article class={chosen === entry.code ? 'picked' : 'plain'}>
					<h2>{entry.title}</h2>
					<button onClick={() => chosen = entry.code}>Choose</button>
				</article>
			}
		</section>
		<footer>Done</footer>
	</main>
}
`;

describe('TSRX Rolldown plugin structure', () => {
	test('client build options allow generated entries to extend the app entry surface', () => {
		expect(callOptions(arcadeClient(), {})).toMatchObject({
			preserveEntrySignatures: 'allow-extension',
		});
		expect(callOptions(arcadeClient(), { preserveEntrySignatures: 'strict' })).toMatchObject({
			preserveEntrySignatures: 'strict',
		});
		expect(callOptions(arcadeServer(), {})).toEqual({});
		expect(callOptions(arcadeLib(), {})).toEqual({});
	});

	test('transformTsrxModule produces virtual payload, resolver, and symbol modules', async () => {
		const result = await transformTsrxModule({
			filename: '/workspace/app/src/App.tsrx',
			source,
		});

		expect(result.code).not.toContain('export const arcadeSource');
		expect(result.code).toContain(
			"import { state as payloadState, view as payloadView } from 'virtual:arcade:payload:",
		);
		expect(result.code).not.toContain('import { loadSymbol, symbolManifest }');
		expect(result.code).not.toContain('const arcadeSymbolResolverModule');
		expect(result.code).toContain('function loadSymbol(symbolId)');
		expect(result.code).toContain("import('virtual:arcade:symbol:");
		expect(result.code).not.toContain('const symbolManifest = [1,');
		expect(result.code).not.toContain(
			"import moduleManifest from 'virtual:arcade:module-manifest:",
		);
		expect(result.code).toContain('export { payloadView };');
		expect(result.code).toContain('const arcadeCompiledApp = {');
		expect(result.code).toContain('renderCsr: App,');
		expect(result.code).toContain('renderSsr(props) {');
		expect(result.code).toContain('const arcadeSsrStateValues = new Map');
		expect(result.code).toContain(
			'const html = arcadeSsrHost(arcadeSsrHostLocators, "h0", "button") + "<button>" + arcadeSsrText(count) + "</button>";',
		);
		expect(result.code).toContain('export default arcadeCompiledApp;');
		expect(result.code).not.toContain('source: arcadeSource');
		expect(result.virtualModules.map((item) => item.type)).toEqual(
			expect.arrayContaining(['payload', 'resolver', 'symbol']),
		);
		expect(result.manifest.source).toBe('/workspace/app/src/App.tsrx');
		expect(result.manifest.symbols).toContainEqual(
			expect.objectContaining({
				kind: 'event-handler',
				virtualModuleId: expect.stringContaining('virtual:arcade:symbol:'),
			}),
		);
		expect(result.manifest.symbols).toContainEqual(
			expect.objectContaining({
				kind: 'dom-update',
				virtualModuleId: expect.stringContaining('virtual:arcade:symbol:'),
			}),
		);
	});

	test('transformTsrxModule emits a CSR-only default artifact for client builds', async () => {
		const result = await transformTsrxModule({
			filename: '/workspace/app/src/App.tsrx',
			source,
			environment: 'client',
		});

		expect(result.code).toContain(
			"import { preloadLazySymbolModules } from 'arcade/preload';",
		);
		expect(result.code).toContain('preload: preloadCsrLazySymbols,');
		expect(result.code).toContain('export default arcadeCompiledApp;');
		expect(result.code).not.toContain('renderSsr(props) {');
		expect(result.code).not.toContain('state: payloadState');
	});

	test('transformTsrxModule scopes browser symbol export names by source file', async () => {
		const first = await transformTsrxModule({
			filename: '/workspace/app/src/App.tsrx',
			source,
		});
		const second = await transformTsrxModule({
			filename: '/workspace/app/src/Player.tsrx',
			source,
		});
		const firstSymbol = first.manifest.symbols[0]!;
		const secondSymbol = second.manifest.symbols[0]!;
		const firstModule = first.virtualModules.find(
			(module) => module.type === 'symbol' && module.symbolId === firstSymbol.symbolId,
		)!;

		expect(firstSymbol.symbolId).toBe(secondSymbol.symbolId);
		expect(firstSymbol.exportName).toMatch(/^symbol_0_[a-z0-9]+$/);
		expect(secondSymbol.exportName).toMatch(/^symbol_0_[a-z0-9]+$/);
		expect(firstSymbol.exportName).not.toBe(secondSymbol.exportName);
		expect(firstModule.source).toContain(`export function ${firstSymbol.exportName}`);
	});

	test('transformTsrxModule emits symbol-only client roots for SSR browser symbols', async () => {
		const result = await transformTsrxModule({
			filename: '/workspace/app/src/App.tsrx',
			source: `import { state } from '@arcade/core';
import Child from './Child.tsrx';
export function App() @{
let count = state(0);
<main><button onClick={() => count++}>{count}</button><Child count={count} /></main>
}`,
			environment: 'client',
			clientOutput: 'symbols-only',
		});

		expect(result.code).toContain('export async function resumeContainerEvent');
		expect(result.code).toContain('export { arcadeSsrLoadSymbolRoute as loadSymbol };');
		expect(result.code).toContain('function arcadeSsrLoadSymbolRoute(symbolId)');
		expect(result.code).toContain('import("./Child.tsrx?arcade-symbols")');
		expect(result.code).toContain("import('virtual:arcade:symbol:");
		expect(result.code).not.toContain('document.createElement');
		expect(result.code).not.toContain('addEventListener');
		expect(result.code).not.toContain('const arcadeCompiledApp = {');
		expect(result.code).not.toContain('export default App;');
		expect(result.code).not.toContain('export default arcadeCompiledApp;');
		expect(result.code).not.toContain('payloadScripts');
		expect(result.code).not.toContain('moduleManifest');
	});

	test('client plugin emits symbol-only output for named symbols TSRX entries', async () => {
		const plugin = arcadeClient();

		await callBuildStart(plugin, {
			cwd: '/workspace/app',
			input: { index: 'index.html', symbols: 'src/App.tsrx' },
		});
		const result = (await callTransform(
			plugin,
			source,
			'/workspace/app/src/App.tsrx',
		)) as { code: string };

		expect(result.code).toContain('export async function resumeContainerEvent');
		expect(result.code).not.toContain('document.createElement');
		expect(result.code).not.toContain('export default App;');
	});

	test('transformTsrxModule emits a server render artifact without direct CSR emit', async () => {
		const result = await transformTsrxModule({
			filename: '/workspace/app/src/App.tsrx',
			source: `import { state } from '@arcade/core';
export function App() @{
let active = state(true);
<main class={active ? 'on' : 'off'}><h1>Hello</h1></main>
}`,
			environment: 'server',
		});

		expect(result.code).toContain('renderSsr(props) {');
		expect(result.code).toContain('arcadeSsrAttribute("class", active ? \'on\' : \'off\')');
		expect(result.code).not.toContain('renderCsr: App,');
	});

	test('transformTsrxModule omits alternate render entry exports', async () => {
		const result = await transformTsrxModule({
			filename: '/workspace/app/src/App.tsrx',
			source,
		});

		expect(result.code).toContain('export async function resumeContainerEvent');
		expect(result.code).not.toContain('export function render(');
		expect(result.code).not.toContain('export function renderToString(');
	});

	test('transformTsrxModule exports a public render component from compiler repeat artifacts', async () => {
		const result = await transformTsrxModule({
			filename: '/workspace/app/src/Entries.tsrx',
			source: keyedSource,
		});

		expect(result.code).toContain('export function App()');
		expect(result.code).toContain('renderCsr: App,');
		expect(result.code).toContain('export default arcadeCompiledApp;');
		expect(result.code).toContain('<main><section></section><footer>Done</footer></main>');
		expect(result.code).toContain('syncArcadePublicRepeat0');
		expect(result.code).toContain('const graph = createArcadePublicGraph()');
		expect(result.code).toContain('runtime: { async dispatch() {} }');
		expect(result.code).not.toContain('function createArcadePublicRuntime');
		expect(result.code).toContain('attachArcadePublicStaticEvents');
		expect(result.code).toContain('state: payloadState');
		expect(result.code).toContain('view: arcadeSsrComposition.view');
		expect(result.code).not.toContain('view: arcadePublicView');
		expect(result.code).not.toContain('payloadView.locators.filter');
		expect(result.code).not.toContain('arcadePublicHostNodeIndexes');
		expect(result.code).toContain('locals: { "entry": record.item }');
		expect(result.code).toContain('delegateArcadePublicRepeat0Events');
		expect(result.code).toContain('parent.addEventListener("click"');
		expect(result.code).toContain('element0.__arcadePublicRepeat0Event0 = record;');
		expect(result.code).not.toContain('element0.addEventListener("click"');
		expect(result.code).not.toContain('findArcadePublicRepeatEventRecord');
		expect(result.code).toContain('"state:entries"');
	});

	test('transformTsrxModule direct-loads small event symbol sets without a resolver hop', async () => {
		const result = await transformTsrxModule({
			filename: '/workspace/app/src/EightButtons.tsrx',
			source: manyButtonSource(8),
		});

		expect(result.code).not.toContain(
			"const arcadeSymbolResolverModule = () => import('virtual:arcade:resolver:",
		);
		expect(result.code).toContain('function loadSymbol(symbolId)');
		expect(result.code).toContain('if (symbolId === "symbol:0")');
		expect(result.code).toContain('if (symbolId === "symbol:7")');
		expect(result.code).toContain("import('virtual:arcade:symbol:");
		expect(result.code).toMatch(/readArcadeSourceSymbol\(mod, "symbol_0_[a-z0-9]+"\)/);
		expect(result.code).toContain('mod.init__virtual_arcade_symbol?.();');
		expect(result.code).not.toContain('name.startsWith("init__virtual_arcade_symbol")');
	});

	test('transformTsrxModule keeps compact resolver loading for larger symbol tables', async () => {
		const result = await transformTsrxModule({
			filename: '/workspace/app/src/ManySymbols.tsrx',
			source: manyButtonSource(9),
		});

		expect(result.code).toContain(
			"const arcadeSymbolResolverModule = () => import('virtual:arcade:resolver:",
		);
		expect(result.code).toContain(
			'return arcadeSymbolResolverModule().then((mod) => mod.loadSymbol(symbolId));',
		);
	});

	test('base plugin transforms TSRX and serves generated virtual modules', async () => {
		const plugin = arcadeClient();

		callBuildStart(plugin, { cwd: '/workspace/app' });
		const result = (await callTransform(plugin, source, '/workspace/app/src/App.tsrx')) as {
			code: string;
		};
		const encoded = encodeURIComponent('/workspace/app/src/App.tsrx');
		const payloadId = `virtual:arcade:payload:${encoded}`;
		const resolverId = `virtual:arcade:resolver:${encoded}`;

		expect(result.code).toContain('virtual:arcade:payload:');
		expect(payloadId).toBeTruthy();
		expect(resolverId).toBeTruthy();
		expect(await callResolveId(plugin, payloadId!)).toEqual(
			expect.objectContaining({ id: `\0${payloadId}` }),
		);
		const payloadSource = (await callLoad(plugin, `\0${payloadId}`)) as string;
		expect(payloadSource).toContain('export const state =');
		expect(payloadSource).toContain('export const view =');
		expect(payloadSource).toContain('export const payloadScripts =');
		expect(payloadSource).toContain('export default payloadScripts;');
		const resolverSource = (await callLoad(plugin, `\0${resolverId}`)) as string;
		expect(resolverSource).toContain('if (id === "symbol:0")');
		const symbolIds = ['symbol:0', 'symbol:1'].map(
			(symbolId) => `virtual:arcade:symbol:${encoded}:${encodeURIComponent(symbolId)}`,
		);
		const symbolSources = await Promise.all(
			symbolIds.map((symbolId) => callLoad(plugin, `\0${symbolId}`) as Promise<string>),
		);
		expect(symbolSources).toEqual(
			expect.arrayContaining([
				expect.stringContaining('context.graph.update({'),
				expect.stringContaining('type: "setText"'),
			]),
		);
	});

	test('base plugin resolves symbol module relative imports from the source module', async () => {
		const plugin = arcadeClient();
		const filename = '/workspace/app/src/ListControls.tsrx';
		const symbolId = `virtual:arcade:symbol:${encodeURIComponent(filename)}:${encodeURIComponent('symbol:0')}`;
		const resolve = vi.fn(async () => ({ id: '/workspace/app/src/items.ts' }));

		const result = await callResolveId(plugin, './items', `\0${symbolId}`, { resolve });

		expect(resolve).toHaveBeenCalledWith('./items', filename, { skipSelf: true });
		expect(result).toEqual({ id: '/workspace/app/src/items.ts' });
	});

	test('buildStart clears stale virtual modules and transform manifests', async () => {
		let manifest:
			| {
					modules?: unknown[];
			  }
			| undefined;
		const plugin = arcadeClient({
			onManifest: (next) => {
				manifest = next;
			},
		});

		callBuildStart(plugin, { cwd: '/workspace/app' });
		await callTransform(plugin, source, '/workspace/app/src/App.tsrx');
		const payloadId = `virtual:arcade:payload:${encodeURIComponent(
			'/workspace/app/src/App.tsrx',
		)}`;
		expect(await callLoad(plugin, `\0${payloadId}`)).toContain('export default');

		callBuildStart(plugin, { cwd: '/workspace/app' });
		expect(await callLoad(plugin, `\0${payloadId}`)).toBeNull();
		const emitFile = vi.fn();
		callGenerateBundle(plugin, {}, emitFile);
		expect(manifest?.modules).toEqual([]);
		expect(emittedAsset(emitFile, ARCADE_MANIFEST_FILE)).toBeUndefined();
	});

	test('generateBundle emits bundle graph and in-memory manifest metadata from build output', async () => {
		let manifest:
			| {
					version?: number;
					modules?: Array<{
						source?: string;
						symbols?: Array<{ fileName?: string }>;
					}>;
					bundleGraphAsset?: string;
			  }
			| undefined;
		const plugin = arcadeClient({
			onManifest: (next) => {
				manifest = next as never;
			},
		});
		const emitFile = vi.fn();

		callBuildStart(plugin, { cwd: '/workspace/app' });
		const result = (await callTransform(plugin, source, '/workspace/app/src/App.tsrx')) as {
			code: string;
		};
		expect(result.code).toContain('virtual:arcade:payload:');
		const encoded = encodeURIComponent('/workspace/app/src/App.tsrx');
		const entryVirtualIds = [
			`virtual:arcade:payload:${encoded}`,
			`virtual:arcade:resolver:${encoded}`,
		];
		const resolverId = `virtual:arcade:resolver:${encoded}`;
		const resolverSource = (await callLoad(plugin, `\0${resolverId}`)) as string;
		const symbolVirtualIds = ['symbol:0', 'symbol:1'].map(
			(symbolId) => `virtual:arcade:symbol:${encoded}:${encodeURIComponent(symbolId)}`,
		);
		const virtualIds = [...entryVirtualIds, ...symbolVirtualIds].map((id) => `\0${id}`);
		const bundle = Object.fromEntries(
			virtualIds.map((id, index) => [
				`build/chunk-${index}.js`,
				{
					type: 'chunk',
					fileName: `build/chunk-${index}.js`,
					name: `chunk-${index}`,
					code: id === `\0${resolverId}` ? resolverSource : 'export default {};',
					exports: ['default'],
					imports: [],
					dynamicImports: [],
					moduleIds: [id],
					facadeModuleId: id,
				},
			]),
		);

		callGenerateBundle(plugin, bundle, emitFile);

		expect(manifest).toMatchObject({
			version: 1,
			modules: [expect.objectContaining({ source: '/workspace/app/src/App.tsrx' })],
		});
		expect(manifest?.bundleGraphAsset).toBe(ARCADE_BUNDLE_GRAPH);
		expect(manifest?.modules[0]?.symbols[0]?.fileName).toMatch(/^chunk-\d+\.js$/);
		expect(emitFile).toHaveBeenCalledWith(
			expect.objectContaining({
				type: 'asset',
				fileName: ARCADE_BUNDLE_GRAPH,
			}),
		);
		expect(emittedAsset(emitFile, ARCADE_MANIFEST_FILE)).toBeUndefined();
		const resolverChunk = Object.values(bundle).find(
			(item): item is { code: string; moduleIds: string[] } =>
				typeof item === 'object' &&
				item != null &&
				'code' in item &&
				'moduleIds' in item &&
				Array.isArray(item.moduleIds) &&
				item.moduleIds.includes(`\0${resolverId}`),
		);
		expect(resolverChunk?.code).toContain('if (id === "symbol:0")');
		expect(resolverChunk?.code).toContain('import(/* @vite-ignore */ "./chunk-');
		expect(resolverChunk?.code).not.toContain('virtual:arcade:symbol:');
	});

	test('generateBundle emits arcade-manifest.json only when explicitly requested', () => {
		const plugin = arcadeClient({ emitManifestJson: true });
		const emitFile = vi.fn();

		callBuildStart(plugin, { cwd: '/workspace/app' });
		callGenerateBundle(plugin, {}, emitFile);

		const manifestAsset = emittedAsset(emitFile, ARCADE_MANIFEST_FILE);
		expect(manifestAsset).toMatchObject({
			type: 'asset',
			fileName: ARCADE_MANIFEST_FILE,
		});
		expect(JSON.parse(String(manifestAsset?.source)).modules).toEqual([]);
	});
});

function emittedAsset(emitFile: ReturnType<typeof vi.fn>, fileName: string) {
	return emitFile.mock.calls.map((call) => call[0]).find((item) => item.fileName === fileName);
}

function manyButtonSource(count: number): string {
	const buttons = Array.from(
		{ length: count },
		(_, index) =>
			`		<button onClick={() => value = ${index + 1}}>Set ${index + 1}</button>`,
	).join('\n');
	return `
import { state } from '@arcade/core';

export function App() @{
	let value = state(0);

	<section>
${buttons}
	</section>
}
`;
}
