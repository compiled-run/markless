import { describe, expect, test, vi } from 'vitest';
import { mkdtemp, rm } from 'node:fs/promises';
import { resolve } from 'pathe';
import { pathToFileURL } from 'node:url';
import { build as viteBuild, type Plugin } from 'vite';
import {
	MARKLESS_BUNDLE_GRAPH,
	marklessLib,
	marklessClient,
	marklessServer,
	resumeVirtualModuleId,
	transformTsrxModule,
} from '../src/rolldown.ts';
import { MARKLESS_EXECUTION_LOG_MODULE_ID } from '../src/execution-log.ts';
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

const capabilityFreeSource = `
export function App() @{
	<main>Static prerendered page</main>
}
`;

const fullResumeSource = `
import { state, storage } from '@markless/core';
export const theme = storage('theme-mode', 'light');
export function App() @{
	let count = state(0);
	<button data-theme={theme} onClick={() => count++}>{count}</button>
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
	let count = state(0);

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
			'import { state as payloadState, view as payloadView, runtimeDemandMap as payloadRuntimeDemandMap } from "virtual:markless:payload:',
		);
		expect(result.code).not.toContain('import { loadSymbol, symbolManifest }');
		expect(result.code).not.toContain('const marklessSymbolResolverModule');
		expect(result.code).toContain('function loadSymbol(symbolId)');
		expect(result.code).toContain('import("virtual:markless:symbol:');
		expect(result.code).not.toContain('const symbolManifest = [1,');
		expect(result.code).not.toContain(
			"import moduleManifest from 'virtual:markless:module-manifest:",
		);
		expect(result.code).toContain('export { payloadView };');
		expect(result.code).toContain('export { payloadRuntimeDemandMap };');
		expect(result.code).not.toContain('loadSymbol: loadSymbol,');
		expect(result.code).not.toContain('function marklessResumeLoadSymbol');
		expect(result.code).toContain('const marklessCompiledApp = {');
		expect(result.code).toContain('inlineResumerSources:');
		expect(result.code).not.toContain('__MARKLESS_INLINE_SYNC_POLICY__');
		expect(result.code).not.toContain('runInlineResumer');
		expect(result.code).toContain('renderCsr: App');
		expect(result.code).toContain('renderSsr(props, marklessRenderContext) {');
		expect(result.code).toContain('const marklessSsrStateValues = new Map');
		expect(renderDataModuleSource(result)).toContain(
			'"statics":["<button><!--markless-slot:0-->","</button>"]',
		);
		expect(result.code).toContain('export default marklessCompiledApp;');
		expect(result.code).not.toContain('source: marklessSource');
		const resumeModule = result.virtualModules.find((module) => module.type === 'resume');
		expect(resumeModule?.source).toContain('export async function resumeContainerEvent');
		expect(resumeModule?.source).toContain('await Promise.resolve(loadSymbol("symbol:0"))'); // T015e: specialized dispatcher awaits the symbol directly
		expect(result.virtualModules.map((item) => item.type)).toEqual(
			expect.arrayContaining(['payload', 'render-data', 'resolver', 'resume', 'symbol']),
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

		expect(result.code).toContain('renderSsr(props, marklessRenderContext) {');
		expect(renderDataModuleSource(result)).toContain(
			'"<main><h1>Markless Router</h1><button>Button <!--markless-slot:0-->"',
		);
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

		expect(result.code).toContain('renderCsr: App');
		expect(result.code).not.toContain('inlineResumerSources:');
		expect(result.code).not.toContain('resumeEventOnlyFromPayloadDocument');
		expect(result.code).not.toContain('resumeContainerEvent');
		expect(result.code).not.toContain('preloadCsrLazySymbols');
		expect(result.code).not.toContain('bundle-graph.json');
		expect(result.code).not.toContain('@markless/core/preload');
		expect(result.code).not.toContain('preload:');
		expect(result.code).toContain('export default marklessCompiledApp;');
		expect(result.code).not.toContain('renderSsr(props, marklessRenderContext) {');
		expect(result.code).not.toContain('state: payloadState');
	});

	test('client dev keeps native CSR chunk data available without build-time HTML injection', async () => {
		const production = await transformTsrxModule({
			filename: '/workspace/app/src/App.tsrx',
			source: styledSource,
			environment: 'client',
		});
		const dev = await transformTsrxModule({
			filename: '/workspace/app/src/App.tsrx',
			source: styledSource,
			environment: 'client',
			dev: true,
		});

		expect(production.code).not.toContain('nativeFallback');
		expect(dev.code).toContain('nativeFallback');
		expect(dev.code).toContain('"statics"');
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
		expect(resumeModule?.source).toContain('marklessSsrLoadSymbolRoute'); // composed pages are excluded from specialization (T015g PM); the routed loader wires the full path
		expect(result.code).not.toContain('function marklessResumeLoadSymbol');
		expect(result.code).toContain('import("./Child.tsrx?markless-symbols")');
		expect(result.code).toContain('import("virtual:markless:symbol:');
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
		expect(resumeModule?.source).toContain('marklessSsrLoadSymbolRoute'); // composed pages are excluded from specialization (T015g PM); the routed loader wires the full path
		expect(result.code).toContain('const marklessLoadLocalSymbol = loadSymbol;');
		expect(result.code).toContain('function marklessSsrLoadSymbolRoute(symbolId)');
		expect(result.code).toContain('import("./Child.tsrx?markless-symbols")');
		expect(result.code).toContain('return marklessLoadLocalSymbol(symbolId);');
		expect(result.code).toContain('renderCsr: marklessRenderCsr');
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

		expect(result.code).toContain('renderSsr(props, marklessRenderContext) {');
		expect(renderDataModuleSource(result)).toContain('"source":"active ? \'on\' : \'off\'"');
		expect(result.code).not.toContain('renderCsr: App');
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
		expect(result.code).toContain('renderCsr: App');
		expect(result.code).toContain('export default marklessCompiledApp;');
		expect(renderDataModuleSource(result)).toContain('<main><section><!--markless-slot:0-->');
		expect(result.code).toContain('const marklessDirectChunkData');
		expect(result.code).toContain('createMarklessDirectChunkRenderer(marklessDirectChunkData)');
		expect(result.code).toContain('const graph = createMarklessPublicGraph()');
		expect(result.code).toContain('runtime: { async dispatch() {} }');
		expect(result.code).not.toContain('function createMarklessPublicRuntime');
		expect(result.code).toContain('const marklessSsrState = marklessSsrComposeState'); // SSR-side alias (compose-state import dedup)
		expect(result.code).toContain(
			'state: marklessSsrAttachSnapshots(marklessSsrState, marklessSsrAsyncSnapshots)',
		);
		expect(result.code).toContain(
			'branches: marklessSsrMergeBranches(marklessSsrComposition.view.branches, marklessSsrBranches)',
		);
		expect(result.code).not.toContain('view: marklessPublicView');
		expect(result.code).not.toContain('payloadView.locators.filter');
		expect(result.code).not.toContain('marklessPublicHostNodeIndexes');
		expect(result.code).toContain('"eventControls"');
		expect(result.code).toContain('"itemName": "entry"');
		expect(result.code).toContain('"eventName": "click"');
		expect(result.code).toContain('"symbolId": "symbol:0"');
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
			'const marklessSymbolResolverModule = () => import("virtual:markless:resolver:',
		);
		expect(result.code).toContain('function loadSymbol(symbolId)');
		expect(result.code).toContain('if (symbolId === "symbol:0")');
		expect(result.code).toContain('if (symbolId === "symbol:7")');
		expect(result.code).toContain('import("virtual:markless:symbol:');
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
			'const marklessSymbolResolverModule = () => import("virtual:markless:resolver:',
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
		expect(resumeSource).toContain('marklessResumeSpecializedScalarEvent');
		expect(resumeSource).not.toContain('resumeScalarCoreEventFromPayloadDocument');
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

	test('base plugin resolves generated inline helper imports from the web package source', async () => {
		const plugin = marklessClient();
		const result = await callResolveId(plugin, '@markless/web/inline/sync-policy-core');

		expect(result).toEqual(
			expect.objectContaining({
				id: expect.stringMatching(/packages\/web\/src\/inline\/sync-policy-core\.ts$/),
			}),
		);
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
		const result = await callResolveId(plugin, symbolRouteSpecifiers[0]!, `\0${resumeId}`, {
			resolve,
		});

		expect(resolve).toHaveBeenCalledWith(
			'./progressive-child-panel.tsrx?markless-symbols',
			filename,
			{ skipSelf: true },
		);
		expect(result).toEqual({
			id: '/workspace/app/src/progressive-child-panel.tsrx?markless-symbols',
		});
	});

	test('client resume source requests serve the generated resume module only', async () => {
		const plugin = marklessClient();
		const filename = '/workspace/app/pages/index.tsrx';

		callBuildStart(plugin, { cwd: '/workspace/app' });
		const result = (await callTransform(plugin, source, `${filename}?markless-resume`)) as {
			code: string;
		};

		expect(resumeVirtualModuleId(filename)).toBe(
			`virtual:markless:resume:${encodeURIComponent(filename)}`,
		);
		expect(result.code).toContain('export async function resumeContainerEvent');
		expect(result.code).toContain('marklessResumeSpecializedScalarEvent');
		expect(result.code).not.toContain('resumeScalarCoreEventFromPayloadDocument');
		expect(result.code).not.toContain('const marklessCompiledApp = {');
		expect(result.code).not.toContain('renderCsr:');
	});

	test('production client execution logging does not alter hash-bearing modules', async () => {
		const plugin = marklessClient({ executionLog: 'auto' });
		const filename = '/workspace/app/src/App.tsrx';

		callBuildStart(plugin, { cwd: '/workspace/app' });

		expect(
			await callTransform(
				plugin,
				'export const runtime = true;',
				'/workspace/app/packages/web/src/event-only-resume.ts',
			),
		).toBeNull();

		await callTransform(plugin, source, filename);
		const symbolId = `virtual:markless:symbol:${encodeURIComponent(filename)}:${encodeURIComponent('symbol:0')}`;
		const symbolSource = (await callLoad(plugin, `\0${symbolId}`)) as string;

		expect(symbolSource).not.toContain('__mxLog?.add');
		expect(symbolSource).toContain('export function symbol_0_');
	});

	test('dev client symbol modules log and size the same qualified execution id', async () => {
		const plugin = marklessClient({ dev: true, executionLog: 'auto' });
		const filename = '/workspace/app/src/App.tsrx';

		callBuildStart(plugin, { cwd: '/workspace/app' });
		await callTransform(plugin, source, filename);
		const symbolId = `virtual:markless:symbol:${encodeURIComponent(filename)}:${encodeURIComponent('symbol:0')}`;
		const symbolSource = (await callLoad(plugin, `\0${symbolId}`)) as string;
		const logSource = (await callLoad(plugin, '\0virtual:markless:dev-log')) as string;

		// The executed id the hook adds must be the size-map key: qualified by
		// the source module so symbol:0 from two files cannot collide.
		expect(symbolSource).toContain(`globalThis.__mxLog?.add(${JSON.stringify(symbolId)});`);
		expect(symbolSource).not.toContain('__mxLog?.add("symbol:');
		expect(logSource).toContain(JSON.stringify(symbolId));
		expect(logSource).not.toContain('"symbol:symbol:0"');
	});

	test('dev logger embeds manifest-derived nested attribution and refreshes after invalidation', async () => {
		const rootDir = '/workspace/studio';
		const routeFile = `${rootDir}/routes/dashboard.tsrx`;
		const panelFile = `${rootDir}/components/MetricPanel.tsrx`;
		const gaugeFile = `${rootDir}/components/GaugeButton.tsrx`;
		const replacementFile = `${rootDir}/components/TrendCard.tsrx`;
		const plugin = marklessClient({ dev: true, executionLog: 'always', rootDir });
		const component = (name: string, child?: string) =>
			`${
				child ? `import Child from ${JSON.stringify(child)};` : ''
			}\nexport default function ${name}() @{ <article>${
				child ? '<Child />' : '<button onClick={() => console.log(1)}>Run</button>'
			}</article> }`;
		const embeddedAttribution = async () => {
			const loggerSource = (await callLoad(
				plugin,
				`\0${MARKLESS_EXECUTION_LOG_MODULE_ID}`,
			)) as string;
			const match = /const marklessDefaultAttribution = (.*);/.exec(loggerSource);
			if (!match?.[1]) throw new Error('expected embedded execution attribution');
			return JSON.parse(match[1]) as Record<string, Record<string, string>>;
		};

		callBuildStart(plugin, { cwd: rootDir });
		await callTransform(plugin, component('GaugeButton'), gaugeFile);
		const panel = (await callTransform(
			plugin,
			component('MetricPanel', './GaugeButton.tsrx'),
			panelFile,
		)) as Awaited<ReturnType<typeof transformTsrxModule>>;
		const route = (await callTransform(
			plugin,
			component('Dashboard', '../components/MetricPanel.tsrx'),
			routeFile,
		)) as Awaited<ReturnType<typeof transformTsrxModule>>;

		const routePrefix = route.manifest.symbolRoutes![0]!.prefix;
		const panelPrefix = panel.manifest.symbolRoutes![0]!.prefix;
		expect(await embeddedAttribution()).toEqual({
			'routes/dashboard.tsrx': {
				'': encodeURIComponent(routeFile),
				[routePrefix]: encodeURIComponent(panelFile),
				[routePrefix + panelPrefix]: encodeURIComponent(gaugeFile),
			},
		});

		const resolvedLogger = await callResolveId(plugin, MARKLESS_EXECUTION_LOG_MODULE_ID);
		const invalidated = plugin.api.invalidateGeneratedModules(routeFile, 'client');
		expect(invalidated).toContain((resolvedLogger as { id: string }).id);
		await callTransform(plugin, component('TrendCard'), replacementFile);
		await callTransform(
			plugin,
			component('Dashboard', '../components/TrendCard.tsrx'),
			routeFile,
		);

		const refreshed = await embeddedAttribution();
		expect(refreshed['routes/dashboard.tsrx']).toEqual({
			'': encodeURIComponent(routeFile),
			[routePrefix]: encodeURIComponent(replacementFile),
		});
		expect(JSON.stringify(refreshed['routes/dashboard.tsrx'])).not.toContain(
			encodeURIComponent(panelFile),
		);
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
		await callGenerateBundle(
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

	test('attribution tables render from the complete multi-route nested manifest graph', async () => {
		const plugin = marklessClient({ executionLog: 'always', rootDir: '/workspace/app' });
		const emitFile = vi.fn();
		callBuildStart(plugin, { cwd: '/workspace/app' });
		const component = (name: string, child?: string) =>
			`${
				child ? `import Child from ${JSON.stringify(child)};` : ''
			}\nexport default function ${name}() @{ <section>${child ? '<Child />' : name}</section> }`;
		await callTransform(
			plugin,
			component('RouteA', '../components/Branch.tsrx'),
			'/workspace/app/pages/a.tsrx',
		);
		await callTransform(
			plugin,
			component('RouteB', '../components/Other.tsrx'),
			'/workspace/app/pages/b.tsrx',
		);
		await callTransform(
			plugin,
			component('Branch', './Leaf.tsrx'),
			'/workspace/app/components/Branch.tsrx',
		);
		await callTransform(plugin, component('Leaf'), '/workspace/app/components/Leaf.tsrx');
		await callTransform(plugin, component('Other'), '/workspace/app/components/Other.tsrx');
		await callGenerateBundle(plugin, {}, emitFile);
		const sizes = emittedAsset(emitFile, 'build/execution-sizes.json');
		const payload = JSON.parse(String(sizes?.source)) as {
			attribution: Record<string, Record<string, string>>;
		};
		expect(Object.keys(payload.attribution)).toEqual(['pages/a.tsrx', 'pages/b.tsrx']);
		expect(payload.attribution['pages/a.tsrx']).toHaveProperty('c0:c0:');
		expect(JSON.stringify(payload.attribution)).not.toContain('virtual:markless:');
	});

	test('attribution follows resolved package module ids', async () => {
		const plugin = marklessClient({ executionLog: 'always', rootDir: '/workspace/app' });
		const emitFile = vi.fn();
		const routeFilename = '/workspace/app/pages/a.tsrx';
		const branchFilename = '/workspace/packages/branch/index.tsrx';
		const leafFilename = '/workspace/packages/branch/Leaf.tsrx';
		const resolvePackage = vi.fn(async (specifier: string) =>
			specifier === '@fixtures/branch' ? { id: branchFilename } : null,
		);
		callBuildStart(plugin, { cwd: '/workspace/app' });
		await callTransform(
			plugin,
			`import Branch from '@fixtures/branch';
