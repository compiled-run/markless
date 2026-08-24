import { expect, test } from 'vitest';
import { ASYNC_PROTOCOL_VERSION, STORAGE_PROTOCOL_VERSION } from '@markless/serializer';
import {
	emitResumeModule,
	emitSourceModule,
	rewriteSymbolModuleExport,
	symbolVirtualModuleId,
	symbolVirtualModuleSourceFile,
} from '../src/source-module.ts';

const baseInput = {
	filename: '/workspace/app/src/App.tsrx',
	payloadId: 'virtual:markless:payload',
	resolverId: 'virtual:markless:resolver',
	environment: 'client' as const,
	clientOutput: 'full' as const,
	publicRenderModuleSource: '',
	publicRenderRootExportName: null,
	publicCsrModuleSource: '',
	publicRenderCsrExportName: null,
	publicSsrModuleSource: '',
	publicRenderSsrExportName: null,
	symbols: [{ id: 'symbol:click', chunk: './click.js', exportName: 'onClick' }],
	symbolRoutes: [],
};

test('emitSourceModule keeps full resume behind a dynamic handoff', () => {
	const code = emitSourceModule({
		...baseInput,
		needsFullResume: true,
	});

	expect(code).not.toContain(
		"import { resumeEventOnlyFromPayloadDocument } from '@markless/core/web/event-only-resume';",
	);
	expect(code).not.toContain('function resumeContainerEvent');
	expect(code).not.toContain("import('@markless/core/web/resume')");
	const resumeCode = emitResumeModule({
		...baseInput,
		needsFullResume: true,
	});
	expect(resumeCode).toContain('export function resumeContainerEvent(input) {');
	expect(resumeCode).toContain("import('@markless/core/web/resume')");
	expect(code).not.toMatch(/^\s*const\s+marklessFullResumeModule\s*=\s*import\(/m);
	expect(code).not.toContain(
		"import { resumeFromPayloadDocument } from '@markless/core/web/resume';",
	);
});

test('server source module carries the prerender wake URL beside the regular resume URL', () => {
	const code = emitSourceModule({
		...baseInput,
		environment: 'server',
		resumeModuleUrl: '/build/resume-A1b2.js',
		prerenderWakeModuleUrl: '/build/prerender-wake-C3d4.js',
	});

	expect(code).toContain('resumeModuleUrl: "/build/resume-A1b2.js"');
	expect(code).toContain('prerenderWakeModuleUrl: "/build/prerender-wake-C3d4.js"');
});

test('prerender record entries do not concatenate the CSR renderer source', () => {
	const code = emitSourceModule({
		...baseInput,
		prerenderRecords: true,
		publicCsrModuleSource:
			'const fetchLocalUpdates = () => {}; function initialWeight() { return 2; }',
	});

	expect(code).not.toContain('fetchLocalUpdates');
	expect(code).not.toContain('initialWeight');
});

test('ordinary client entries pair initializer loaders with canonical render data', () => {
	const code = emitSourceModule({
		...baseInput,
		renderDataId: 'virtual:markless:render-data:App',
		canonicalRenderData: true,
		publicSsrModuleSource: 'async function marklessRenderSsr() {}',
		publicRenderSsrExportName: 'marklessRenderSsr',
	});

	expect(code).toContain(
		`import { marklessPrerenderData } from 'virtual:markless:render-data:App';`,
	);
	expect(code).toContain('\trenderData: marklessPrerenderData,');
	expect(code).toContain('\tloadSymbol: loadSymbol,');
	expect(code).not.toContain('\trenderSsr(props, marklessRenderContext)');

	const devCode = emitSourceModule({
		...baseInput,
		dev: true,
		renderDataId: 'virtual:markless:render-data:App',
		canonicalRenderData: true,
		publicSsrModuleSource: 'async function marklessRenderSsr() {}',
		publicRenderSsrExportName: 'marklessRenderSsr',
	});
	expect(devCode).toContain('\trenderData: marklessPrerenderData,');
	expect(devCode).toContain('\trenderSsr(props, marklessRenderContext)');
});

test('a client module carrying the SSR body binds the render data it spreads', () => {
	// The compiler's per-component SSR functions spread bare `marklessRenderData`;
	// leaving it out of the import is a ReferenceError at module evaluation.
	const ssrBody =
		'async function marklessRenderSsr(props, marklessRenderContext) { return { ...marklessRenderData }; }';
	const devCode = emitSourceModule({
		...baseInput,
		dev: true,
		renderDataId: 'virtual:markless:render-data:App',
		canonicalRenderData: true,
		publicSsrModuleSource: ssrBody,
		publicRenderSsrExportName: 'marklessRenderSsr',
	});

	expect(devCode).toContain(ssrBody);
	expect(devCode).toContain(
		`import { marklessPrerenderData, marklessRenderData } from 'virtual:markless:render-data:App';`,
	);

	const prodCode = emitSourceModule({
		...baseInput,
		renderDataId: 'virtual:markless:render-data:App',
		canonicalRenderData: true,
		publicSsrModuleSource: ssrBody,
		publicRenderSsrExportName: 'marklessRenderSsr',
	});

	expect(prodCode).not.toContain(ssrBody);
	expect(prodCode).toContain(
		`import { marklessPrerenderData } from 'virtual:markless:render-data:App';`,
	);
	expect(prodCode).not.toContain('marklessRenderData');
});

test('emitSourceModule gives every authored behavior a direct mount-time loader', () => {
	const code = emitSourceModule({
		...baseInput,
		behaviorSymbols: [
			{ id: 'symbol:attach', chunk: './attach.js', exportName: 'installController' },
		],
	});

	expect(code).toContain('function loadBehaviorSymbol(symbolId)');
	expect(code).toContain(`symbolId === "symbol:attach"`);
	expect(code).toContain(`import('./attach.js')`);
	expect(code.match(/function readMarklessSourceSymbol/g)).toHaveLength(1);
	expect(code).toContain('function readMarklessBehaviorSourceSymbol');
});

test('emitResumeModule routes non-lean event-only entries through the full handoff', () => {
	const code = emitSourceModule({
		...baseInput,
		needsFullResume: false,
	});
	const resumeCode = emitResumeModule({
		...baseInput,
		needsFullResume: false,
	});

	expect(code).not.toContain('resumeEventOnlyFromPayloadDocument');
	expect(code).not.toContain('function resumeContainerEvent');
	expect(resumeCode).not.toContain('resumeEventOnlyFromPayloadDocument');
	expect(resumeCode).toContain("import('@markless/core/web/resume')");
	expect(resumeCode).toContain('export function resumeContainerEvent(input) {');
	expect(code).not.toContain('loadFullResume: marklessFullResumeHandoff');
	expect(code).not.toContain("import('@markless/core/web/resume')");
	expect(code).not.toMatch(/^\s*const\s+marklessFullResumeModule\s*=\s*import\(/m);
	expect(code).not.toContain(
		"import { resumeFromPayloadDocument } from '@markless/core/web/resume';",
	);
});

test('emitResumeModule derives prerender records from linked render data on demand', () => {
	const resumeCode = emitResumeModule({
		...baseInput,
		needsFullResume: true,
		prerenderDataId: 'virtual:markless:render-data:App',
	});

	expect(resumeCode).toContain(
		`import { marklessPrerenderData } from 'virtual:markless:render-data:App';`,
	);
	expect(resumeCode).toContain('derivePrerenderResumeRecords(marklessPrerenderData, loadSymbol)');
	expect(resumeCode).toContain('mergePrerenderPayloadRecords(records, handoff.root)');
	expect(resumeCode).toContain('resumeFromPrerenderRecords');
	expect(resumeCode).not.toContain('resumeFromPayloadDocument');
	expect(resumeCode).not.toContain('App.tsrx');
	expect(resumeCode).not.toContain('marklessPrerenderPage');
});

test('emitResumeModule keeps trigger staging behind the prerender wake boundary', () => {
	const ungated = emitResumeModule({
		...baseInput,
		needsFullResume: true,
		payloadView: { asyncBoundaries: [{}] },
	});
	const staged = emitResumeModule({
		...baseInput,
		needsFullResume: true,
		recordsOnly: true,
		// Staged modules keep the fallback surface: trigger groups are the
		// first choice, prerenderDataId feeds the unmatched-interaction path.
		prerenderDataId: 'virtual:markless:render-data:app',
		prerenderTriggerGroups: [
			{
				id: 'self-wake',
				hostNodeId: 'self-wake',
				eventName: 'self-wake',
				hostIndex: -1,
				hostTagName: '*',
				moduleId: 'virtual:markless:trigger-group:App:self-wake',
			},
			{
				id: 'host:play:click',
				hostNodeId: 'host:play',
				eventName: 'click',
				hostIndex: 1,
				hostTagName: 'button',
				moduleId: 'virtual:markless:trigger-group:App:0',
			},
			{
				id: 'branch:player:click:0',
				hostNodeId: 'branch:player:0',
				eventName: 'click',
				hostIndex: -1,
				hostTagName: '*',
				branchStartIndex: 0,
				branchEndIndex: 1,
				hostPath: [0],
				moduleId: 'virtual:markless:trigger-group:App:1',
			},
		],
	});

	expect(ungated).not.toContain('prerender-trigger-resume');
	expect(ungated).toContain('__marklessDispatch');
	expect(staged).toContain("import('@markless/web/fns/prerender-trigger-resume')");
	expect(staged).toContain('graphNodeIds: group.graphNodeIds');
	expect(staged).not.toContain('const { renderPrerenderBoundary }');
	expect(staged.match(/renderAsyncBoundary: \(boundaryId, status, graph\)/g)).toHaveLength(1);
	expect(staged).toContain('const marklessPrerenderData = await marklessLoadPrerenderData()');
	expect(staged).toContain("import('virtual:markless:render-data:app')");
	expect(staged).not.toContain(
		"import { marklessPrerenderData } from 'virtual:markless:render-data:app';",
	);
	expect(staged).toContain('__marklessDispatch');
	// The ungrouped fallback caches its runtime and never registers on the
	// dispatch chain; a registered handler would starve the group loader.
	expect(staged).toContain('handoff.root.__marklessFullResumeRuntime ??=');
	expect(staged).not.toContain('__marklessRegisterDispatch?.(');
	expect(staged).toContain('function readMarklessWakeSourceSymbol');
	expect(staged).toContain('marklessPrerenderBranchTriggerMatches');
	expect(staged).toContain('input.event === 0');
	expect(staged).not.toContain('function readMarklessSourceSymbol');
});

test('every resume module serializes dispatch, streamed or not', () => {
	// A page with no async boundary and no prerender group is the plain case the
	// streamed gate used to leave bare, so two fast keystrokes each ran their
	// handler body as an independent task and interleaved (defect 93).
	const plain = emitResumeModule({
		...baseInput,
		needsFullResume: true,
	});
	const lean = emitResumeModule(scalarResumeInput());

	for (const resumeCode of [plain, lean]) {
		expect(resumeCode).toContain('async function marklessResumeContainerEvent');
		expect(resumeCode).not.toContain('export async function resumeContainerEvent');
		expect(resumeCode).toContain('root.__marklessDispatch');
		expect(resumeCode).toContain('return tail = tail.then(run, run);');
		// The same-event dedupe guard rides with the queue; it closed the
		// lost-click defect and must not be separable from it.
		expect(resumeCode).toContain('if (event === lastEvent && eventTime === lastEventTime)');
	}
});

test('emitResumeModule keeps capability-free prerender pages on the lean handoff', () => {
	const resumeCode = emitResumeModule({
		...scalarResumeInput(),
		needsFullResume: false,
		prerenderDataId: 'virtual:markless:render-data:Counter',
	});

	expect(resumeCode).not.toContain('marklessPrerenderData');
	expect(resumeCode).not.toContain('derivePrerenderResumeRecords');
	expect(resumeCode).not.toContain('resumeFromPrerenderRecords');
	expect(resumeCode).not.toContain("import('@markless/core/web/resume')");
});

test('emitResumeModule aligns payload-absent prerender pages with no resume handoff', () => {
	const resumeCode = emitResumeModule({
		...baseInput,
		symbols: [],
		needsFullResume: false,
		prerenderDataId: 'virtual:markless:render-data:Static',
	});

	expect(resumeCode).not.toContain('marklessPrerenderData');
	expect(resumeCode).not.toContain('marklessFullResumeHandoff');
	expect(resumeCode).not.toContain('resumeFromPrerenderRecords');
});

test('emitResumeModule selects the decoder entry from the recorded payload version', () => {
	const storageFree = emitResumeModule({
		...baseInput,
		payloadState: { version: ASYNC_PROTOCOL_VERSION },
		needsFullResume: true,
	});
	const storage = emitResumeModule({
		...baseInput,
		payloadState: { version: STORAGE_PROTOCOL_VERSION },
		needsFullResume: true,
	});

	expect(storageFree).toContain("import('@markless/core/web/resume-storage-free')");
	expect(storageFree).not.toContain("import('@markless/core/web/resume')");
	expect(storage).toContain("import('@markless/core/web/resume')");
	expect(storage).not.toContain('resume-storage-free');
});

test('emitResumeModule emits a specialized scalar dispatcher with resolved constants', () => {
	const resumeCode = emitResumeModule(scalarResumeInput());

	expect(resumeCode).toContain("from '@markless/web/fns/scalar-specialized';");
	expect(resumeCode).toContain("from '@markless/web/fns/write-scalar';");
	expect(resumeCode).toContain("from '@markless/web/fns/update-text';");
	expect(resumeCode).toContain(
		'marklessScalarEventMatches(input, marklessFindElementAtDomOrderIndex(input.root, 3), "button", "click", "host:button")',
	);
	expect(resumeCode).toContain('const eventTarget = input.event?.target;');
	expect(resumeCode).toContain('input.event?.type === eventName');
	expect(resumeCode).toContain('marklessFindElementAtDomOrderIndex(input.root, 3)');
	expect(resumeCode).toContain('marklessFindElementAtDomOrderIndex(input.root, 5)');
	expect(resumeCode).not.toContain('?? input.element ?? input.event.target');
	expect(resumeCode).toContain('marklessReadScalarCell(input.root, "state:count")');
	expect(resumeCode).toContain('?? {"graphNodeId":"state:count"');
	expect(resumeCode).toContain('input.root.__marklessEventOnlyGraph || new Map()');
	expect(resumeCode).toContain('values.set("state:count", state.value)');
	expect(resumeCode).toContain(
		'marklessDecodeScalarCell(marklessReadScalarCell(input.root, "state:count")',
	);
	expect(resumeCode).not.toContain('state as payloadState');
	expect(resumeCode).toContain('graphNodeId === "state:count"');
	expect(resumeCode).toContain(
		'marklessUpdateText({ domUpdate: { hostNodeId: "host:label" }, value: "Count: " + (state.value == null ? \'\' : String(state.value)) }, "host:label").value',
	);
	expect(resumeCode).toContain('loadSymbol("symbol:click")');
	expect(resumeCode).not.toContain('input.loadSymbol("symbol:click")');
	expect(resumeCode).not.toContain('@markless/web/event-only-lean/scalar-core');
	expect(resumeCode).not.toContain('@markless/web/event-only-lean/lean-shared');
	expect(resumeCode).not.toContain('@markless/web/event-only-lean/row');
	expect(resumeCode).not.toContain('@markless/web/inline/sync-policy-core');
	expect(resumeCode).not.toContain('payloadRuntimeDemandMap.actions.find');
	expect(resumeCode).not.toContain('payloadView.domUpdates.find');
	expect(resumeCode).not.toContain('resumeEventOnlyFromPayloadDocument');
	expect(resumeCode).not.toContain("import('@markless/core/web/resume')");
	expect(resumeCode).toContain('marklessScalarSpecializedHostMiss');
});

test('scalar dispatch and staged wake share one neutral DOM-order helper import', () => {
	const resumeCode = emitResumeModule({
		...scalarResumeInput(),
		prerenderTriggerGroups: [
			{
				id: 'host:button:click',
				hostNodeId: 'host:button',
				eventName: 'click',
				hostIndex: 3,
				hostTagName: 'button',
				moduleId: 'virtual:markless:trigger-group:Counter:0',
			},
		],
	});

	expect(
		resumeCode.match(
			/import \{ marklessFindElementAtDomOrderIndex \} from '@markless\/web\/fns\/dom-order';/g,
		),
	).toHaveLength(1);
	expect(resumeCode).not.toMatch(
		/import \{[^\n]*marklessFindElementAtDomOrderIndex[^\n]*\} from '@markless\/web\/fns\/scalar-specialized';/,
	);
});

test('emitSourceModule carries compiled inline variants only on server artifacts', () => {
	const inlineResumerSources = {
		debug: false,
		executionLog: 'never' as const,
		event: 'event-source',
		syncPolicy: 'sync-source',
		graphSyncPolicyOwner: 'graph-owner-source',
		graphSyncPolicyConsumer: 'graph-consumer-source',
	};
	const renderInput = {
		...baseInput,
		inlineResumerSources,
		publicSsrModuleSource: 'function marklessRenderSsr() {}',
		publicRenderSsrExportName: 'marklessRenderSsr',
	};

	const server = emitSourceModule({ ...renderInput, environment: 'server' });
	const client = emitSourceModule(renderInput);

	expect(server).toContain('inlineResumerSources:');
	expect(server).toContain(JSON.stringify(inlineResumerSources));
	expect(client).not.toContain('inlineResumerSources:');
});

test('composed pages are excluded from scalar specialization (deferred projection design)', () => {
	const input = scalarResumeInput();
	(input as { symbolRoutes: unknown }).symbolRoutes = [
		{ prefix: 'c0:', importSource: './child.tsrx' },
	];
	const resumeCode = emitResumeModule(input as Parameters<typeof emitResumeModule>[0]);
	// Child-composed hosts keep caller-coordinate locators; until the
	// projection-metadata design lands, composed pages emit NO specialized
	// actions (the wrapper falls straight through to the full path).
	expect(resumeCode).not.toContain('hostNodeId===');
});

test('specialized scalar dispatcher excludes composed child symbols without a route', () => {
	const input = scalarResumeInput();
	input.payloadView.events[0] = {
		hostNodeId: 'host:button',
		eventName: 'click',
		symbolIds: ['c0:symbol:click'],
	};
	const resumeCode = emitResumeModule(input);

	expect(resumeCode).not.toContain('marklessDecodeScalarCell');
	expect(resumeCode).not.toContain('async function marklessRunScalar0');
	expect(resumeCode).toContain("import('@markless/core/web/resume')");
});

test('specialized scalar dispatcher raises cell validation before fallback-capable work', () => {
	const resumeCode = emitResumeModule(scalarResumeInput());
	const decodeIndex = resumeCode.indexOf(
		'marklessDecodeScalarCell(marklessReadScalarCell(input.root, "state:count")',
	);
	const tryIndex = resumeCode.indexOf(
		'\ttry {',
		resumeCode.indexOf('async function marklessRunScalar0'),
	);
	const hostMissIndex = resumeCode.indexOf('marklessScalarSpecializedHostMiss(input, "host")');

	expect(decodeIndex).toBeGreaterThan(-1);
	expect(tryIndex).toBeGreaterThan(-1);
	expect(hostMissIndex).toBeGreaterThan(tryIndex);
	expect(decodeIndex).toBeLessThan(tryIndex);
});

test('specialized scalar dispatcher accepts the real raw event entry shape', () => {
	const resumeCode = emitResumeModule(scalarResumeInput());

	expect(resumeCode).toContain('const eventTarget = input.event?.target;');
	expect(resumeCode).toContain('host === eventTarget');
	expect(resumeCode).toContain('host.contains(eventTarget)');
	expect(resumeCode).toContain('input.event?.type === eventName');
	expect(resumeCode).toContain('host.tagName.toLowerCase() !== tagName');
	expect(resumeCode).not.toContain('input.eventRecord?.eventName');
});

test('specialized scalar dispatcher carries sync policy state through full fallback', () => {
	const input = scalarResumeInput();
	// A second, plan-less ACTION keeps the page off scalar-only 'fail' mode so the
	// dispatcher emits the FULL fallback this test is about.
	(input.runtimeDemandMap.actions as Array<Record<string, unknown>>).push({
		hostNodeId: 'host:other',
		eventName: 'input',
		recordKind: 'event',
		recordKinds: ['event'],
		payloadRecordIds: [],
		runtimeModuleIds: [],
	});
	(input.payloadView.events[0] as { syncPolicy?: unknown }).syncPolicy = {
		when: { type: 'graph-truthy', graphNodeId: 'state:count', path: [] },
		actions: ['preventDefault'],
	};
	const resumeCode = emitResumeModule(input);

	expect(resumeCode).toContain(
		'let syncPolicyAlreadyApplied = input.syncPolicyAlreadyApplied === true;',
	);
	expect(resumeCode).toContain('if (syncPolicy && !syncPolicyAlreadyApplied) {');
	expect(resumeCode).toContain('syncPolicyAlreadyApplied = true;');
	expect(resumeCode).toContain('error.syncPolicyAlreadyApplied = syncPolicyAlreadyApplied;');
	expect(resumeCode).toContain(
		'marklessScalarSpecializedFallback(input, error.site ?? "escalate", error.syncPolicyAlreadyApplied === true)',
	);
	expect(resumeCode).toContain(
		'await marklessFullResumeHandoff({ ...input, document: input.root, syncPolicyAlreadyApplied });',
	);
	expect(resumeCode).toContain(
		'await runtime.dispatch(handoff.event, { syncPolicyAlreadyApplied: handoff.syncPolicyAlreadyApplied === true, ignoreUnmatched: true });',
	);
	expect(resumeCode).not.toContain('__marklessCsrBootstrapReplayed');
});

test('specialized scalar dispatcher keeps full fallback for non-scalar event actions', () => {
	const input = scalarResumeInput();
	(input.payloadView.events as any[]).push({
		hostNodeId: 'host:date',
		eventName: 'click',
		symbolIds: ['symbol:date'],
	});
	(input.payloadView.locators as any[]).push({
		hostNodeId: 'host:date',
		index: 7,
		tagName: 'button',
	});
	(input.runtimeDemandMap.actions as any[]).push({
		hostNodeId: 'host:date',
		eventName: 'click',
		recordKind: 'event',
		recordKinds: ['event', 'dom-update'],
		payloadRecordIds: [],
		runtimeModuleIds: [],
	});
	const resumeCode = emitResumeModule(input);

	expect(resumeCode).toContain("import('@markless/core/web/resume')");
	expect(resumeCode).toContain(
		'function marklessScalarSpecializedHostMiss(input, site) { return marklessScalarSpecializedFallback(input, site); }',
	);
	expect(resumeCode).toContain('return marklessScalarSpecializedFallback(input, "event-match");');
});

test('emitResumeModule keeps row actions behind the row lean entry', () => {
	const resumeCode = emitResumeModule({
		...baseInput,
		runtimeDemandMap: {
			recordKinds: [
				{ kind: 'keyed-repeat', replaced: true },
				{ kind: 'dom-update', replaced: true },
			],
		},
	});

	expect(resumeCode).toContain(
		"const { resumeScalarRowEventFromPayloadDocument } = await import('@markless/web/event-only-lean/row');",
	);
	expect(resumeCode).not.toContain('@markless/web/event-only-lean/scalar-core');
	expect(resumeCode).not.toContain('resumeEventOnlyFromPayloadDocument');
});

test('emitResumeModule branches only for mixed scalar and row lean routes', () => {
	const resumeCode = emitResumeModule({
		...baseInput,
		runtimeDemandMap: {
			recordKinds: [
				{ kind: 'event', replaced: true },
				{ kind: 'keyed-repeat', replaced: true },
				{ kind: 'dom-update', replaced: true },
			],
		},
	});

	expect(resumeCode).toContain('if (marklessScalarSpecializedAction(input))');
	expect(resumeCode).toContain('marklessResumeSpecializedScalarEvent(input)');
	expect(resumeCode).not.toContain('@markless/web/event-only-lean/scalar-core');
	expect(resumeCode).toContain('@markless/web/event-only-lean/row');
	expect(resumeCode).not.toContain('resumeEventOnlyFromPayloadDocument');
});

test('emitResumeModule emits the execution log loader only when logging is enabled', () => {
	const enabled = emitResumeModule({ ...scalarResumeInput(), executionLog: 'auto' });
	const disabled = emitResumeModule({ ...scalarResumeInput(), executionLog: 'never' });
	expect(enabled).toContain(
		'globalThis.__mxLoadLog ||= () => import("virtual:markless:dev-log");',
	);
	expect(enabled).toContain('logMarklessSpecializedInteraction(input, marklessLogBefore)');
	expect(enabled).not.toContain('input.eventRecord');
	expect(disabled).not.toContain('virtual:markless:dev-log');
	expect(disabled).not.toContain('logMarklessSpecializedInteraction');
});

test('emitSourceModule wraps direct render summaries only in logging builds', () => {
	const publicRenderModuleSource = 'export function Fixture() { return { root: {} }; }';
	const enabled = emitSourceModule({
		...baseInput,
		executionLog: 'auto',
		publicRenderModuleSource,
		publicRenderRootExportName: 'Fixture',
	});
	const disabled = emitSourceModule({
		...baseInput,
		executionLog: 'never',
		publicRenderModuleSource,
		publicRenderRootExportName: 'Fixture',
	});

	// The direct render body is module-local either way: the emitted module binds
	// `Fixture` once, as the published surface.
	expect(enabled).toContain('logMarklessRenderSummary()');
	expect(enabled).toContain('function marklessCsrFixture()');
	expect(enabled).toContain('function marklessRenderFixture()');
	expect(disabled).toContain('function marklessCsrFixture() { return { root: {} }; }');
	expect(disabled).not.toContain('logMarklessRenderSummary()');
	for (const emitted of [enabled, disabled]) {
		expect(emitted).not.toContain('export function Fixture()');
		expect(emitted).toContain('renderCsr: marklessCsrFixture,');
	}
});

test('emitSourceModule emits the CSR execution log loader only when logging is enabled', () => {
	expect(emitSourceModule({ ...baseInput, executionLog: 'auto' })).toContain(
		'globalThis.__mxLoadLog ||= () => import("virtual:markless:dev-log");',
	);
	expect(emitSourceModule({ ...baseInput, executionLog: 'never' })).not.toContain(
		'virtual:markless:dev-log',
	);
});

function scalarResumeInput() {
	return {
		...baseInput,
		payloadState: {
			cells: [
				{
					graphNodeId: 'state:count',
					name: 'count',
					valueKind: 'scalar',
					value: { version: 1, root: 0, records: [] },
				},
			],
			computed: [],
		},
		payloadView: {
			locators: [
				{ hostNodeId: 'host:button', index: 3, tagName: 'button' },
				{ hostNodeId: 'host:label', index: 5, tagName: 'output' },
			],
			events: [
				{ hostNodeId: 'host:button', eventName: 'click', symbolIds: ['symbol:click'] },
			],
			domUpdates: [
				{
					hostNodeId: 'host:label',
					graphNodeId: 'state:count',
					symbolId: 'symbol:text',
					target: { kind: 'text', prefix: 'Count: ' },
				},
			],
		},
		runtimeDemandMap: {
			recordKinds: [
				{ kind: 'event', replaced: true },
				{ kind: 'dom-update', replaced: true },
			],
			actions: [
				{
					hostNodeId: 'host:button',
					eventName: 'click',
					recordKind: 'event',
					recordKinds: ['event', 'dom-update'],
					payloadRecordIds: [],
					runtimeModuleIds: [],
					plan: {
						version: 1,
						kind: 'scalar',
						symbolId: 'symbol:click',
						cell: 'state:count',
						write: { kind: 'update', updateOperator: '++' },
						textUpdates: [
							{
								hostNodeId: 'host:label',
								graphNodeId: 'state:count',
								symbolId: 'symbol:text',
								prefix: 'Count: ',
							},
						],
					},
				},
			],
		},
	};
}

test('rewriteSymbolModuleExport renames async handler exports too', () => {
	expect(
		rewriteSymbolModuleExport(
			'export async function symbol_0(context) {}',
			'symbol_0',
			'symbol_0_abc',
		),
	).toBe('export async function symbol_0_abc(context) {}');
});

test('symbolVirtualModuleSourceFile reads back the source file symbolVirtualModuleId baked in', () => {
	const filename = '/workspace/app/pages/r/[repo]/index.tsrx';
	const id = symbolVirtualModuleId(filename, 'symbol:4');
	expect(symbolVirtualModuleSourceFile(id)).toBe(filename);
	// Rolldown-resolved module ids (chunk.moduleIds) carry a leading \0.
	expect(symbolVirtualModuleSourceFile(`\0${id}`)).toBe(filename);
});

test('symbolVirtualModuleSourceFile rejects non-symbol and malformed virtual ids', () => {
	expect(symbolVirtualModuleSourceFile('/workspace/app/pages/index.tsrx')).toBeNull();
	expect(
		symbolVirtualModuleSourceFile('virtual:markless:resume:%2Fapp%2Fpages%2Findex.tsrx'),
	).toBeNull();
	expect(symbolVirtualModuleSourceFile('virtual:markless:symbol:no-symbol-id')).toBeNull();
	expect(
		symbolVirtualModuleSourceFile('virtual:markless:symbol:%2Fapp.tsrx:symbol:extra'),
	).toBeNull();
});

test('records-only wake uses generic staged resume without payload documents', () => {
	const genericDemand = {
		recordKinds: [
			{ kind: 'event', replaced: false },
			{ kind: 'dom-update', replaced: false },
			{ kind: 'keyed-repeat', replaced: false },
		],
	};
	const wakeCode = emitResumeModule({
		...baseInput,
		needsFullResume: true,
		recordsOnly: true,
		runtimeDemandMap: genericDemand,
		prerenderDataId: 'virtual:markless:render-data:app',
		prerenderTriggerGroups: [
			{
				id: 'host:play:click',
				hostNodeId: 'host:play',
				eventName: 'click',
				hostIndex: 1,
				hostTagName: 'button',
				moduleId: 'virtual:markless:trigger-group:App:0',
			},
		],
	});
	expect(wakeCode).toContain("import('@markless/web/fns/prerender-trigger-resume')");
	expect(wakeCode).toContain('mergePrerenderPayloadRecords({ state: group.state, view: group.view }');
	expect(wakeCode).toContain('resumePrerenderTriggerGroup');
	expect(wakeCode).not.toContain('resumeFromPayloadDocument');
	expect(wakeCode).not.toContain('resumeScalarRowEventFromPayloadDocument');
	expect(wakeCode).not.toContain('@markless/web/event-only-lean/');
});

test('resume module installs the reconcile plane only when the payload carries computeds', () => {
	const withComputed = emitResumeModule({
		...baseInput,
		needsFullResume: true,
		payloadState: {
			cells: [{ graphNodeId: 'state:list' }],
			computed: [{ graphNodeId: 'computed:rows', dependencies: [] }],
		},
	});
	expect(withComputed).toContain(
		"import { installMarklessDerivedReconcile } from '@markless/web/fns/reconcile-plane';",
	);
	// Called at module top level, before any resume entry runs: the plane must be
	// installed before the graph is built, and a bare side-effect import would be
	// dropped because @markless/web declares `sideEffects: false`.
	expect(withComputed).toContain('installMarklessDerivedReconcile();');

	const withoutComputed = emitResumeModule({
		...baseInput,
		needsFullResume: true,
		payloadState: { cells: [{ graphNodeId: 'state:count' }], computed: [] },
	});
	expect(withoutComputed).not.toContain('reconcile-plane');
	expect(withoutComputed).not.toContain('installMarklessDerivedReconcile');

	const noState = emitResumeModule({ ...baseInput, needsFullResume: true });
	expect(noState).not.toContain('reconcile-plane');
});

test('a CSR mount installs the reconcile plane only when the payload carries computeds', () => {
	// A CSR mount has no resume module: it builds its graph from the client
	// source module, so that is where a computed-using CSR app installs.
	const withComputed = emitSourceModule({
		...baseInput,
		directCsr: true,
		hasComputedState: true,
	});
	expect(withComputed).toContain(
		"import { installMarklessDerivedReconcile } from '@markless/web/fns/reconcile-plane';",
	);
	expect(withComputed).toContain('installMarklessDerivedReconcile();');

	expect(
		emitSourceModule({ ...baseInput, directCsr: true, hasComputedState: false }),
	).not.toContain('reconcile-plane');
	// A server-rendered app installs in its resume module instead, so its client
	// source module must not drag the plane into the eager container chunk.
	expect(emitSourceModule({ ...baseInput, hasComputedState: true })).not.toContain(
		'reconcile-plane',
	);
	expect(
		emitSourceModule({ ...baseInput, environment: 'server', hasComputedState: true }),
	).not.toContain('reconcile-plane');
});

/**
 * The row mint's specifier is written HERE or nowhere: `resume-keyed-repeats` is
 * loaded by every repeat, so naming the mint there would put its chunk in every
 * app that renders a list. These assertions are the gate - the emit follows the
 * compiler's per-record demand, and a page whose repeats only reorder gets no
 * loader and therefore no chunk.
 */
function repeatDemandMap(runtimeModuleIds: ReadonlyArray<string>) {
	return {
		payloadRecords: [
			{ recordId: 'keyed-repeat:repeat:0', kind: 'keyed-repeat', runtimeModuleIds },
		],
	};
}

test('emitResumeModule writes the row-mint loader only for a repeat that can build', () => {
	expect(
		emitResumeModule({
			...baseInput,
			runtimeDemandMap: repeatDemandMap([
				'web/repeat-runtime',
				'web/resume-keyed-repeats',
				'web/fns/row-mint',
			]),
		}),
	).toContain("globalThis.__marklessRowMint = () => import('@markless/web/fns/row-mint');");
});

test('emitResumeModule leaves a reorder-only repeat with no row-mint specifier', () => {
	const reorderOnly = emitResumeModule({
		...baseInput,
		runtimeDemandMap: repeatDemandMap(['web/repeat-runtime', 'web/resume-keyed-repeats']),
	});

	expect(reorderOnly).not.toContain('__marklessRowMint');
	expect(reorderOnly).not.toContain('fns/row-mint');
});

test('emitResumeModule leaves a repeat-free page with no row-mint specifier', () => {
	expect(
		emitResumeModule({
			...baseInput,
			runtimeDemandMap: { payloadRecords: [{ recordId: 'overlay:h0', kind: 'overlay' }] },
		}),
	).not.toContain('__marklessRowMint');
});
