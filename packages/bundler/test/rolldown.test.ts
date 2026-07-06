import { describe, expect, test, vi } from 'vitest';
import {
	MARKLESS_BUNDLE_GRAPH,
	marklessLib,
	marklessClient,
	marklessServer,
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
import { state } from '@markless/core';

export function App() @{
	let count = state(0);

	<button onClick={() => count++}>{count}</button>
}
`;

const styledSource = `
import { state } from '@markless/core';

export function App() @{
	let label = state('Hi');

	<section class="card">
		<style>
			.card { color: red; }
		</style>
		<p>{label}</p>
	</section>
}
`;

const keyedSource = `
import { state } from '@markless/core';

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

const defaultRouteSource = `
import { state } from '@markless/core';
import { Link } from '@markless/core/router';

export default function Home() @{
	const count = state(0);

	<main>
		<h1>Markless Router</h1>
		<button onClick={() => count++}>Button {count}</button>
		<Link href="/docs">Docs</Link>
	</main>
}
`;

describe('TSRX Rolldown plugin structure', () => {
	test('client build options allow generated entries to extend the app entry surface', () => {
		expect(callOptions(marklessClient(), {})).toMatchObject({
			preserveEntrySignatures: 'allow-extension',
		});
		expect(callOptions(marklessClient(), { preserveEntrySignatures: 'strict' })).toMatchObject({
			preserveEntrySignatures: 'strict',
		});
		expect(callOptions(marklessServer(), {})).toEqual({});
		expect(callOptions(marklessLib(), {})).toEqual({});
	});

	test('transformTsrxModule produces virtual payload, resolver, and symbol modules', async () => {
		const result = await transformTsrxModule({
			filename: '/workspace/app/src/App.tsrx',
			source,
		});

		expect(result.code).not.toContain('export const marklessSource');
		expect(result.code).toContain(
			"import { state as payloadState, view as payloadView } from 'virtual:markless:payload:",
		);
		expect(result.code).not.toContain('import { loadSymbol, symbolManifest }');
		expect(result.code).not.toContain('const marklessSymbolResolverModule');
		expect(result.code).toContain('function loadSymbol(symbolId)');
		expect(result.code).toContain("import('virtual:markless:symbol:");
		expect(result.code).not.toContain('const symbolManifest = [1,');
		expect(result.code).not.toContain(
			"import moduleManifest from 'virtual:markless:module-manifest:",
		);
		expect(result.code).toContain('export { payloadView };');
		expect(result.code).not.toContain('loadSymbol: loadSymbol,');
		expect(result.code).not.toContain('function marklessResumeLoadSymbol');
		expect(result.code).toContain('const marklessCompiledApp = {');
		expect(result.code).toContain('renderCsr: App,');
		expect(result.code).toContain('renderSsr(props) {');
		expect(result.code).toContain('const marklessSsrStateValues = new Map');
		expect(result.code).toContain(
			'const html = marklessSsrHost(marklessSsrHostLocators, "h0", "button") + "<button>" + marklessSsrText(count) + "</button>";',
		);
		expect(result.code).toContain('export default marklessCompiledApp;');
		expect(result.code).not.toContain('source: marklessSource');
		const resumeModule = result.virtualModules.find((module) => module.type === 'resume');
		expect(resumeModule?.source).toContain('export async function resumeContainerEvent');
		expect(resumeModule?.source).toContain('loadSymbol: loadSymbol,');
		expect(result.virtualModules.map((item) => item.type)).toEqual(
			expect.arrayContaining(['payload', 'resolver', 'resume', 'symbol']),
		);
		expect(result.manifest.source).toBe('/workspace/app/src/App.tsrx');
		expect(result.manifest.symbols).toContainEqual(
			expect.objectContaining({
				kind: 'event-handler',
				virtualModuleId: expect.stringContaining('virtual:markless:symbol:'),
			}),
		);
		expect(result.manifest.symbols).toContainEqual(
			expect.objectContaining({
				kind: 'dom-update',
				virtualModuleId: expect.stringContaining('virtual:markless:symbol:'),
			}),
		);
	});

	test('transformTsrxModule emits a server render artifact for default route modules', async () => {
		const result = await transformTsrxModule({
			filename: '/workspace/app/pages/index.tsrx',
			source: defaultRouteSource,
		});

		expect(result.code).toContain('renderSsr(props) {');
		expect(result.code).toContain('"<h1>" + "Markless Router" + "</h1>"');
		expect(result.code).toContain(
			'import { Link as __marklessSsrComponent0 } from "@markless/core/router";',
		);
		expect(result.code).toContain('export default marklessCompiledApp;');
	});

	test('transformTsrxModule emits a CSR-only default artifact without a runtime preload hook', async () => {
		const result = await transformTsrxModule({
			filename: '/workspace/app/src/App.tsrx',
			source,
			environment: 'client',
		});

		expect(result.code).toContain('renderCsr: App,');
		expect(result.code).not.toContain('resumeEventOnlyFromPayloadDocument');
		expect(result.code).not.toContain('resumeContainerEvent');
		expect(result.code).not.toContain('preloadCsrLazySymbols');
		expect(result.code).not.toContain('bundle-graph.json');
		expect(result.code).not.toContain('@markless/core/preload');
		expect(result.code).not.toContain('preload:');
		expect(result.code).toContain('export default marklessCompiledApp;');
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
			source: `import { state } from '@markless/core';
import Child from './Child.tsrx';
export function App() @{
let count = state(0);
<main><button onClick={() => count++}>{count}</button><Child count={count} /></main>
}`,
			environment: 'client',
			clientOutput: 'symbols-only',
		});

		const resumeModule = result.virtualModules.find((module) => module.type === 'resume');
		expect(result.code).not.toContain('export async function resumeContainerEvent');
		expect(resumeModule?.source).toContain('export async function resumeContainerEvent');
		expect(result.code).toContain('export { marklessSsrLoadSymbolRoute as loadSymbol };');
		expect(result.code).toContain('function marklessSsrLoadSymbolRoute(symbolId)');
		expect(resumeModule?.source).toContain('loadSymbol: marklessSsrLoadSymbolRoute,');
		expect(result.code).not.toContain('function marklessResumeLoadSymbol');
		expect(result.code).toContain('import("./Child.tsrx?markless-symbols")');
		expect(result.code).toContain("import('virtual:markless:symbol:");
		expect(result.code).not.toContain('document.createElement');
		expect(result.code).not.toContain('addEventListener');
		expect(result.code).not.toContain('const marklessCompiledApp = {');
		expect(result.code).not.toContain('export default App;');
		expect(result.code).not.toContain('export default marklessCompiledApp;');
		expect(result.code).not.toContain('payloadScripts');
		expect(result.code).not.toContain('moduleManifest');
	});

	test('transformTsrxModule routes child symbols for full client SSR resume', async () => {
		const result = await transformTsrxModule({
			filename: '/workspace/app/src/App.tsrx',
			source: `import { state } from '@markless/core';
import Child from './Child.tsrx';
export function App() @{
let count = state(0);
<main><button onClick={() => count++}>{count}</button><Child count={count} /></main>
}`,
			environment: 'client',
		});

		const resumeModule = result.virtualModules.find((module) => module.type === 'resume');
		expect(result.code).not.toContain('export async function resumeContainerEvent');
		expect(resumeModule?.source).toContain('export async function resumeContainerEvent');
		expect(resumeModule?.source).toContain('loadSymbol: marklessSsrLoadSymbolRoute,');
		expect(result.code).toContain('const marklessLoadLocalSymbol = loadSymbol;');
		expect(result.code).toContain('function marklessSsrLoadSymbolRoute(symbolId)');
		expect(result.code).toContain('import("./Child.tsrx?markless-symbols")');
		expect(result.code).toContain('return marklessLoadLocalSymbol(symbolId);');
		expect(result.code).toContain('renderCsr: marklessRenderCsr,');
		expect(result.code).toContain('export default marklessCompiledApp;');
	});

	test('client plugin emits symbol-only output for named symbols TSRX entries', async () => {
		const plugin = marklessClient();

		await callBuildStart(plugin, {
			cwd: '/workspace/app',
			input: { index: 'index.html', symbols: 'src/App.tsrx' },
		});
		const result = (await callTransform(plugin, source, '/workspace/app/src/App.tsrx')) as {
			code: string;
		};

		expect(result.code).not.toContain('export async function resumeContainerEvent');
		expect(result.code).not.toContain('document.createElement');
		expect(result.code).not.toContain('export default App;');
	});

	test('transformTsrxModule emits a server render artifact without direct CSR emit', async () => {
		const result = await transformTsrxModule({
			filename: '/workspace/app/src/App.tsrx',
			source: `import { state } from '@markless/core';
export function App() @{
let active = state(true);
<main class={active ? 'on' : 'off'}><h1>Hello</h1></main>
}`,
			environment: 'server',
		});

		expect(result.code).toContain('renderSsr(props) {');
		expect(result.code).toContain("marklessSsrAttribute(\"class\", active ? 'on' : 'off')");
		expect(result.code).not.toContain('renderCsr: App,');
	});

	test('transformTsrxModule omits alternate render entry exports', async () => {
		const result = await transformTsrxModule({
			filename: '/workspace/app/src/App.tsrx',
			source,
		});

		expect(result.code).not.toContain('export async function resumeContainerEvent');
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
		expect(result.code).toContain('export default marklessCompiledApp;');
		expect(result.code).toContain('<main><section></section><footer>Done</footer></main>');
		expect(result.code).toContain('syncMarklessPublicRepeat0');
		expect(result.code).toContain('const graph = createMarklessPublicGraph()');
		expect(result.code).toContain('runtime: { async dispatch() {} }');
		expect(result.code).not.toContain('function createMarklessPublicRuntime');
		expect(result.code).toContain('attachMarklessPublicStaticEvents');
		expect(result.code).toContain('const marklessSsrState = marklessComposeState');
		expect(result.code).toContain(
			'state: marklessSsrAttachSnapshots(marklessSsrState, marklessSsrAsyncSnapshots)',
		);
		expect(result.code).toContain(
			'view: { ...marklessSsrComposition.view, branches: marklessSsrMergeBranches(marklessSsrComposition.view.branches, marklessSsrBranches) }',
		);
		expect(result.code).not.toContain('view: marklessPublicView');
		expect(result.code).not.toContain('payloadView.locators.filter');
		expect(result.code).not.toContain('marklessPublicHostNodeIndexes');
		expect(result.code).toContain('locals: { "entry": record.item }');
		expect(result.code).toContain('delegateMarklessPublicRepeat0Events');
		expect(result.code).toContain('parent.addEventListener("click"');
		expect(result.code).toContain('element0.__marklessPublicRepeat0Event0 = record;');
		expect(result.code).not.toContain('element0.addEventListener("click"');
		expect(result.code).not.toContain('findMarklessPublicRepeatEventRecord');
		expect(result.code).toContain('"state:entries"');
	});

	test('transformTsrxModule direct-loads small event symbol sets without a resolver hop', async () => {
		const result = await transformTsrxModule({
			filename: '/workspace/app/src/EightButtons.tsrx',
			source: manyButtonSource(8),
		});

		expect(result.code).not.toContain(
			"const marklessSymbolResolverModule = () => import('virtual:markless:resolver:",
		);
		expect(result.code).toContain('function loadSymbol(symbolId)');
		expect(result.code).toContain('if (symbolId === "symbol:0")');
		expect(result.code).toContain('if (symbolId === "symbol:7")');
		expect(result.code).toContain("import('virtual:markless:symbol:");
		expect(result.code).toMatch(/readMarklessSourceSymbol\(mod, "symbol_0_[a-z0-9]+"\)/);
		expect(result.code).toContain('mod.init__virtual_markless_symbol?.();');
		expect(result.code).not.toContain('name.startsWith("init__virtual_markless_symbol")');
	});

	test('transformTsrxModule keeps compact resolver loading for larger symbol tables', async () => {
		const result = await transformTsrxModule({
			filename: '/workspace/app/src/ManySymbols.tsrx',
			source: manyButtonSource(9),
		});

		expect(result.code).toContain(
			"const marklessSymbolResolverModule = () => import('virtual:markless:resolver:",
		);
		expect(result.code).toContain(
			'return marklessSymbolResolverModule().then((mod) => mod.loadSymbol(symbolId));',
		);
	});

	test('base plugin transforms TSRX and serves generated virtual modules', async () => {
		const plugin = marklessClient();

		callBuildStart(plugin, { cwd: '/workspace/app' });
		const result = (await callTransform(plugin, source, '/workspace/app/src/App.tsrx')) as {
			code: string;
		};
		const encoded = encodeURIComponent('/workspace/app/src/App.tsrx');
		const payloadId = `virtual:markless:payload:${encoded}`;
		const resolverId = `virtual:markless:resolver:${encoded}`;
		const resumeId = `virtual:markless:resume:${encoded}`;

		expect(result.code).toContain('virtual:markless:payload:');
		expect(payloadId).toBeTruthy();
		expect(resolverId).toBeTruthy();
		expect(await callResolveId(plugin, payloadId!)).toEqual(
			expect.objectContaining({ id: `\0${payloadId}` }),
		);
		expect(await callResolveId(plugin, resumeId)).toEqual(
			expect.objectContaining({ id: `\0${resumeId}` }),
		);
		const payloadSource = (await callLoad(plugin, `\0${payloadId}`)) as string;
		expect(payloadSource).toContain('export const state =');
		expect(payloadSource).toContain('export const view =');
		expect(payloadSource).not.toContain('payloadScripts');
		expect(payloadSource).not.toContain('export default');
		const resolverSource = (await callLoad(plugin, `\0${resolverId}`)) as string;
		expect(resolverSource).toContain('if (id === "symbol:0")');
		const resumeSource = (await callLoad(plugin, `\0${resumeId}`)) as string;
		expect(resumeSource).toContain('export async function resumeContainerEvent');
		expect(resumeSource).toContain('resumeEventOnlyFromPayloadDocument');
		const symbolIds = ['symbol:0', 'symbol:1'].map(
			(symbolId) => `virtual:markless:symbol:${encoded}:${encodeURIComponent(symbolId)}`,
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
		const plugin = marklessClient();
		const filename = '/workspace/app/src/ListControls.tsrx';
		const symbolId = `virtual:markless:symbol:${encodeURIComponent(filename)}:${encodeURIComponent('symbol:0')}`;
		const resolve = vi.fn(async () => ({ id: '/workspace/app/src/items.ts' }));

		const result = await callResolveId(plugin, './items', `\0${symbolId}`, { resolve });

		expect(resolve).toHaveBeenCalledWith('./items', filename, { skipSelf: true });
		expect(result).toEqual({ id: '/workspace/app/src/items.ts' });
	});

	test('base plugin resolves transformed virtual resume symbol routes from the source module', async () => {
		const plugin = marklessClient();
		const filename = '/workspace/app/src/ProgressiveFullTier.tsrx';
		const source = `import { state } from '@markless/core';
import Child from './progressive-child-panel.tsrx';
export function App() @{
let count = state(0);
<main><button onClick={() => count++}>{count}</button><Child count={count} /></main>
}`;
		await callBuildStart(plugin, { cwd: '/workspace/app' });
		await callTransform(plugin, source, filename);

		const resumeId = `virtual:markless:resume:${encodeURIComponent(filename)}`;
		const resumeSource = (await callLoad(plugin, `\0${resumeId}`)) as string;
		const symbolRouteSpecifiers = [
			...resumeSource.matchAll(/import\("([^"]+\?markless-symbols)"\)/g),
		].map((match) => match[1]!);
		const resolve = vi.fn(async () => ({
			id: '/workspace/app/src/progressive-child-panel.tsrx?markless-symbols',
		}));

		expect(symbolRouteSpecifiers).toEqual(['./progressive-child-panel.tsrx?markless-symbols']);
		const result = await callResolveId(
			plugin,
			symbolRouteSpecifiers[0]!,
			`\0${resumeId}`,
			{ resolve },
		);

		expect(resolve).toHaveBeenCalledWith(
			'./progressive-child-panel.tsrx?markless-symbols',
			filename,
			{ skipSelf: true },
		);
		expect(result).toEqual({
			id: '/workspace/app/src/progressive-child-panel.tsrx?markless-symbols',
		});
	});

	test('buildStart clears stale virtual modules and transform manifests', async () => {
		const plugin = marklessClient();

		callBuildStart(plugin, { cwd: '/workspace/app' });
		await callTransform(plugin, source, '/workspace/app/src/App.tsrx');
		const encoded = encodeURIComponent('/workspace/app/src/App.tsrx');
		const payloadId = `virtual:markless:payload:${encoded}`;
		const payloadSource = (await callLoad(plugin, `\0${payloadId}`)) as string;
		expect(payloadSource).toContain('export const state =');
		expect(payloadSource).not.toContain('export default');

		callBuildStart(plugin, { cwd: '/workspace/app' });
		expect(await callLoad(plugin, `\0${payloadId}`)).toBeNull();
		const emitFile = vi.fn();
		const symbolId = `virtual:markless:symbol:${encoded}:${encodeURIComponent('symbol:0')}`;
		callGenerateBundle(
			plugin,
			{
				'build/chunk-0.js': {
					type: 'chunk',
					fileName: 'build/chunk-0.js',
					name: 'chunk-0',
					code: 'export default {};',
					exports: ['default'],
					imports: [],
					dynamicImports: [],
					moduleIds: [`\0${symbolId}`],
					facadeModuleId: `\0${symbolId}`,
				},
			},
			emitFile,
		);
		const graph = emittedAsset(emitFile, MARKLESS_BUNDLE_GRAPH);
		expect(JSON.parse(String(graph?.source))).not.toContain('symbol:0');
	});

	test('generateBundle emits the bundle graph from build output', async () => {
		const plugin = marklessClient();
		const emitFile = vi.fn();

		callBuildStart(plugin, { cwd: '/workspace/app' });
		const result = (await callTransform(plugin, source, '/workspace/app/src/App.tsrx')) as {
			code: string;
		};
		expect(result.code).toContain('virtual:markless:payload:');
		const encoded = encodeURIComponent('/workspace/app/src/App.tsrx');
		const entryVirtualIds = [
			`virtual:markless:payload:${encoded}`,
			`virtual:markless:resolver:${encoded}`,
			`virtual:markless:resume:${encoded}`,
		];
		const resolverId = `virtual:markless:resolver:${encoded}`;
		const resolverSource = (await callLoad(plugin, `\0${resolverId}`)) as string;
		const symbolVirtualIds = ['symbol:0', 'symbol:1'].map(
			(symbolId) => `virtual:markless:symbol:${encoded}:${encodeURIComponent(symbolId)}`,
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

		const graphAsset = emittedAsset(emitFile, MARKLESS_BUNDLE_GRAPH);
		const graph = JSON.parse(String(graphAsset?.source)) as Array<string | number>;
		expect(graph).toContain('symbol:0');
		expect(graph).toContain('symbol:1');
		expect(
			graph.some((entry) => typeof entry === 'string' && /^chunk-\d+\.js$/.test(entry)),
		).toBe(true);
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
		expect(resolverChunk?.code).not.toContain('virtual:markless:symbol:');
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
import { state } from '@markless/core';

export function App() @{
	let value = state(0);

	<section>
${buttons}
	</section>
}
`;
}

test('transformTsrxModule emits a scoped style virtual CSS module and imports it', async () => {
	const result = await transformTsrxModule({
		filename: 'src/StyledCard.tsrx',
		source: styledSource,
		buildId: 'test-build',
	});

	const styleModule = result.virtualModules.find((module) => module.type === 'style');
	expect(styleModule).toBeDefined();
	expect(styleModule!.id).toMatch(/^virtual:markless:style:.*\.css$/);
	expect(styleModule!.source).toMatch(/\.card\.mk-[a-z0-9]+ \{ color: red; \}/);
	expect(result.code).toContain(`import ${JSON.stringify(styleModule!.id)};`);
});

test('transformTsrxModule escalates branch- and repeat-bearing modules to the full resume runtime', async () => {
	const plain = await transformTsrxModule({
		filename: '/workspace/app/src/Plain.tsrx',
		source: `
import { state } from '@markless/core';

export function App() @{
	let count = state(0);

	<main>
		<button onClick={() => count++}>Add</button>
		<output>{count}</output>
	</main>
}
`,
		environment: 'client',
	});
	const plainResume = plain.virtualModules.find((module) => module.type === 'resume');
	expect(plain.code).not.toContain('resumeEventOnlyFromPayloadDocument');
	expect(plainResume?.source).toContain('resumeEventOnlyFromPayloadDocument');
	expect(plain.code).not.toContain(
		"import { resumeFromPayloadDocument } from '@markless/core/web/resume';",
	);

	const keyed = await transformTsrxModule({
		filename: '/workspace/app/src/Rows.tsrx',
		source: `
import { state } from '@markless/core';

export function App() @{
	let entries = state([{ code: 'a', title: 'Alpha' }]);
	let chosen = state('');

	<main>
		<section>
			@for (const entry of entries; key entry.code) {
				<article>
					<h2>{entry.title}</h2>
					<button onClick={() => chosen = entry.code}>Choose</button>
				</article>
			}
		</section>
	</main>
}
`,
		environment: 'client',
	});
	// Row events need graph subscriptions and locals dispatch: the resume entry
	// dynamically hands off to the full runtime.
	const keyedResume = keyed.virtualModules.find((module) => module.type === 'resume');
	expect(keyed.code).not.toContain('resumeEventOnlyFromPayloadDocument');
	expect(keyed.code).not.toContain('resumeFromPayloadDocument');
	expect(keyedResume?.source).toContain('resumeFromPayloadDocument');
	expect(keyedResume?.source).toContain("import('@markless/core/web/resume')");
	expect(keyed.code).not.toContain(
		"import { resumeFromPayloadDocument } from '@markless/core/web/resume';",
	);

	const handles = await transformTsrxModule({
		filename: '/workspace/app/src/Focus.tsrx',
		source: `
import { element, state } from '@markless/core';

export function App() @{
	let status = state('idle');
	const box = element();

	<main>
		<input el={box} placeholder="Name" />
		<button onClick={() => { box.focus(); status = 'focused'; }}>Focus</button>
	</main>
}
`,
		environment: 'client',
	});
	// Element handles materialize only after the dynamic full-runtime handoff.
	const handlesResume = handles.virtualModules.find((module) => module.type === 'resume');
	expect(handles.code).not.toContain('resumeEventOnlyFromPayloadDocument');
	expect(handles.code).not.toContain('resumeFromPayloadDocument');
	expect(handlesResume?.source).toContain('resumeFromPayloadDocument');
	expect(handlesResume?.source).toContain("import('@markless/core/web/resume')");
	expect(handles.code).not.toContain(
		"import { resumeFromPayloadDocument } from '@markless/core/web/resume';",
	);

	const boundaries = await transformTsrxModule({
		filename: '/workspace/app/src/Async.tsrx',
		source: `
import { computed, state } from '@markless/core';

export function App() @{
	let query = state('markless');
	let details = computed(async () => {
		return { title: 'Result: ' + query };
	});

	<main>
		<button onClick={() => query = 'vite'}>Search</button>
		@try { <p>{details.title}</p> } @pending { <p>Loading</p> } @catch { <p>Broken</p> }
	</main>
}
`,
		environment: 'client',
	});
	// Async boundary settle and revalidation live behind the dynamic full-runtime handoff.
	const boundariesResume = boundaries.virtualModules.find((module) => module.type === 'resume');
	expect(boundaries.code).not.toContain('resumeEventOnlyFromPayloadDocument');
	expect(boundaries.code).not.toContain('resumeFromPayloadDocument');
	expect(boundariesResume?.source).toContain('resumeFromPayloadDocument');
	expect(boundariesResume?.source).toContain("import('@markless/core/web/resume')");
	expect(boundaries.code).not.toContain(
		"import { resumeFromPayloadDocument } from '@markless/core/web/resume';",
	);

	const withChild = await transformTsrxModule({
		filename: '/workspace/app/src/Shell.tsrx',
		source: `
import { state } from '@markless/core';
import { StatusBadge } from './StatusBadge.tsrx';

export function Shell() @{
	let streaming = state(true);

	<main>
		<button onClick={() => streaming = !streaming}>Toggle</button>
		<StatusBadge active={streaming} />
	</main>
}
`,
		environment: 'client',
	});
	// Child components alone are not payload records. The served payload
	// inventory decides whether the event-only tier can handle the page.
	const withChildResume = withChild.virtualModules.find((module) => module.type === 'resume');
	expect(withChild.code).not.toContain('resumeEventOnlyFromPayloadDocument');
	expect(withChildResume?.source).toContain('resumeEventOnlyFromPayloadDocument');
	expect(withChild.code).not.toContain('loadFullResume: marklessFullResumeHandoff');
	expect(withChild.code).not.toContain("import('@markless/core/web/resume')");
	expect(withChild.code).not.toContain(
		"import { resumeFromPayloadDocument } from '@markless/core/web/resume';",
	);
});