export default function Route() @{ <Branch /> }`,
			routeFilename,
			{ resolve: resolvePackage },
		);
		await callTransform(
			plugin,
			`import Leaf from './Leaf.tsrx';
export default function Branch() @{ <Leaf /> }`,
			branchFilename,
		);
		await callTransform(
			plugin,
			'export default function Leaf() @{ <span>Leaf</span> }',
			leafFilename,
		);
		await callGenerateBundle(plugin, {}, emitFile);

		const sizes = emittedAsset(emitFile, 'build/execution-sizes.json');
		const payload = JSON.parse(String(sizes?.source)) as {
			attribution: Record<string, Record<string, string>>;
		};
		expect(Object.keys(payload.attribution)).toEqual(['pages/a.tsrx']);
		expect(payload.attribution['pages/a.tsrx']).toMatchObject({
			'c0:': encodeURIComponent(branchFilename),
			'c0:c0:': encodeURIComponent(leafFilename),
		});
	});

	test('production builds require capture metadata from imported compiled children', async () => {
		const childFilename = '/workspace/app/components/Child.tsrx';
		const parentFilename = '/workspace/app/pages/App.tsrx';
		const childSource = 'export default function Child() @{ <button>Child</button> }';
		const parentSource = `import Child from '../components/Child.tsrx';
