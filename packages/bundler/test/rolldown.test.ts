import { describe, expect, test, vi } from 'vitest';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { resolve } from 'pathe';
import { pathToFileURL } from 'node:url';
import { build as viteBuild, type Plugin } from 'vite';
import {
	MARKLESS_BUNDLE_GRAPH,
	marklessLib,
	marklessClient,
	marklessServer,
	prerenderWakeVirtualModuleId,
	resumeVirtualModuleId,
	transformTsrxModule,
} from '../src/rolldown.ts';
import { MARKLESS_EXECUTION_LOG_MODULE_ID } from '../src/execution-log.ts';
import { UNSHIPPED_HOOK_REASON } from '../src/build/execution-sizes.ts';
import { verifyGeneratedSymbolTableRoutes } from '../src/build/symbol-table.ts';
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
			runtimeDemandClass: 'plain-ssr',
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

	test('direct CSR emission stays native when staged wake records are also built', async () => {
		const result = await transformTsrxModule({
			filename: '/workspace/app/src/App.tsrx',
			source,
			environment: 'client',
			prerenderRecords: true,
			directCsr: true,
			prerenderWakeVariant: true,
		});

		expect(result.code).toContain('renderCsr: App');
		expect(result.code).not.toContain('renderSsr(props, marklessRenderContext) {');
	});

	test('staged wake selects native output only for builds without SSR resume entries', async () => {
		const direct = marklessClient({ prerenderWakeChannel: true } as never);
		const resumed = marklessClient({
			prerenderWakeChannel: true,
			emitResumeModules: true,
		} as never);
		callBuildStart(direct, { cwd: '/workspace/app' });
		callBuildStart(resumed, { cwd: '/workspace/app' });

		const directResult = (await callTransform(
			direct,
			source,
			'/workspace/app/src/App.tsrx',
		)) as { readonly code: string };
		const resumedResult = (await callTransform(
			resumed,
			source,
			'/workspace/app/src/App.tsrx',
		)) as { readonly code: string };

		expect(directResult.code).toContain('renderCsr: App');
		expect(resumedResult.code).not.toContain('renderCsr: App');
	});

	test('client definitions use canonical render data without the retired CSR producer', async () => {
		const production = await transformTsrxModule({
			filename: '/workspace/app/src/App.tsrx',
			source: styledSource,
			environment: 'client',
		});
		const prerendered = await transformTsrxModule({
			filename: '/workspace/app/pages/prerendered.tsrx',
			source: styledSource,
			environment: 'client',
			prerenderRecords: true,
		});
		const materialized = await transformTsrxModule({
			filename: '/workspace/app/pages/index.tsrx',
			source: defaultRouteSource,
			environment: 'client',
			prerenderRecords: true,
			artifactChildMaterializations: {
				'component-edge:0': {
					html: '<a href="/docs" data-markless-router-link>Docs</a>',
					elementCount: 1,
				},
			},
		});
		const dev = await transformTsrxModule({
			filename: '/workspace/app/src/App.tsrx',
			source: styledSource,
			environment: 'client',
			dev: true,
		});

		expect(renderDataModuleSource(production)).toContain('"statics"');
		expect(renderDataModuleSource(prerendered)).toContain('marklessPrerenderData');
		expect(renderDataModuleSource(materialized)).toContain('data-markless-router-link');
		expect(renderDataModuleSource(materialized)).toContain('"materialized"');
		expect(renderDataModuleSource(dev)).toContain('"statics"');
		for (const result of [production, prerendered, materialized, dev]) {
			expect(result.code).not.toContain('@markless/web/fns/csr');
			expect(result.code).not.toContain('createMarklessCsrChunkRenderer');
		}
	});

	test('artifact-child-free route queries emit only the renderer facade', async () => {
		const emitFile = vi.fn();
		const resolveImport = vi.fn();
		const ordinaryResolve = vi.fn();
		const queried = (await callTransform(
			marklessClient(),
			styledSource,
			'/workspace/app/pages/docs.tsrx?markless-route',
			{ emitFile, resolve: resolveImport },
		)) as { code: string };
		const ordinary = (await callTransform(
			marklessClient(),
			styledSource,
			'/workspace/app/pages/docs.tsrx',
			{ resolve: ordinaryResolve },
		)) as { code: string };

		expect(queried.code).not.toBe(ordinary.code);
		expect(queried.code).toContain('import("/workspace/app/pages/docs.tsrx?markless-symbols")');
		expect(queried.code).toContain(
			'import("/workspace/app/pages/docs.tsrx?markless-render-data")',
		);
		expect(queried.code).toContain('renderData: renderDataModule.marklessPrerenderData');
		expect(queried.code).toContain('loadSymbol: symbolModule.loadSymbol');
		expect(queried.code).not.toContain('marklessCompiledApp');
		expect(ordinary.code).toContain('marklessCompiledApp');
		expect(emitFile).not.toHaveBeenCalledWith(
			expect.objectContaining({ id: '/workspace/app/pages/docs.tsrx' }),
		);
		expect(resolveImport).not.toHaveBeenCalled();
		expect(ordinaryResolve).not.toHaveBeenCalled();
	});

	test('artifact-child-free route builds retain the queried manifest identity', async () => {
		const root = resolve(import.meta.dirname, '../../router/fixtures/router');
		const filename = resolve(root, 'pages/harbor.tsrx');
		const queriedId = `${filename}?markless-route`;
		const output = await viteBuild({
			configFile: false,
			root,
			logLevel: 'silent',
			plugins: [marklessClient({ executionLog: 'never', rootDir: root })],
			build: {
				write: false,
				minify: false,
				target: 'es2022',
				rolldownOptions: { input: { route: queriedId } },
			},
		});
		const emitted = Array.isArray(output)
			? output.flatMap((item) => item.output)
			: output.output;
		const chunks = emitted.filter((item) => item.type === 'chunk');
		const normalizeModuleId = (id: string | null | undefined) =>
			id?.startsWith('\0') ? id.slice(1) : id;
		const routeChunk = chunks.find(
			(chunk) => normalizeModuleId(chunk.facadeModuleId) === queriedId,
		);
		const demandAsset = emitted.find(
			(item) => item.type === 'asset' && item.fileName === 'build/execution-demand.json',
		);
		const graphAsset = emitted.find(
			(item) => item.type === 'asset' && item.fileName === MARKLESS_BUNDLE_GRAPH,
		);

		expect(routeChunk).toBeDefined();
		expect(routeChunk?.code).not.toContain('@markless/web/fns/csr');
		expect(
			chunks.some((chunk) =>
				chunk.moduleIds.some((id) => normalizeModuleId(id) === filename),
			),
		).toBe(false);
		const demandSources = Object.keys(JSON.parse(String(demandAsset?.source)));
		expect(demandSources).toContain(`${filename}?markless-symbols`);
		expect(demandSources).toContain(`${filename}?markless-render-data`);
		expect(demandSources).not.toContain(filename);
		expect(JSON.parse(String(graphAsset?.source))).toEqual(
			expect.arrayContaining(['symbol:0', 'symbol:5']),
		);
	});

	test('route queries keep composed TSRX children behind the linked facade chain', async () => {
		const routeSource = `import InteractiveCounter from '../components/InteractiveCounter.tsrx';
export default function Docs() @{ <main><InteractiveCounter /></main> }`;
		const resolveImport = vi.fn();
		const ordinaryResolve = vi.fn();
		const queried = (await callTransform(
			marklessClient(),
			routeSource,
			'/workspace/app/pages/docs.tsrx?markless-route',
			{ resolve: resolveImport },
		)) as { code: string };
		const ordinary = (await callTransform(
			marklessClient(),
			routeSource,
			'/workspace/app/pages/docs.tsrx',
			{ resolve: ordinaryResolve },
		)) as { code: string };

		expect(queried.code).not.toBe(ordinary.code);
		expect(queried.code).not.toContain('../components/InteractiveCounter.tsrx');
		expect(queried.code).toContain(
			'import("/workspace/app/pages/docs.tsrx?markless-render-data")',
		);
		expect(queried.code).toContain('import("/workspace/app/pages/docs.tsrx?markless-symbols")');
		expect(ordinary.code).toContain('../components/InteractiveCounter.tsrx');
		expect(resolveImport).not.toHaveBeenCalled();
		expect(ordinaryResolve).toHaveBeenCalled();
	});

	test('production route artifact verifies only claims owned by its emitted symbol facade', async () => {
		const root = resolve(import.meta.dirname, '../../router/fixtures/router-app');
		const filename = resolve(root, 'pages/index.tsrx');
		const queriedId = `${filename}?markless-route`;
		const output = await viteBuild({
			configFile: false,
			root,
			logLevel: 'silent',
			plugins: [marklessClient({ executionLog: 'never', rootDir: root })],
			build: {
				write: false,
				minify: false,
				target: 'es2022',
				rolldownOptions: {
					input: { route: queriedId, symbols: `${filename}?markless-symbols` },
				},
			},
		});
		const chunks = (
			Array.isArray(output) ? output.flatMap((item) => item.output) : output.output
		).filter((item) => item.type === 'chunk');
		const normalizedModuleId = (id: string | null | undefined) =>
			id?.startsWith('\0') ? id.slice(1) : id;
		const queriedChunk = chunks.find(
			(chunk) => normalizedModuleId(chunk.facadeModuleId) === queriedId,
		);
		const primaryChunk = chunks.find((chunk) =>
			chunk.moduleIds.some((id) => normalizedModuleId(id) === filename),
		);
		const renderDataChunk = chunks.find((chunk) =>
			chunk.moduleIds.some(
				(id) => normalizedModuleId(id) === `${filename}?markless-render-data`,
			),
		);
		const transformed = await transformTsrxModule({
			filename,
			source: await readFile(filename, 'utf8'),
			environment: 'client',
			dev: true,
		});
		const integrity = verifyGeneratedSymbolTableRoutes(
			Object.fromEntries(chunks.map((chunk) => [chunk.fileName, chunk])),
			[
				{
					...transformed.manifest,
					source: `${filename}?markless-symbols`,
				},
			],
		);

		expect(queriedChunk?.code).not.toContain('@markless/web/fns/csr');
		expect(primaryChunk).toBeUndefined();
		expect(renderDataChunk).toBeDefined();
		expect(renderDataChunk?.code).toContain('marklessPrerenderData');
		expect(
			chunks
				.flatMap((chunk) => chunk.moduleIds)
				.filter((id) => normalizedModuleId(id)?.startsWith('virtual:markless:symbol:')),
		).not.toEqual(expect.arrayContaining([expect.stringContaining('?markless-route')]));
		expect(integrity).toEqual({
			verified: transformed.manifest.symbols.length,
			errors: [],
		});
		expect(
			verifyGeneratedSymbolTableRoutes(
				Object.fromEntries(chunks.map((chunk) => [chunk.fileName, chunk])),
				[],
			),
			'non-emitted canonical primaries register no orphan claims',
		).toEqual({ verified: 0, errors: [] });
		await assertOrdinaryRouteBuildControl();
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
		expect(result.code).not.toContain('import __marklessSsrComponent');
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
		expect(result.code).not.toContain('@markless/web/fns/csr');
		expect(result.code).not.toContain('createMarklessCsrChunkRenderer');
		expect(result.code).toContain('export default marklessCompiledApp;');
	});

	test('client plugin emits symbol-only output for named symbols TSRX entries', async () => {
		const plugin = marklessClient({ emitResumeModules: true } as never);

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
		const plugin = marklessClient({ emitResumeModules: true } as never);

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
		const plugin = marklessClient({ emitResumeModules: true } as never);
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

	test('wake-first publication does not erase the resume sibling symbol claims', async () => {
		const plugin = marklessClient({ prerenderWakeChannel: true } as never);
		const filename = '/workspace/app/components/UpdateSummary.tsrx';
		const source = `import { computed } from '@markless/core';
export function UpdateSummary({ updates, weight }) @{
	const weightedCount = computed(() => updates.length * weight);
	<p>Weighted count {weightedCount}</p>
}`;

		callBuildStart(plugin, { cwd: '/workspace/app' });
		await callTransform(plugin, source, `${filename}?markless-prerender-wake`);
		await callTransform(plugin, source, `${filename}?markless-resume`, {
			getModuleInfo: () => ({ isEntry: true }),
		});
		await callTransform(plugin, source, `${filename}?markless-symbols`, {
			getModuleInfo: () => ({ isEntry: true }),
		});

		const resolverId = `virtual:markless:resolver:${encodeURIComponent(filename)}`;
		const resolverSource = (await callLoad(plugin, `\0${resolverId}`)) as string;
		expect(resolverSource).toContain('symbol:1');
	});

	test.each(['markless-resume', 'markless-render-data'])(
		'%s child validation reads capture metadata from the child source identity',
		async (query) => {
			const plugin = marklessClient();
			const parentFilename = '/workspace/app/pages/index.tsrx';
			const parentId = `${parentFilename}?${query}`;
			const childFilename = '/workspace/app/components/UpdateSummary.tsrx';
			const childSource = 'export default function UpdateSummary() @{ <p>Ready</p> }';
			const parentSource = `import UpdateSummary from '../components/UpdateSummary.tsrx';
export default function Page() @{ <main><UpdateSummary /></main> }`;
			const resolveImport = vi.fn(async (specifier: string) =>
				specifier === '../components/UpdateSummary.tsrx' ? { id: childFilename } : null,
			);

			callBuildStart(plugin, { cwd: '/workspace/app' });
			await callTransform(plugin, childSource, childFilename, { resolve: resolveImport });
			await callTransform(plugin, parentSource, parentId, { resolve: resolveImport });

			await expect(callGenerateBundle(plugin, {}, vi.fn())).resolves.toBeUndefined();
			expect(resolveImport).toHaveBeenCalledWith(
				'../components/UpdateSummary.tsrx',
				parentId,
				{ skipSelf: true },
			);
		},
	);

	test('resume linking binds child-derived capture metadata recorded by the source module', async () => {
		const plugin = marklessClient({ dev: true });
		const parentFilename = '/workspace/app/pages/live-feed.tsrx';
		const childFilename = '/workspace/app/components/UpdateSummary.tsrx';
		const childSource = `import { computed } from '@markless/core';
export function UpdateSummary({ updates, weight }) @{
	const weightedCount = computed(() => updates.length * weight);
	<p data-weighted-count>Weighted count {weightedCount}</p>
}`;
		const parentSource = `import { state } from '@markless/core';
import { UpdateSummary } from '../components/UpdateSummary.tsrx';
export default function LiveFeed() @{
	let weight = state(2);
	let updates = state([{ id: 'atlas' }, { id: 'beacon' }, { id: 'cedar' }]);
	<main><UpdateSummary updates={updates} weight={weight} /></main>
}`;
		const resolveImport = vi.fn(async (specifier: string) =>
			specifier === '../components/UpdateSummary.tsrx' ? { id: childFilename } : null,
		);

		callBuildStart(plugin, { cwd: '/workspace/app' });
		await callTransform(plugin, childSource, childFilename, { resolve: resolveImport });
		await callTransform(plugin, parentSource, `${parentFilename}?markless-resume`, {
			resolve: resolveImport,
		});

		const resolverId = `virtual:markless:resolver:${encodeURIComponent(parentFilename)}`;
		const resolverSource = (await callLoad(plugin, `\0${resolverId}`)) as string;
		expect(resolverSource).toContain('bound:');
		expect(resolverSource).toContain(encodeURIComponent(childFilename));
	});

	test('client execution logging follows the log mode, not the dev flag', async () => {
		const filename = '/workspace/app/src/App.tsrx';
		const frameworkModule = '/workspace/app/packages/web/src/event-only-resume.ts';
		const symbolId = `virtual:markless:symbol:${encodeURIComponent(filename)}:${encodeURIComponent('symbol:0')}`;

		// `never` is the consumer posture: nothing is rewritten, so no
		// hash-bearing module moves and no byte is added.
		const consumer = marklessClient({ executionLog: 'never' });
		callBuildStart(consumer, { cwd: '/workspace/app' });
		expect(
			await callTransform(consumer, 'export const runtime = true;', frameworkModule),
		).toBeNull();
		await callTransform(consumer, source, filename);
		const consumerSymbol = (await callLoad(consumer, `\0${symbolId}`)) as string;
		expect(consumerSymbol).not.toContain('__mxLog?.add');
		expect(consumerSymbol).toContain('export function symbol_0_');

		// `auto` instruments a production client build too. Without this the
		// ledger has nothing to count outside dev, which was the whole defect.
		const instrumented = marklessClient({ executionLog: 'auto' });
		callBuildStart(instrumented, { cwd: '/workspace/app' });
		const framework = await callTransform(
			instrumented,
			'export const runtime = true;',
			frameworkModule,
		);
		expect(framework?.code).toContain('globalThis.__mxLog?.add("web:event-only-resume");');
		await callTransform(instrumented, source, filename);
		expect((await callLoad(instrumented, `\0${symbolId}`)) as string).toContain(
			`globalThis.__mxLog?.add(${JSON.stringify(symbolId)});`,
		);
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

	test('attribution keys are the bare source paths the consumer looks up', async () => {
		const plugin = marklessClient({ executionLog: 'always', rootDir: '/workspace/app' });
		const emitFile = vi.fn();
		callBuildStart(plugin, { cwd: '/workspace/app' });
		const component = (name: string, child?: string) =>
			`${
				child ? `import Child from ${JSON.stringify(child)};` : ''
			}\nexport default function ${name}() @{ <section>${child ? '<Child />' : name}</section> }`;
		const route = component('RouteA', '../components/Branch.tsrx');
		const branch = component('Branch');
		await callTransform(plugin, route, '/workspace/app/pages/a.tsrx');
		await callTransform(plugin, branch, '/workspace/app/components/Branch.tsrx');
		// The same two sources requested again as interaction-only variants: the
		// build names them with a transform query, the browser never can.
		await callTransform(plugin, route, '/workspace/app/pages/a.tsrx?markless-symbols');
		await callTransform(
			plugin,
			branch,
			'/workspace/app/components/Branch.tsrx?markless-symbols',
		);
		await callGenerateBundle(plugin, {}, emitFile);

		const sizes = emittedAsset(emitFile, 'build/execution-sizes.json');
		const payload = JSON.parse(String(sizes?.source)) as {
			attribution: Record<string, Record<string, string>>;
		};
		// One root, bare: the queried variants merged into their source, and the
		// child stayed a child instead of surfacing as a second root under its
		// queried name.
		expect(Object.keys(payload.attribution)).toEqual(['pages/a.tsrx']);
		expect(JSON.stringify(payload.attribution)).not.toContain('markless-symbols');
		expect(payload.attribution['pages/a.tsrx']).toMatchObject({
			'': encodeURIComponent('/workspace/app/pages/a.tsrx'),
			'c0:': encodeURIComponent('/workspace/app/components/Branch.tsrx'),
		});
	});

	test('a consumer build leaves the size map unenforced', async () => {
		const plugin = marklessClient({
			executionLog: 'never',
			rootDir: '/workspace/app',
			dev: true,
		});
		callBuildStart(plugin, { cwd: '/workspace/app' });
		await callTransform(
			plugin,
			'export const resumeEvents = 1;',
			'/workspace/packages/web/src/resume-events.ts',
		);

		await expect(callGenerateBundle(plugin, {}, vi.fn())).resolves.toBeUndefined();
	});

	test('a hooked module id that no client chunk carries is named in the map, not dropped', async () => {
		const plugin = marklessClient({
			executionLog: 'always',
			rootDir: '/workspace/app',
			dev: true,
		});
		const emitFile = vi.fn();
		callBuildStart(plugin, { cwd: '/workspace/app' });
		await callTransform(
			plugin,
			'export const resumeEvents = 1;',
			'/workspace/packages/web/src/resume-events.ts',
		);

		await callGenerateBundle(plugin, {}, emitFile);
		const sizes = emittedAsset(emitFile, 'build/execution-sizes.json');
		const payload = JSON.parse(String(sizes?.source)) as { unshipped?: Record<string, string> };

		expect(payload.unshipped?.['web:resume-events']).toBe(UNSHIPPED_HOOK_REASON);
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

	test('client page roots never import artifact candidates from inside the app source tree', async () => {
		const fixtureRoot = await mkdtemp(
			resolve(import.meta.dirname, '.artifact-child-import-gate-'),
		);
		const appRoot = resolve(fixtureRoot, 'app');
		const pageFilename = resolve(appRoot, 'pages/index.tsrx');
		const localComponentFilename = resolve(appRoot, 'components/LocalFrame.mjs');
		await mkdir(resolve(appRoot, 'pages'), { recursive: true });
		await mkdir(resolve(appRoot, 'components'), { recursive: true });
		await writeFile(
			localComponentFilename,
			`export const LocalFrame = { renderSsr() { return { html: '<aside data-local-frame>Local</aside>', elementCount: 1 }; } };`,
		);
		const plugin = marklessClient({ rootDir: appRoot, prerender: true });
		const resolveImport = vi.fn(async (specifier: string) =>
			specifier === '../components/LocalFrame.mjs' ? { id: localComponentFilename } : null,
		);

		try {
			callBuildStart(plugin, { cwd: appRoot });
			const result = (await callTransform(
				plugin,
				`import { LocalFrame } from '../components/LocalFrame.mjs';
export default function Page() @{ <main><LocalFrame /></main> }`,
				pageFilename,
				{
					resolve: resolveImport,
					getModuleInfo: () => ({ isEntry: true }),
				},
			)) as { code: string; virtualModules: Array<{ type: string; source: string }> };

			expect(result.code).not.toContain('data-local-frame');
			expect(result.code).toContain('../components/LocalFrame.mjs');
		} finally {
			await rm(fixtureRoot, { recursive: true, force: true });
		}
	});

	test('only client page entries expose on-disk package artifact-child candidates', async () => {
		const fixtureRoot = await mkdtemp(
			resolve(import.meta.dirname, '.artifact-child-page-root-'),
		);
		const appRoot = resolve(fixtureRoot, 'app');
		const packageFilename = resolve(fixtureRoot, 'packages/StaticFrame.mjs');
		await mkdir(resolve(appRoot, 'pages'), { recursive: true });
		await mkdir(resolve(fixtureRoot, 'packages'), { recursive: true });
		await writeFile(
			packageFilename,
			`export const StaticFrame = { renderSsr() { return { html: '<aside data-package-frame>Package</aside>', elementCount: 1 }; } };`,
		);
		const plugin = marklessClient({ rootDir: appRoot });
		const pageSource = `import { StaticFrame } from '@fixtures/static-frame';
export default function Page() @{ <main><StaticFrame /></main> }`;
		const resolvePackage = vi.fn(async (specifier: string) =>
			specifier === '@fixtures/static-frame' ? { id: packageFilename } : null,
		);

		try {
			callBuildStart(plugin, { cwd: appRoot });
			const imported = (await callTransform(
				plugin,
				pageSource,
				resolve(appRoot, 'components/ImportedPage.tsrx'),
				{
					resolve: resolvePackage,
					getModuleInfo: () => ({ isEntry: false }),
				},
			)) as { code: string; virtualModules: Array<{ type: string; source: string }> };
			expect(imported.code).not.toContain('data-package-frame');

			const viteModuleInfo = {} as { readonly isEntry: boolean };
			Object.defineProperty(viteModuleInfo, 'isEntry', {
				get() {
					throw new Error('The "isEntry" property of ModuleInfo is not supported.');
				},
			});
			const viteImported = (await callTransform(
				plugin,
				pageSource,
				resolve(appRoot, 'components/ViteImportedPage.tsrx'),
				{
					resolve: resolvePackage,
					getModuleInfo: () => viteModuleInfo,
				},
			)) as { code: string };
			expect(viteImported.code).not.toContain('data-package-frame');

			const page = (await callTransform(
				plugin,
				pageSource,
				resolve(appRoot, 'pages/index.tsrx'),
				{
					resolve: resolvePackage,
					getModuleInfo: () => ({ isEntry: true }),
				},
			)) as {
				code: string;
				artifactChildren: Array<{ componentName: string; importSource: string }>;
			};
			expect(page.artifactChildren).toEqual([
				expect.objectContaining({
					componentName: 'StaticFrame',
					importSource: '@fixtures/static-frame',
				}),
			]);
			expect(page.code).not.toContain('@markless/web/fns/csr');
		} finally {
			await rm(fixtureRoot, { recursive: true, force: true });
		}
	});

	test('non-entry render-data requests reuse stored route-artifact materializations', async () => {
		const fixtureRoot = await mkdtemp(resolve(import.meta.dirname, '.artifact-child-reuse-'));
		const appRoot = resolve(fixtureRoot, 'app');
		const pageFilename = resolve(appRoot, 'pages/index.tsrx');
		const packageFilename = resolve(fixtureRoot, 'packages/StaticFrame.mjs');
		await mkdir(resolve(appRoot, 'pages'), { recursive: true });
		await mkdir(resolve(fixtureRoot, 'packages'), { recursive: true });
		await writeFile(
			packageFilename,
			`export const StaticFrame = { renderSsr() { return { html: '<aside data-package-frame>Package</aside>', elementCount: 1 }; } };`,
		);
		const plugin = marklessClient({ rootDir: appRoot });
		const pageSource = `import { StaticFrame } from '@fixtures/static-frame';
export default function Page() @{ <main><StaticFrame /></main> }`;
		const resolvePackage = vi.fn(async (specifier: string) =>
			specifier === '@fixtures/static-frame' ? { id: packageFilename } : null,
		);

		try {
			callBuildStart(plugin, { cwd: appRoot });
			await callTransform(plugin, pageSource, `${pageFilename}?markless-route`, {
				resolve: resolvePackage,
				getModuleInfo: () => ({ isEntry: true }),
			});
			const renderData = (await callTransform(
				plugin,
				pageSource,
				`${pageFilename}?markless-render-data`,
				{
					resolve: resolvePackage,
					getModuleInfo: () => ({ isEntry: false }),
				},
			)) as { code: string };

			expect(renderData.code).toContain('export const marklessPrerenderData');
			expect(renderData.code).toContain('data-package-frame');
			expect(renderData.code).toContain('"materialized"');
		} finally {
			await rm(fixtureRoot, { recursive: true, force: true });
		}
	});

	test('materialized route render data links only TSRX descendants reached from that route', async () => {
		const fixtureRoot = await mkdtemp(resolve(import.meta.dirname, '.artifact-child-reach-'));
		const appRoot = resolve(fixtureRoot, 'app');
		const pageFilename = resolve(appRoot, 'pages/index.tsrx');
		const childFilename = resolve(appRoot, 'components/StyledChild.tsrx');
		const packageFilename = resolve(fixtureRoot, 'packages/StaticFrame.mjs');
		await mkdir(resolve(appRoot, 'pages'), { recursive: true });
		await mkdir(resolve(appRoot, 'components'), { recursive: true });
		await mkdir(resolve(fixtureRoot, 'packages'), { recursive: true });
		await writeFile(
			packageFilename,
			`export const StaticFrame = { renderSsr() { return { html: '<aside data-package-frame>Package</aside>', elementCount: 1 }; } };`,
		);
		const plugin = marklessClient({ rootDir: appRoot });
		const pageSource = `import { StaticFrame } from '@fixtures/static-frame';
import StyledChild from '../components/StyledChild.tsrx';
export default function Page() @{ <main><StaticFrame /><StyledChild /></main> }`;
		const childSource = `export default function StyledChild() @{ <div><p>Styled child</p><style>p { color: blue; }</style></div> }`;
		const resolveImport = vi.fn(async (specifier: string) => {
			if (specifier === '@fixtures/static-frame') return { id: packageFilename };
			if (specifier === '../components/StyledChild.tsrx') return { id: childFilename };
			return null;
		});
		const load = vi.fn(async ({ id }: { readonly id: string }) => {
			if (id !== childFilename) return null;
			return await callTransform(plugin, childSource, childFilename, {
				resolve: resolveImport,
				getModuleInfo: () => ({ isEntry: false }),
			});
		});

		try {
			callBuildStart(plugin, { cwd: appRoot });
			await callTransform(plugin, pageSource, `${pageFilename}?markless-route`, {
				resolve: resolveImport,
				getModuleInfo: () => ({ isEntry: true }),
			});
			const pageRenderData = (await callTransform(
				plugin,
				pageSource,
				`${pageFilename}?markless-render-data`,
				{
					resolve: resolveImport,
					load,
					getModuleInfo: () => ({ isEntry: false }),
				},
			)) as { code: string };
			const reachedChildId = `${childFilename}?markless-render-data&markless-reached-from=${encodeURIComponent(pageFilename)}`;
			const reachedChild = (await callTransform(plugin, childSource, reachedChildId, {
				resolve: resolveImport,
				getModuleInfo: () => ({ isEntry: false }),
			})) as { code: string };
			const canonicalChildId = `virtual:markless:render-data:${encodeURIComponent(childFilename)}`;
			const canonicalChild = (await callLoad(plugin, `\0${canonicalChildId}`)) as string;

			expect(pageRenderData.code).toContain(JSON.stringify(reachedChildId));
			expect(reachedChild.code).toContain('export const marklessPrerenderData');
			expect(reachedChild.code).toContain('virtual:markless:style:');
			expect(canonicalChild).toContain('export const marklessRenderData');
			expect(canonicalChild).toContain('export const marklessPrerenderData');
		} finally {
			await rm(fixtureRoot, { recursive: true, force: true });
		}
	});

	test('reached child render data materializes artifact-shaped descendants into its linked surface', async () => {
		const fixtureRoot = await mkdtemp(resolve(import.meta.dirname, '.reached-artifact-child-'));
		const appRoot = resolve(fixtureRoot, 'app');
		const routeFilename = resolve(appRoot, 'pages/docs.mdx');
		const childFilename = resolve(appRoot, 'components/InteractiveCounter.tsrx');
		const packageFilename = resolve(fixtureRoot, 'packages/StaticLink.mjs');
		await mkdir(resolve(appRoot, 'components'), { recursive: true });
		await mkdir(resolve(fixtureRoot, 'packages'), { recursive: true });
		await writeFile(
			packageFilename,
			`export const StaticLink = { renderSsr(props) { return { html: '<a data-static-link>' + props.label + '</a>', elementCount: 1 }; } };`,
		);
		const plugin = marklessClient({ rootDir: appRoot });
		const childSource = `import { StaticLink } from '@fixtures/static-link';
export default function InteractiveCounter() @{ <section><StaticLink label="Home" /></section> }`;
		const resolvePackage = vi.fn(async (specifier: string) =>
			specifier === '@fixtures/static-link' ? { id: packageFilename } : null,
		);

		try {
			callBuildStart(plugin, { cwd: appRoot });
			const reachedId = `${childFilename}?markless-render-data&markless-reached-from=${encodeURIComponent(routeFilename)}`;
			const reached = (await callTransform(plugin, childSource, reachedId, {
				resolve: resolvePackage,
				getModuleInfo: () => ({ isEntry: false }),
			})) as { code: string };

			expect(reached.code).toContain('export const marklessPrerenderData');
			expect(reached.code).toContain('data-static-link');
			expect(reached.code).toContain('"materialized"');
		} finally {
			await rm(fixtureRoot, { recursive: true, force: true });
		}
	});

	async function assertOrdinaryRouteBuildControl() {
		const fixtureRoot = await mkdtemp(resolve(import.meta.dirname, '.ordinary-route-control-'));
		const appRoot = resolve(fixtureRoot, 'app');
		const pageFilename = resolve(appRoot, 'pages/index.tsrx');
		const childFilename = resolve(appRoot, 'components/Child.tsrx');
		const controlFilename = resolve(appRoot, 'control.mjs');
		const controlRenderDataFilename = resolve(appRoot, 'control-render-data.mjs');
		const pageSource = `import Child from '../components/Child.tsrx';
export default function Page() @{ <main><Child /></main> }`;
		const childSource = `export default function Child() @{ <p>Control child</p> }`;
		await mkdir(resolve(appRoot, 'pages'), { recursive: true });
		await mkdir(resolve(appRoot, 'components'), { recursive: true });
		await writeFile(pageFilename, pageSource);
		await writeFile(childFilename, childSource);

		try {
			const canonical = await transformTsrxModule({
				filename: pageFilename,
				source: pageSource,
				environment: 'client',
				dev: true,
			});
			await writeFile(controlRenderDataFilename, renderDataModuleSource(canonical));
			await writeFile(
				controlFilename,
				`export default import('./control-render-data.mjs').then((module) => module.marklessRenderData);`,
			);
			const outputOptions = {
				entryFileNames: '[name].js',
				chunkFileNames: '[name].js',
				minifyInternalExports: false,
			} as const;
			const routeOutput = await viteBuild({
				configFile: false,
				root: appRoot,
				logLevel: 'silent',
				plugins: [marklessClient({ executionLog: 'never', rootDir: appRoot })],
				build: {
					write: false,
					minify: true,
					target: 'es2022',
					rolldownOptions: {
						preserveEntrySignatures: 'strict',
						input: { route: `${pageFilename}?markless-route` },
						output: { ...outputOptions, preserveModules: true },
					},
				},
			});
			const controlOutput = await viteBuild({
				configFile: false,
				root: appRoot,
				logLevel: 'silent',
				build: {
					write: false,
					minify: true,
					target: 'es2022',
					rolldownOptions: {
						preserveEntrySignatures: 'strict',
						input: { control: controlFilename },
						output: { ...outputOptions, preserveModules: true },
					},
				},
			});
			const routeChunks = (
				Array.isArray(routeOutput)
					? routeOutput.flatMap((item) => item.output)
					: routeOutput.output
			).filter((item) => item.type === 'chunk');
			const controlChunk = (
				Array.isArray(controlOutput)
					? controlOutput.flatMap((item) => item.output)
					: controlOutput.output
			).find(
				(item) =>
					item.type === 'chunk' && item.moduleIds.includes(controlRenderDataFilename),
			);
			const renderDataChunk = routeChunks.find((chunk) =>
				chunk.moduleIds.includes(`${pageFilename}?markless-render-data`),
			);

			const renderDataBytes = (code: string | undefined) => {
				const start = code?.indexOf('{passId:') ?? -1;
				const endMarker = 'interactions:[]}';
				const end = code?.indexOf(endMarker, start) ?? -1;
				return start >= 0 && end >= 0
					? code!.slice(start, end + endMarker.length)
					: undefined;
			};
			expect(renderDataBytes(renderDataChunk?.code)).toBe(
				renderDataBytes(controlChunk?.code),
			);
			expect(renderDataChunk?.code).toContain('marklessRenderData');
			expect(renderDataChunk?.code).toContain('marklessPrerenderData');
			expect(
				routeChunks.flatMap((chunk) => chunk.moduleIds),
				'ordinary reach must not emit or request child render data',
			).not.toEqual(
				expect.arrayContaining([
					expect.stringContaining(
						`virtual:markless:render-data:${encodeURIComponent(childFilename)}`,
					),
					expect.stringContaining('markless-reached-from'),
				]),
			);
		} finally {
			await rm(fixtureRoot, { recursive: true, force: true });
		}
	}

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
		const resolver = parent.virtualModules.find((module) => module.type === 'resolver')!;
		for (const row of rows) expect(resolver.source).toContain(row.id);
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
		const bundle = {
			'build/source.js': {
				type: 'chunk',
				fileName: 'build/source.js',
				name: 'source',
				code: 'export default {};',
				exports: ['default'],
				imports: ['build/chunk-1.js'],
				dynamicImports: [],
				moduleIds: ['/workspace/app/src/App.tsrx'],
				facadeModuleId: '/workspace/app/src/App.tsrx',
			},
			...Object.fromEntries(
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
			),
		};

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
				'build/source.js': {
					type: 'chunk',
					fileName: 'build/source.js',
					name: 'source',
					code: 'export default {};',
					exports: ['default'],
					imports: ['build/resolver.js'],
					dynamicImports: [],
					moduleIds: [filename],
					facadeModuleId: filename,
				},
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
				'build/source.js': {
					type: 'chunk',
					fileName: 'build/source.js',
					name: 'source',
					code: 'export default {};',
					exports: ['default'],
					imports: ['build/resolver.js'],
					dynamicImports: [],
					moduleIds: [filename],
					facadeModuleId: filename,
				},
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
				'build/source.js': {
					type: 'chunk',
					fileName: 'build/source.js',
					name: 'source',
					code: 'export default {};',
					exports: ['default'],
					imports: ['build/resolver.js'],
					dynamicImports: [],
					moduleIds: [filename],
					facadeModuleId: filename,
				},
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

test('materialized route definitions stay in canonical render data', async () => {
	const filename = '/workspace/app/pages/index.tsrx';
	const result = await transformTsrxModule({
		filename,
		source: defaultRouteSource,
		environment: 'client',
		prerenderRecords: true,
		artifactChildMaterializations: {
			'component-edge:0': {
				html: '<a href="/docs" data-markless-router-link>Docs</a>',
				elementCount: 1,
			},
		},
	});
	expect(renderDataModuleSource(result)).toContain('data-markless-router-link');
	expect(renderDataModuleSource(result)).toContain('"materialized"');
	expect(result.code).not.toContain('@markless/web/fns/csr');
});

test('a wake facade owns its claimed symbol routes while the prerender primary owns none', async () => {
	const filename = '/workspace/app/src/WakePage.tsrx';
	const primary = await transformTsrxModule({
		filename,
		source: fullResumeSource,
		environment: 'client',
		prerenderRecords: true,
		prerenderWakeVariant: true,
	});
	const facade = await transformTsrxModule({
		filename,
		source: fullResumeSource,
		environment: 'client',
		clientOutput: 'symbols-only',
		prerenderRecords: true,
		prerenderWakeVariant: true,
		prerenderWakeFacade: true,
	});
	const wake = facade.virtualModules.find((module) => module.type === 'prerender-wake');

	expect(primary.manifest.symbols).toEqual([]);
	expect(facade.manifest.resolver.virtualModuleId).toBe(prerenderWakeVirtualModuleId(filename));
	expect(facade.manifest.symbols.length).toBeGreaterThan(0);
	expect(wake).toBeDefined();
	for (const symbol of facade.manifest.symbols) {
		expect(wake?.source).toContain(`symbolId === ${JSON.stringify(symbol.symbolId)}`);
		expect(wake?.source).toContain(`import('${symbol.virtualModuleId}')`);
	}
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
		runtimeDemandClass: 'plain-ssr',
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
		runtimeDemandClass: 'plain-ssr',
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
		runtimeDemandClass: 'plain-ssr',
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