export default function App() @{ <main><Child /></main> }`;
		const validPlugin = marklessClient();

		callBuildStart(validPlugin, { cwd: '/workspace/app' });
		await callTransform(validPlugin, childSource, childFilename);
		await callTransform(validPlugin, parentSource, parentFilename);
		await expect(callGenerateBundle(validPlugin, {}, vi.fn())).resolves.toBeUndefined();
		const sameModulePlugin = marklessClient();
		callBuildStart(sameModulePlugin, { cwd: '/workspace/app' });
		await callTransform(
			sameModulePlugin,
			`function Child() @{ <button>Child</button> }
export default function App() @{ <main><Child /></main> }`,
			parentFilename,
		);
		await expect(callGenerateBundle(sameModulePlugin, {}, vi.fn())).resolves.toBeUndefined();

		const stalePlugin = marklessClient();
		callBuildStart(stalePlugin, { cwd: '/workspace/app' });
		const staleChild = (await callTransform(stalePlugin, childSource, childFilename)) as {
			manifest: { captureMetadata?: unknown };
		};
		delete staleChild.manifest.captureMetadata;
		await callTransform(stalePlugin, parentSource, parentFilename);

		await expect(callGenerateBundle(stalePlugin, {}, vi.fn())).rejects.toThrow(
			'MARKLESS_CAPTURE_METADATA_MISSING: Parent module "/workspace/app/pages/App.tsrx" composes imported child "../components/Child.tsrx", but its compiled artifact has no current capture metadata. Rebuild the child with the current Markless compiler and clear any stale build cache.',
		);
	});

	test('production metadata validation uses resolved package module ids', async () => {
		const childFilename = '/workspace/packages/source-child/index.tsrx';
		const parentFilename = '/workspace/app/pages/App.tsrx';
		const childSource = 'export default function Child() @{ <button>Child</button> }';
		const parentSource = `import Child from '@fixtures/source-child';
export default function App() @{ <main><Child /></main> }`;
		const plugin = marklessClient();
		const resolvePackage = vi.fn(async (specifier: string) =>
			specifier === '@fixtures/source-child' ? { id: childFilename } : null,
		);

		callBuildStart(plugin, { cwd: '/workspace/app' });
		await callTransform(plugin, childSource, childFilename, { resolve: resolvePackage });
		await callTransform(plugin, parentSource, parentFilename, { resolve: resolvePackage });

		await expect(callGenerateBundle(plugin, {}, vi.fn())).resolves.toBeUndefined();
		expect(resolvePackage).toHaveBeenCalledWith('@fixtures/source-child', parentFilename, {
			skipSelf: true,
		});
	});

	test('source TypeScript package components are not stale compiled TSRX artifacts', async () => {
		const childFilename = '/workspace/packages/router/src/index.ts';
		const parentFilename = '/workspace/app/document.tsrx';
		const plugin = marklessServer();
		const resolvePackage = vi.fn(async (specifier: string) =>
			specifier === '@markless/router' ? { id: childFilename } : null,
		);

		callBuildStart(plugin, { cwd: '/workspace/app' });
		await callTransform(
			plugin,
			`import { Html } from '@markless/router';
export default function Document() @{ <Html><body>Ready</body></Html> }`,
			parentFilename,
			{ resolve: resolvePackage },
		);

		await expect(callGenerateBundle(plugin, {}, vi.fn())).resolves.toBeUndefined();
	});

	test('prebuilt package components without current metadata still fail closed', async () => {
		const childFilename = '/workspace/node_modules/stale-child/dist/index.js';
		const parentFilename = '/workspace/app/pages/App.tsrx';
		const plugin = marklessClient();
		const resolvePackage = vi.fn(async (specifier: string) =>
			specifier === 'stale-child' ? { id: childFilename } : null,
		);

		callBuildStart(plugin, { cwd: '/workspace/app' });
		await callTransform(
			plugin,
			`import Child from 'stale-child';
export default function App() @{ <main><Child /></main> }`,
			parentFilename,
			{ resolve: resolvePackage },
		);

		await expect(callGenerateBundle(plugin, {}, vi.fn())).rejects.toThrow(
			'MARKLESS_CAPTURE_METADATA_MISSING: Parent module "/workspace/app/pages/App.tsrx" composes imported child "stale-child", but its compiled artifact has no current capture metadata.',
		);
	});

	test('imported sibling instances receive distinct parent-bound symbol rows', async () => {
		const childFilename = '/workspace/app/components/Child.tsrx';
		const parentFilename = '/workspace/app/pages/App.tsrx';
		const childSource = `export function Child({ label, onTrace }) @{
	<button onClick={() => { onTrace(label); }}>{label}</button>
}`;
		const parentSource = `import { state } from '@markless/core';
import { Child } from '../components/Child.tsrx';
export function App() @{
	let first = state('Server spruce');
	let result = state('none');
	<main>
		<Child label={first} onTrace={(value) => result = value} />
		<Child label="Literal sibling" onTrace={(value) => result = value} />
		<output>{result}</output>
	</main>
}`;
		const plugin = marklessClient();
		callBuildStart(plugin, { cwd: '/workspace/app' });
		const child = (await callTransform(plugin, childSource, childFilename)) as {
			manifest: {
				captureMetadata: { extractedSymbols: Array<{ symbolId: string; kind: string }> };
				symbols: Array<{ symbolId: string; virtualModuleId: string }>;
			};
			virtualModules: Array<{ id: string; type: string; source: string }>;
		};
		const parent = (await callTransform(plugin, parentSource, parentFilename)) as {
			code: string;
			manifest: {
				csrNativeMarkup?: unknown;
				captureMetadata: {
					boundResolverRows: Array<{
						id: string;
						baseSymbolId: string;
						loaderSymbolId?: string;
						componentEdgePath: string[];
					}>;
				};
			};
			virtualModules: Array<{ type: string; source: string }>;
		};
		const childHandler = child.manifest.captureMetadata.extractedSymbols.find(
			(symbol) => symbol.kind === 'event-handler',
		)!;
		const loaderSymbolId = `imported:${encodeURIComponent(childFilename)}:${childHandler.symbolId}`;
		const rows = parent.manifest.captureMetadata.boundResolverRows.filter(
			(row) => row.baseSymbolId === loaderSymbolId,
		);

		expect(rows).toHaveLength(2);
		expect(rows.map((row) => row.id)).toEqual([
			`bound:${encodeURIComponent(childHandler.symbolId)}:${encodeURIComponent('component-edge:0')}`,
			`bound:${encodeURIComponent(childHandler.symbolId)}:${encodeURIComponent('component-edge:1')}`,
		]);
		expect(new Set(rows.map((row) => row.id)).size).toBe(2);
		expect(new Set(rows.map((row) => row.loaderSymbolId))).toEqual(new Set([loaderSymbolId]));
		expect(rows.map((row) => row.componentEdgePath)).toEqual([
			['component-edge:0'],
			['component-edge:1'],
		]);
		const parentStartupTransport =
			parent.code + JSON.stringify(parent.manifest.csrNativeMarkup);
		for (const row of rows) expect(parentStartupTransport).toContain(row.id);
		const resolver = parent.virtualModules.find((module) => module.type === 'resolver')!;
		expect(resolver.source).toContain(rows[0]!.loaderSymbolId);
		const childHandlerManifest = child.manifest.symbols.find(
			(symbol) => symbol.symbolId === childHandler.symbolId,
		)!;
		const childHandlerModule = child.virtualModules.find(
			(module) => module.id === childHandlerManifest.virtualModuleId,
		)!;
		const childHandlerUrl = `data:text/javascript,${encodeURIComponent(childHandlerModule.source)}`;
		const resolverUrl = `data:text/javascript,${encodeURIComponent(
			resolver.source.split(childHandlerModule.id).join(childHandlerUrl),
		)}`;
		const loadedResolver = (await import(resolverUrl)) as {
			loadSymbol(id: string): Promise<(context: unknown) => unknown>;
		};
		const siblingHandler = await loadedResolver.loadSymbol(rows[1]!.id);
		const invoked: unknown[] = [];
		const order: string[] = [];
		let flushes = 0;
		let delivered: unknown;
		try {
			delivered = await siblingHandler({
				event: { type: 'click' },
				graph: {
					read() {
						throw new Error('shared prop fallback must not run');
					},
				},
				async invokeSymbol(symbolId: string, context: { args: unknown[] }) {
					order.push('parent:start');
					invoked.push(symbolId, ...context.args);
					await Promise.resolve();
					order.push('parent:end');
					return context.args[0];
				},
			});
			order.push('following:complete');
		} finally {
			flushes++;
			order.push('flush');
		}

		expect(delivered).toBeUndefined();
		expect(invoked).toEqual(['symbol:1', 'Literal sibling']);
		expect(order).toEqual(['parent:start', 'parent:end', 'following:complete', 'flush']);
		expect(flushes).toBe(1);
		expect(plugin.api.invalidateGeneratedModules(childFilename, 'client')).toContain(
			`\0virtual:markless:resolver:${encodeURIComponent(parentFilename)}`,
		);

		const ssrOutputDirectory = await mkdtemp(
			resolve(import.meta.dirname, '.imported-sibling-ssr-'),
		);
		try {
			const ssrChildSource = `export function CaptureButton({ label, marker, count, onTrace }) @{
	<button data-capture-graph={marker === 'graph'} data-capture-literal={marker === 'literal'}>{label}</button>
}`;
			const ssrParentSource = `import { state } from '@markless/core';
import { CaptureButton } from '../components/Child.tsrx';
export function App() @{
	let graphLabel = state('Server spruce');
	let count = state(0);
	let trace = state('none');
	<main>
		<CaptureButton marker="graph" label={graphLabel} count={count} onTrace={(value) => trace = value} />
		<CaptureButton marker="literal" label="Server copper" count={count} onTrace={(value) => trace = value} />
	</main>
}`;
			const fixturePlugin: Plugin = {
				name: 'imported-sibling-ssr-fixture',
				resolveId(id, importer) {
					if (id === parentFilename || id === childFilename) return id;
					if (id === '../components/Child.tsrx' && importer === parentFilename) {
						return childFilename;
					}
					return null;
				},
				load(id) {
					if (id === parentFilename) return ssrParentSource;
					if (id === childFilename) return ssrChildSource;
					return null;
				},
			};
			const ssrBuild = await viteBuild({
				configFile: false,
				root: resolve(import.meta.dirname, '..'),
				logLevel: 'silent',
				plugins: [fixturePlugin, marklessServer({ executionLog: 'never' })],
				build: {
					ssr: parentFilename,
					outDir: ssrOutputDirectory,
					emptyOutDir: false,
					minify: false,
					target: 'es2022',
				},
			});
			const ssrChunks = Array.isArray(ssrBuild)
				? ssrBuild.flatMap((item) => item.output)
				: ssrBuild.output;
			const ssrEntry = ssrChunks.find((item) => item.type === 'chunk' && item.isEntry);
			expect(ssrEntry?.type).toBe('chunk');
			const renderedModule = (await import(
				`${pathToFileURL(resolve(ssrOutputDirectory, ssrEntry!.fileName)).href}?t=${Date.now()}`
			)) as {
				default: {
					renderSsr(): Promise<{
						readonly html: string;
						readonly view: {
							readonly domUpdates: ReadonlyArray<{
								readonly hostNodeId: string;
								readonly graphNodeId: string;
							}>;
						};
					}>;
				};
			};
			const rendered = await renderedModule.default.renderSsr();
			expect(rendered.html).toContain('data-capture-graph="true"');
			expect(rendered.html).toContain('data-capture-literal="true"');
			expect(rendered.html).toContain('>Server spruce</button>');
			expect(rendered.html).toContain('>Server copper</button>');
			expect(rendered.view.domUpdates).toEqual([
				expect.objectContaining({
					hostNodeId: 'c0:h0',
					graphNodeId: 'state:graphLabel',
				}),
			]);
		} finally {
			await rm(ssrOutputDirectory, { recursive: true, force: true });
		}
	});

	test('production build emits resolver routes for an imported composed child', async () => {
		const parentFilename = resolve(
			import.meta.dirname,
			'fixtures/imported-resolver/Parent.tsrx',
		);
		const childFilename = resolve(
			import.meta.dirname,
			'fixtures/imported-resolver/CaptureButton.tsrx',
		);
		const fixturePlugin: Plugin = {
			name: 'imported-resolver-fixture',
			resolveId(id, importer) {
				if (id === parentFilename) return parentFilename;
				if (
					id.split('?')[0] === './CaptureButton.tsrx' &&
					importer?.split('?')[0] === parentFilename
				) {
					const query = id.includes('?') ? `?${id.split('?').slice(1).join('?')}` : '';
					return `${childFilename}${query}`;
				}
				return null;
			},
			load(id) {
				if (id.split('?')[0] === parentFilename) {
					return `import { state } from '@markless/core';
import { CaptureButton } from './CaptureButton.tsrx';
export function App() @{
	let first = state('Server spruce');
	let second = state('Server copper');
	let result = state('none');
	<main>
		<CaptureButton label={first} onTrace={(value) => result = value} />
		<CaptureButton label={second} onTrace={(value) => result = value} />
		<output>{result}</output>
	</main>
}`;
				}
				if (id.split('?')[0] === childFilename) {
					return `export function CaptureButton({ label, onTrace }) @{
	<button type="button" onClick={() => onTrace(label)}>{label}</button>
}`;
				}
				return null;
			},
		};

		const output = await viteBuild({
			configFile: false,
			root: resolve(import.meta.dirname, '..'),
			logLevel: 'silent',
			plugins: [fixturePlugin, marklessClient({ executionLog: 'never' })],
			build: {
				write: false,
				minify: false,
				target: 'es2022',
				rolldownOptions: { input: { symbols: parentFilename } },
			},
		});
		const chunks = (
			Array.isArray(output) ? output.flatMap((item) => item.output) : output.output
		).filter((item) => item.type === 'chunk');
		const childResolverId = `virtual:markless:resolver:${encodeURIComponent(childFilename)}`;
		const normalizeModuleId = (id: string) => (id.startsWith('\0') ? id.slice(1) : id);

		expect(
			chunks.some((chunk) =>
				chunk.moduleIds.some((id) => normalizeModuleId(id) === childResolverId),
			),
		).toBe(true);
		expect(
			chunks.some((chunk) =>
				chunk.moduleIds.some((id) =>
					normalizeModuleId(id).startsWith(
						`virtual:markless:symbol:${encodeURIComponent(childFilename)}:`,
					),
				),
			),
		).toBe(true);
		const emittedCode = chunks.map((chunk) => chunk.code).join('\n');
		expect(emittedCode).toMatch(/bound:[^"']+:component-edge%3A0/);
		expect(emittedCode).toMatch(/bound:[^"']+:component-edge%3A1/);
	});

	test('execution-log never mode emits no attribution section or size entries', async () => {
		const plugin = marklessClient({ executionLog: 'never', rootDir: '/workspace/app' });
		const emitFile = vi.fn();
		callBuildStart(plugin, { cwd: '/workspace/app' });
		await callTransform(
			plugin,
			'export default function App() @{ <button>Play</button> }',
			'/workspace/app/pages/app.tsrx',
		);
		await callGenerateBundle(plugin, {}, emitFile);
		const sizes = emittedAsset(emitFile, 'build/execution-sizes.json');
		expect(JSON.parse(String(sizes?.source))).toEqual({});
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
		const transformed = await transformTsrxModule({
			filename: '/workspace/app/src/App.tsrx',
			source,
			environment: 'client',
		});
		const symbolVirtualIds = transformed.manifest.symbols.map(
			(symbol) => symbol.virtualModuleId,
		);
		const virtualIds = [...entryVirtualIds, ...symbolVirtualIds].map((id) => `\0${id}`);
		const bundle = Object.fromEntries(
			virtualIds.map((id, index) => {
				const symbol = transformed.manifest.symbols.find(
					(entry) => `\0${entry.virtualModuleId}` === id,
				);
				return [
					`build/chunk-${index}.js`,
					{
						type: 'chunk',
						fileName: `build/chunk-${index}.js`,
						name: `chunk-${index}`,
						code:
							id === `\0${resolverId}`
								? resolverSource
								: symbol
									? `export function ${symbol.exportName}() {}`
									: 'export default {};',
						exports:
							id === `\0${resolverId}`
								? ['loadSymbol']
								: symbol
									? [symbol.exportName]
									: ['default'],
						imports: [],
						dynamicImports:
							id === `\0${resolverId}`
								? symbolVirtualIds.map(
										(_, symbolIndex) =>
											`build/chunk-${entryVirtualIds.length + symbolIndex}.js`,
									)
								: [],
						moduleIds: [id],
						facadeModuleId: id,
					},
				] as const;
			}),
		);

		await callGenerateBundle(plugin, bundle, emitFile);

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

	test('generateBundle hard-errors when a compiler symbol chunk is genuinely missing', async () => {
		const plugin = marklessClient();
		const filename = '/workspace/app/src/App.tsrx';
		const encoded = encodeURIComponent(filename);
		const resolverId = `virtual:markless:resolver:${encoded}`;

		callBuildStart(plugin, { cwd: '/workspace/app' });
		await callTransform(plugin, source, filename);
		const resolverSource = (await callLoad(plugin, `\0${resolverId}`)) as string;

		await expect(
			callGenerateBundle(plugin, {
				'build/resolver.js': {
					type: 'chunk',
					fileName: 'build/resolver.js',
					name: 'resolver',
					code: resolverSource,
					exports: ['loadSymbol', 'symbolManifest'],
					imports: [],
					dynamicImports: [],
					moduleIds: [`\0${resolverId}`],
					facadeModuleId: `\0${resolverId}`,
				},
			}),
		).rejects.toThrow(
			/Markless symbol resolver table contains unresolved generated symbol chunks:.*markless debugging playbook: run pnpm doctor, or read agent\/markless\.md in the installed @markless\/core package/,
		);
	});

	test('generateBundle hard-errors when a symbol row claims another emitted chunk', async () => {
		const plugin = marklessClient();
		const filename = '/workspace/app/src/App.tsrx';
		const encoded = encodeURIComponent(filename);
		const resolverId = `virtual:markless:resolver:${encoded}`;
		const largeSource = manyButtonSource(9);
		const transformed = await transformTsrxModule({
			filename,
			source: largeSource,
			environment: 'client',
		});

		callBuildStart(plugin, { cwd: '/workspace/app' });
		await callTransform(plugin, largeSource, filename);
		const resolverSource = (await callLoad(plugin, `\0${resolverId}`)) as string;
		const [first, second] = transformed.manifest.symbols;
		if (!first || !second) throw new Error('test source requires two compiler symbols');
		const misroutedResolverSource = resolverSource.replace(
			first.virtualModuleId,
			second.virtualModuleId,
		);
		const symbolChunks = transformed.manifest.symbols.map((symbol, index) => {
			const virtualId = `\0${symbol.virtualModuleId}`;
			return [
				`build/symbol-${index}.js`,
				{
					type: 'chunk',
					fileName: `build/symbol-${index}.js`,
					name: `symbol-${index}`,
					code: `export function ${symbol.exportName}() {}`,
					exports: [symbol.exportName],
					imports: [],
					dynamicImports: [],
					moduleIds: [virtualId],
					facadeModuleId: virtualId,
				},
			] as const;
		});

		await expect(
			callGenerateBundle(plugin, {
				'build/resolver.js': {
					type: 'chunk',
					fileName: 'build/resolver.js',
					name: 'resolver',
					code: misroutedResolverSource,
					exports: ['loadSymbol', 'symbolManifest'],
					imports: [],
					dynamicImports: symbolChunks.map(([fileName]) => fileName),
					moduleIds: [`\0${resolverId}`],
					facadeModuleId: `\0${resolverId}`,
				},
				...Object.fromEntries(symbolChunks),
			}),
		).rejects.toThrow(
			new RegExp(
				`Markless symbol resolver table integrity check failed:[\\s\\S]*${first.symbolId} -> build/symbol-1\\.js: claimed chunk does not contain its generated symbol module[\\s\\S]*markless debugging playbook: run pnpm doctor, or read agent/markless\\.md in the installed @markless/core package`,
			),
		);
	});

	test('generateBundle injects every compact graph symbol preload into HTML', async () => {
		const plugin = marklessClient();
		const emitFile = vi.fn();
		const html = { type: 'asset', fileName: 'index.html', source: '<head></head>' };
		const filename = '/workspace/app/src/App.tsrx';
		const encoded = encodeURIComponent(filename);

		callBuildStart(plugin, { cwd: '/workspace/app' });
		await callTransform(plugin, source, filename);
		const transformed = await transformTsrxModule({ filename, source, environment: 'client' });
		const resolverId = `virtual:markless:resolver:${encoded}`;
		const resolverSource = (await callLoad(plugin, `\0${resolverId}`)) as string;
		const symbolChunks = transformed.manifest.symbols.map((symbol, index) => {
			const virtualId = `\0${symbol.virtualModuleId}`;
			return [
				`build/chunk-symbol-${index}.js`,
				{
					type: 'chunk',
					fileName: `build/chunk-symbol-${index}.js`,
					name: `chunk-symbol-${index}`,
					code: `export function ${symbol.exportName}() {}`,
					exports: [symbol.exportName],
					imports: [],
					dynamicImports: [],
					moduleIds: [virtualId],
					facadeModuleId: virtualId,
				},
			] as const;
		});

		await callGenerateBundle(
			plugin,
			{
				'index.html': html,
				'build/resolver.js': {
					type: 'chunk',
					fileName: 'build/resolver.js',
					name: 'resolver',
					code: resolverSource,
					exports: ['loadSymbol'],
					imports: [],
					dynamicImports: symbolChunks.map(([fileName]) => fileName),
					moduleIds: [`\0${resolverId}`],
					facadeModuleId: `\0${resolverId}`,
				},
				...Object.fromEntries(symbolChunks),
			},
			emitFile,
		);

		const htmlHrefs = [
			...html.source.matchAll(
				/<link\b[^>]*\brel=(?:["']modulepreload["']|modulepreload)[^>]*\bhref=(?:["']([^"']+)["']|([^\s>]+))/g,
			),
		]
			.map((match) => (match[1] ?? match[2])!)
			.sort();

		expect(htmlHrefs).toEqual([
			'/build/chunk-symbol-0.js',
			'/build/chunk-symbol-1.js',
			'/build/resolver.js',
		]);
	});
});

function renderDataModuleSource(result: Awaited<ReturnType<typeof transformTsrxModule>>): string {
	const module = result.virtualModules.find((candidate) => candidate.type === 'render-data');
	if (!module) throw new Error('Expected a canonical render-data module.');
	return module.source;
}

test('prerender client chunks carry linked render data without a component body', async () => {
	const result = await transformTsrxModule({
		filename: '/workspace/app/src/App.tsrx',
		source: `
import { state, storage } from '@markless/core';
export const theme = storage('theme-mode', 'light');
export function App() @{
	let count = state(0);
	<button data-theme={theme} onClick={() => count++}>{count}</button>
}
`,
		environment: 'client',
		prerenderRecords: true,
	});
	const resume = result.virtualModules.find((module) => module.type === 'resume');
	const renderData = result.virtualModules.find((module) => module.type === 'render-data');

	expect(result.code).toContain('marklessRenderData');
	expect(result.code).toContain('renderSsr(props, marklessRenderContext)');
	expect(result.code).not.toContain('renderCsr:');
	expect(renderData?.source).toContain('export const marklessPrerenderData');
	expect(resume?.source).toContain(
		`from 'virtual:markless:render-data:${encodeURIComponent('/workspace/app/src/App.tsrx')}'`,
	);
	expect(resume?.source).toContain('derivePrerenderResumeRecords');
	expect(resume?.source).not.toContain('/workspace/app/src/App.tsrx');
	expect(resume?.source).not.toContain('marklessPrerenderPage');
});

test('capability-free prerender pages emit no full-resume wake import', async () => {
	const result = await transformTsrxModule({
		filename: '/workspace/app/src/Static.tsrx',
		source: capabilityFreeSource,
		environment: 'client',
		prerenderRecords: true,
	});
	const resume = result.virtualModules.find((module) => module.type === 'resume');

	expect(resume?.source).not.toContain('marklessPrerenderData');
	expect(resume?.source).not.toContain("import('@markless/web/fns/prerender-resume')");
	expect(resume?.source).not.toContain('resumeFromPrerenderRecords');
});

test('browser-trigger prerender pages keep their resume emission byte-identical', async () => {
	const result = await transformTsrxModule({
		filename: '/workspace/app/src/App.tsrx',
		source: fullResumeSource,
		environment: 'client',
		prerenderRecords: true,
	});
	const resume = result.virtualModules.find((module) => module.type === 'resume');

	expect(resume?.source).toMatchSnapshot('browser-trigger prerender resume module');
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

test('transformTsrxModule escalates full-only records but keeps qualifying rows lean', async () => {
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
	expect(plainResume?.source).toContain('marklessResumeSpecializedScalarEvent');
	expect(plainResume?.source).not.toContain('resumeScalarCoreEventFromPayloadDocument');
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
	expect(keyedResume?.source).toContain("import('@markless/core/web/resume-storage-free')");
	expect(keyed.code).not.toContain(
		"import { resumeFromPayloadDocument } from '@markless/core/web/resume';",
	);

	const qualifyingKeyed = await transformTsrxModule({
		filename: '/workspace/app/src/QualifyingRows.tsrx',
		source: `
import { state } from '@markless/core';
export function App() @{
	let entries = state([{ code: 'a' }]);
	let chosen = state('');
	<main>
		<section>@for (const entry of entries; key entry.code) {<article><button onClick={() => chosen = entry.code}>Choose</button></article>}</section>
		<output>{chosen}</output>
	</main>
}
`,
		environment: 'client',
	});
	const qualifyingKeyedResume = qualifyingKeyed.virtualModules.find(
		(module) => module.type === 'resume',
	);
	expect(qualifyingKeyedResume?.source).toContain('resumeScalarRowEventFromPayloadDocument');
	expect(qualifyingKeyedResume?.source).not.toContain("import('@markless/core/web/resume')");

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
	expect(handlesResume?.source).toContain("import('@markless/core/web/resume-storage-free')");
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
	expect(boundariesResume?.source).toContain("import('@markless/core/web/resume-storage-free')");
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
	// inventory decides whether the lean tier can handle the page.
	const withChildResume = withChild.virtualModules.find((module) => module.type === 'resume');
	expect(withChild.code).not.toContain('resumeEventOnlyFromPayloadDocument');
	expect(withChildResume?.source).not.toContain('resumeEventOnlyFromPayloadDocument');
	expect(withChildResume?.source).toContain("import('@markless/core/web/resume-storage-free')");
	expect(withChild.code).not.toContain('loadFullResume: marklessFullResumeHandoff');
	expect(withChild.code).not.toContain("import('@markless/core/web/resume')");
	expect(withChild.code).not.toContain(
		"import { resumeFromPayloadDocument } from '@markless/core/web/resume';",
	);
});
