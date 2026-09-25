import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { expect, test } from 'vitest';
import { PROTOCOL_EVENT_ACTION_KIND, PROTOCOL_VISIBLE_EVENT_NAME } from '@markless/serializer';
import { LEAN_DISPATCH_MARKER_MODULES } from '../src/lean-dispatch-modules.ts';
import { createRuntimeDemandMap } from '../src/passes/runtime-demand-map.ts';

test('external delegation is an explicit runtime-demand no-op', () => {
	const result = createRuntimeDemandMap({
		symbolResolver: {
			passId: 'symbol-resolver',
			dynamicImportOwner: 'generated-symbol-resolver',
			syncPolicies: [],
			diagnostics: [],
			symbols: [],
		},
		symbolModules: { passId: 'symbol-modules', modules: [], diagnostics: [] },
		publicRenderModule: {
			passId: 'public-render-module',
			moduleSource: '',
			ssrModuleSource: '',
			rootExportName: null,
			ssrExportName: null,
			diagnostics: [],
		},
		protocolView: {
			version: 1,
			locators: [],
			behaviors: [],
			elementHandles: [],
			branches: [],
			keyedRepeats: [],
			events: [
				{
					hostNodeId: 'router:link',
					eventName: 'click',
					symbolIds: [],
					action: {
						kind: PROTOCOL_EVENT_ACTION_KIND.externalDelegate,
						owner: 'router',
					},
				},
			],
			domUpdates: [],
			asyncBoundaries: [],
		},
		protocolState: { version: 1, cells: [], computed: [] },
	} as never, 'prerender');

	expect(result.recordKinds).toContainEqual({
		kind: PROTOCOL_EVENT_ACTION_KIND.externalDelegate,
		replaced: false,
	}, 'prerender');
	expect(result.payloadRecords).toEqual([
		expect.objectContaining({
			kind: PROTOCOL_EVENT_ACTION_KIND.externalDelegate,
			runtimeModuleIds: [],
		}),
	]);
	expect(result.actions).toEqual([
		expect.objectContaining({
			recordKind: PROTOCOL_EVENT_ACTION_KIND.externalDelegate,
			recordKinds: [PROTOCOL_EVENT_ACTION_KIND.externalDelegate],
			payloadRecordIds: ['external-delegate:router:link:click'],
			runtimeModuleIds: [],
		}),
	]);
});

test('scalar routing is explicit for plain SSR and prerender classes', () => {
	const input = {
		symbolResolver: {
			passId: 'symbol-resolver',
			dynamicImportOwner: 'generated-symbol-resolver',
			syncPolicies: [],
			diagnostics: [],
			symbols: [
				{
					id: 'symbol:click',
					kind: 'event-handler',
					source: '() => count++',
					parameters: [],
					reads: [],
					writes: [
						{
							source: 'count',
							graphNodeId: 'state:count',
							path: [],
							operation: 'update',
							updateOperator: '++',
							prefix: false,
						},
					],
				},
				{
					id: 'symbol:text',
					kind: 'dom-update',
					source: 'count',
					graphNodeId: 'state:count',
					path: [],
					target: { kind: 'text' },
				},
			],
		} as never,
		symbolModules: { passId: 'symbol-modules', modules: [], diagnostics: [] },
		publicRenderModule: {
			passId: 'public-render-module',
			moduleSource: '',
			ssrModuleSource: '',
			rootExportName: null,
			ssrExportName: null,
			diagnostics: [],
		},
		protocolView: {
			version: 1,
			locators: [],
			behaviors: [],
			elementHandles: [],
			branches: [],
			keyedRepeats: [],
			events: [
				{ hostNodeId: 'host:button', eventName: 'click', symbolIds: ['symbol:click'] },
			],
			domUpdates: [
				{
					hostNodeId: 'host:output',
					graphNodeId: 'state:count',
					path: [],
					symbolId: 'symbol:text',
					target: { kind: 'text' },
				},
			],
			asyncBoundaries: [],
		} as never,
		protocolState: { version: 1, cells: [], computed: [] },
	} as const;
	const prerender = createRuntimeDemandMap(input as never, 'prerender');
	const plainSsr = createRuntimeDemandMap(input as never, 'plain-ssr');

	expect(prerender.recordKinds.every((record) => record.replaced === false)).toBe(true);
	expect(prerender.actions[0]?.plan).toBeUndefined();
	expect(prerender.payloadRecords[0]?.runtimeModuleIds).toEqual(
		expect.arrayContaining(['web/resume-runtime', 'web/payload-resume']),
	);
	for (const moduleId of [
		'web/fns/scalar-specialized',
		'web/fns/write-scalar',
		'web/fns/update-text',
		'web/event-only-lean/row',
		'web/event-only-lean/lean-shared',
	]) {
		expect(prerender.unknownRecordModuleIds).not.toContain(moduleId);
	}

	expect(plainSsr.recordKinds).toContainEqual({ kind: 'event', replaced: true });
	expect(plainSsr.recordKinds).toContainEqual({ kind: 'dom-update', replaced: true });
	expect(plainSsr.actions[0]?.plan).toMatchObject({
		version: 1,
		kind: 'scalar',
		symbolId: 'symbol:click',
		cell: 'state:count',
	});
	expect(plainSsr.payloadRecords[0]?.runtimeModuleIds).toEqual(
		expect.arrayContaining([
			'web/fns/dom-order',
			'web/fns/scalar-specialized',
			'web/fns/write-scalar',
			'web/fns/update-text',
		]),
	);
});

test('callback capture writes close over DOM and async subscribers and disable scalar plans', () => {
	const result = createRuntimeDemandMap({
		symbolResolver: {
			passId: 'symbol-resolver',
			dynamicImportOwner: 'generated-symbol-resolver',
			syncPolicies: [],
			diagnostics: [],
			symbols: [
				{
					id: 'symbol:child',
					kind: 'event-handler',
					source: '() => onSave()',
					parameters: [],
					reads: [],
					writes: [],
				},
				{
					id: 'symbol:parent',
					kind: 'callback-prop',
					source: '() => count++',
					parameters: [],
					reads: [],
					writes: [
						{
							source: 'count',
							graphNodeId: 'state:count',
							path: [],
							operation: 'update',
							updateOperator: '++',
							prefix: false,
						},
					],
				},
			],
		} as never,
		captureAnalysis: {
			passId: 'capture-analysis',
			diagnostics: [],
			boundResolverRows: [],
			extractedSymbols: [
				{
					symbolId: 'symbol:child',
					kind: 'event-handler',
					source: '() => onSave()',
					captureSlots: [
						{
							id: 'slot:onSave',
							bindingId: 'binding:onSave',
							source: 'onSave',
							owner: {},
							path: [],
							routes: [
								{
									kind: 'callback-route',
									componentEdgeId: 'edge:0',
									callbackSymbolId: 'symbol:parent',
								},
							],
						},
					],
				},
			],
		},
		symbolModules: { passId: 'symbol-modules', modules: [], diagnostics: [] },
		publicRenderModule: {
			passId: 'public-render-module',
			moduleSource: '',
			ssrModuleSource: '',
			rootExportName: null,
			ssrExportName: null,
			diagnostics: [],
		},
		protocolView: {
			version: 1,
			locators: [],
			behaviors: [],
			elementHandles: [],
			branches: [],
			keyedRepeats: [],
			events: [
				{ hostNodeId: 'host:button', eventName: 'click', symbolIds: ['symbol:child'] },
			],
			domUpdates: [
				{
					hostNodeId: 'host:output',
					graphNodeId: 'state:count',
					path: [],
					symbolId: 'symbol:text',
					target: { kind: 'text' },
				},
			],
			asyncBoundaries: [
				{
					id: 'async:0',
					kind: 'async-boundary',
					anchorOrder: 0,
					startAnchor: { strategy: 'dom-order-comment', index: 0 },
					endAnchor: { strategy: 'dom-order-comment', index: 1 },
					asyncReads: [
						{
							source: 'count',
							graphNodeId: 'state:count',
							path: [],
							runnerSymbolId: 'symbol:runner',
						},
					],
					armRecords: [],
				},
			],
		} as never,
		protocolState: { version: 1, cells: [], computed: [] },
	}, 'prerender');

	const action = result.actions[0];
	expect(action?.recordKinds).toEqual(
		expect.arrayContaining(['event', 'dom-update', 'async-boundary']),
	);
	expect(action?.plan).toBeUndefined();
	expect(result.unknownRecordModuleIds).toContain('core/web/resume-storage-free');
	expect(result.unknownRecordModuleIds).toContain('web/payload-full-storage-free');
	expect(result.unknownRecordModuleIds).not.toContain('core/web/resume');
	expect(result.unknownRecordModuleIds).not.toContain('web/payload-full');
});

/**
 * The building half of a keyed repeat is folded into the record that can reach
 * it, because the record is where the fact lives: `rowTemplate` is markup for a
 * key the server never sent, `emptyArm` is markup for "nothing matches", and a
 * record carrying neither can never mint or raise anything. The bundler reads
 * this to decide whether the app writes the mint's specifier at all, so a repeat
 * that only reorders must leave the module id off - otherwise every app with a
 * list ships the chunk.
 */
function repeatDemandMap(
	repeat: Record<string, unknown>,
): ReturnType<typeof createRuntimeDemandMap> {
	return createRuntimeDemandMap(
		{
			symbolResolver: {
				passId: 'symbol-resolver',
				dynamicImportOwner: 'generated-symbol-resolver',
				syncPolicies: [],
				diagnostics: [],
				symbols: [],
			},
			symbolModules: { passId: 'symbol-modules', modules: [], diagnostics: [] },
			publicRenderModule: {
				passId: 'public-render-module',
				moduleSource: '',
				ssrModuleSource: '',
				rootExportName: null,
				ssrExportName: null,
				diagnostics: [],
			},
			protocolView: {
				version: 1,
				locators: [],
				behaviors: [],
				elementHandles: [],
				branches: [],
				events: [],
				domUpdates: [],
				asyncBoundaries: [],
				keyedRepeats: [
					{
						id: 'repeat:0',
						parentHostNodeId: 'host:list',
						collectionGraphNodeId: 'state:rows',
						collectionPath: [],
						keyPath: ['id'],
						itemName: 'row',
						rowEvents: [],
						...repeat,
					},
				],
			},
			protocolState: { version: 1, cells: [], computed: [] },
		} as never,
		'plain-ssr',
	);
}

function repeatRecordModules(
	map: ReturnType<typeof createRuntimeDemandMap>,
): ReadonlyArray<string> {
	return (
		map.payloadRecords.find((record) => record.kind === 'keyed-repeat')?.runtimeModuleIds ?? []
	);
}

test('a repeat that only reorders served rows demands no row mint', () => {
	const modules = repeatRecordModules(repeatDemandMap({}));
	expect(modules).toContain('web/resume-keyed-repeats');
	expect(modules).not.toContain('web/fns/row-mint');
});

test('a repeat carrying a component identity demands the component mint', () => {
	const modules = repeatRecordModules(
		repeatDemandMap({ rowComponent: { componentEdgeId: 'edge:0', componentName: 'App' } }),
	);
	expect(modules).toContain('web/fns/row-component-mint');
	// The markup mint and the component mint are separate halves: a component row
	// carries no markup, so it must not drag the markup builder in.
	expect(modules).not.toContain('web/fns/row-mint');
});

test('a repeat that only reorders served rows demands no component mint', () => {
	expect(repeatRecordModules(repeatDemandMap({}))).not.toContain('web/fns/row-component-mint');
});

test('a repeat carrying row markup demands the row mint', () => {
	expect(
		repeatRecordModules(
			repeatDemandMap({ rowTemplate: { html: '<li></li>', textSlots: [] } }),
		),
	).toContain('web/fns/row-mint');
});

test('a repeat carrying an @empty arm demands the row mint', () => {
	expect(repeatRecordModules(repeatDemandMap({ emptyArm: { html: '<li></li>' } }))).toContain(
		'web/fns/row-mint',
	);
});

test('the row mint reaches a row action through its own repeat record', () => {
	const map = repeatDemandMap({
		rowTemplate: { html: '<li></li>', textSlots: [] },
		rowEvents: [{ hostPath: [0], eventName: 'click', symbolIds: [] }],
	});
	const action = map.actions.find((candidate) => candidate.recordKind === 'keyed-repeat-row');
	expect(action?.payloadRecordIds).toContain('keyed-repeat:repeat:0');
	expect(action?.runtimeModuleIds).toContain('web/fns/row-mint');
});

test('a visible event demands the behavior runtime the resume runtime installs at startup', async () => {
	const { compileTsrxModule } = await import('../src/index.ts');
	const result = await compileTsrxModule({
		filename: '/workspace/src/Reveal.tsrx',
		symbols: [],
		source: `
		import { state } from '@markless/core';
		export default function Reveal() @{
			let seen = state(0);
			<aside><p onVisible={() => seen++}>{seen}</p><em onClick={() => seen++}>x</em></aside>
		}
	`,
	});
	for (const map of Object.values(result.runtimeDemandMaps)) {
		const records = map.payloadRecords;
		expect(
			records.find((record) => record.eventName === PROTOCOL_VISIBLE_EVENT_NAME)
				?.runtimeModuleIds,
		).toContain('web/resume-behaviors');
		expect(
			records.find((record) => record.eventName === 'click')?.runtimeModuleIds,
		).not.toContain('web/resume-behaviors');
	}
});

async function panelDemandMap(source: string) {
	const { compileTsrxModule } = await import('../src/index.ts');
	const result = await compileTsrxModule({
		filename: '/workspace/src/Panel.tsrx',
		symbols: [],
		source,
	});
	const map = result.runtimeDemandMaps.prerender;
	const kindOf = new Map(map.symbols.map((symbol) => [symbol.symbolId, symbol.kind]));
	const action = (hostNodeId: string, eventName: string) =>
		map.actions.find(
			(candidate) => candidate.hostNodeId === hostNodeId && candidate.eventName === eventName,
		)!;
	const kinds = (symbolIds: ReadonlyArray<string> | undefined) =>
		(symbolIds ?? []).map((symbolId) => kindOf.get(symbolId)).sort();
	return { map, action, kinds };
}

const PANEL = `
	import { computed, state } from '@markless/core';
	export default function Panel() @{
		let query = state('');
		let count = state(0);
		let items = state(['a']);
		const empty = computed(() => query === '');
		<section>
			<input value={query} onInput={(event) => (query = (event.target as HTMLInputElement).value)} />
			<button onClick={() => count++}>{count}</button>
			<button onClick={() => (items = [...items, 'b'])}>add</button>
			<ul>
				@for (const item of items; key item) {
					<li><button onClick={() => (count = 0)}>{item}</button></li>
				}
			</ul>
			@if (empty) {
				<p><button onClick={() => (query = 'x')}>fill</button></p>
			}
		</section>
	}
`;

test('a control that flips a branch through a computed reaches the flip, its derive and the arm handlers', async () => {
	const { action, kinds } = await panelDemandMap(PANEL);
	const input = action('h1', 'input');
	expect(input.recordKinds).toContain('branch');
	expect(kinds(input.firstUse?.symbolIds)).toEqual([
		'branch-update',
		'dom-update',
		'event-handler',
		'event-handler',
		'sync-computed-derive',
	]);
	expect(input.firstUse?.runtimeModuleIds).toContain('web/resume-branches');
});

test('a control whose writes reach no branch leaves the branch symbols out', async () => {
	const { action, kinds } = await panelDemandMap(PANEL);
	const click = action('h2', 'click');
	expect(click.recordKinds).toContain('branch');
	expect(kinds(click.firstUse?.symbolIds)).toEqual(['dom-update', 'event-handler']);
});

test('a control that grows a keyed repeat reaches the row handlers and the row mint', async () => {
	const { map, action, kinds } = await panelDemandMap(PANEL);
	const add = action('h3', 'click');
	expect(kinds(add.firstUse?.symbolIds)).toEqual(['event-handler', 'event-handler']);
	expect(add.firstUse?.runtimeModuleIds).toContain('web/fns/row-mint');
	const row = map.actions.find((candidate) => candidate.recordKind === 'keyed-repeat-row')!;
	expect(kinds(row.firstUse?.symbolIds)).toEqual(['dom-update', 'event-handler']);
	expect(row.firstUse?.runtimeModuleIds).toContain('web/resume-keyed-repeats');
});

test('a write after an await reaches the arm it flips, so the arm preloads with its control', async () => {
	const { map, kinds } = await panelDemandMap(`
		import { computed, state } from '@markless/core';
		export default function Save() @{
			let failure = state('');
			let note = state('');
			const failed = computed(() => failure !== '');
			const noted = computed(() => note !== '');
			<form onSubmit={async (event) => {
				event.preventDefault();
				const response = await fetch('/save', { method: 'POST' });
				failure = response.ok ? '' : 'rejected';
			}}>
				<button type="submit">Save</button>
				@if (failed) {
					<p role="alert">{failure}</p>
				}
				@if (noted) {
					<p>{note}</p>
				}
			</form>
		}
	`);
	const submit = map.actions.find((candidate) => candidate.eventName === 'submit')!;
	const branchSymbols = map.payloadRecords
		.filter((record) => record.kind === 'branch')
		.map((record) => record.symbolIds ?? []);
	expect(branchSymbols).toHaveLength(2);
	const [flipped, untouched] = branchSymbols;
	expect(submit.firstUse?.symbolIds).toEqual(expect.arrayContaining([...flipped!]));
	expect(submit.firstUse?.symbolIds).not.toEqual(expect.arrayContaining([...untouched!]));
	expect(kinds(submit.firstUse?.symbolIds)).toContain('branch-update');
	expect(submit.firstUse?.runtimeModuleIds).toContain('web/resume-branches');
});

test('an arm no control can flip stays out of every first use', async () => {
	const { map } = await panelDemandMap(`
		import { state } from '@markless/core';
		export default function Fixed() @{
			let count = state(0);
			let shown = state(true);
			<div>
				<button onClick={() => count++}>{count}</button>
				@if (shown) {
					<p>always</p>
				}
			</div>
		}
	`);
	const branchSymbols = map.payloadRecords
		.filter((record) => record.kind === 'branch')
		.flatMap((record) => record.symbolIds ?? []);
	expect(branchSymbols.length).toBeGreaterThan(0);
	for (const action of map.actions)
		for (const symbolId of branchSymbols) expect(action.firstUse?.symbolIds).not.toContain(symbolId);
});

test('a control that picks a @switch case reaches the switch flip', async () => {
	const { map, kinds } = await panelDemandMap(`
		import { state } from '@markless/core';
		export default function Modes() @{
			let mode = state('list');
			<div>
				<button onClick={() => (mode = mode === 'list' ? 'grid' : 'list')}>Mode</button>
				@switch (mode) {
					@case 'grid': {
						<p>grid</p>
					}
					@default: {
						<p>list</p>
					}
				}
			</div>
		}
	`);
	const click = map.actions.find((candidate) => candidate.eventName === 'click')!;
	expect(kinds(click.firstUse?.symbolIds)).toContain('branch-update');
	expect(click.firstUse?.runtimeModuleIds).toContain('web/resume-branches');
});

test('an escalating branch the control reaches leaves its first use unbounded', () => {
	const view = {
		version: 1,
		locators: [],
		events: [{ hostNodeId: 'h1', eventName: 'click', symbolIds: ['symbol:0'] }],
		domUpdates: [],
		behaviors: [],
		elementHandles: [],
		keyedRepeats: [],
		asyncBoundaries: [],
		branches: [
			{
				id: 'branch-site:0',
				startAnchor: { strategy: 'dom-order-comment', index: 0 },
				endAnchor: { strategy: 'dom-order-comment', index: 1 },
				symbolId: 'symbol:1',
				testReads: [{ source: 'open', graphNodeId: 'state:open', path: [] }],
				escalates: true,
			},
		],
	};
	const input = (writes: string) =>
		({
			symbolResolver: {
				passId: 'symbol-resolver',
				dynamicImportOwner: 'generated-symbol-resolver',
				syncPolicies: [],
				diagnostics: [],
				symbols: [
					{
						id: 'symbol:0',
						kind: 'event-handler',
						source: '() => (open = true)',
						parameters: [],
						reads: [],
						writes: [
							{
								source: writes,
								graphNodeId: `state:${writes}`,
								path: [],
								operation: 'assign',
							},
						],
					},
					{ id: 'symbol:1', kind: 'branch-update' },
				],
			},
			symbolModules: { passId: 'symbol-modules', modules: [], diagnostics: [] },
			publicRenderModule: {
				passId: 'public-render-module',
				moduleSource: '',
				ssrModuleSource: '',
				rootExportName: null,
				ssrExportName: null,
				diagnostics: [],
			},
			protocolView: view,
			protocolState: { version: 1, cells: [], computed: [] },
		}) as never;
	expect(createRuntimeDemandMap(input('open'), 'prerender').actions[0]?.firstUse).toBe('unknown');
	expect(createRuntimeDemandMap(input('other'), 'prerender').actions[0]?.firstUse).toEqual({
		symbolIds: ['symbol:0'],
		runtimeModuleIds: expect.arrayContaining(['web/resume-branches']),
	});
});

test('a handler write to a page-space cell is named for the page join; a callback slot write is unknown', () => {
	const input = (graphNodeId: string) =>
		({
			symbolResolver: {
				passId: 'symbol-resolver',
				dynamicImportOwner: 'generated-symbol-resolver',
				syncPolicies: [],
				diagnostics: [],
				symbols: [
					{
						id: 'symbol:0',
						kind: 'event-handler',
						source: '() => (cell = 1)',
						parameters: [],
						reads: [],
						writes: [{ source: 'cell', graphNodeId, path: [], operation: 'assign' }],
					},
				],
			},
			symbolModules: { passId: 'symbol-modules', modules: [], diagnostics: [] },
			publicRenderModule: {
				passId: 'public-render-module',
				moduleSource: '',
				ssrModuleSource: '',
				rootExportName: null,
				ssrExportName: null,
				diagnostics: [],
			},
			protocolView: {
				version: 1,
				locators: [],
				events: [{ hostNodeId: 'h1', eventName: 'click', symbolIds: ['symbol:0'] }],
				domUpdates: [],
				behaviors: [],
				elementHandles: [],
				keyedRepeats: [],
				asyncBoundaries: [],
			},
			protocolState: { version: 1, cells: [], computed: [] },
		}) as never;
	const cell = 'shared:widgets/dial.tsrx#dialState/state:box';
	const map = createRuntimeDemandMap(input(cell), 'prerender');
	expect(map.actions[0]?.firstUse).toMatchObject({ pageSpaceWrites: [cell] });
	expect(map.firstUsePage?.resume).toEqual({ symbolIds: [], runtimeModuleIds: expect.any(Array) });
	const slot = 'shared:widgets/dial.tsrx#dialState/slot:onTurn';
	expect(createRuntimeDemandMap(input(slot), 'prerender').actions[0]?.firstUse).toBe('unknown');
});

// Tools read these ids to tell lean dispatch from full resume; each must still name a web runtime module.
test('lean dispatch marker modules name existing web runtime sources', () => {
	for (const id of Object.values(LEAN_DISPATCH_MARKER_MODULES).flat()) {
		expect(id).toMatch(/^web\//);
		expect(
			existsSync(
				fileURLToPath(
					new URL(`../../web/src/${id.slice('web/'.length)}.ts`, import.meta.url),
				),
			),
		).toBe(true);
	}
});

// A control written inside an async arm is absent from the flat event stream, yet the page can click it.
test('an event inside an async boundary arm is a planner action owned by its boundary record', async () => {
	for (const [filename, source, eventName] of [
		[
			'/workspace/src/Harbor.tsrx',
			`import { computed, state } from '@markless/core';
			export default function Harbor() @{
				let logged = state(0);
				const forecast = computed(async () => ({ vessel: 'Petrel' }));
				<main>
					<output>{logged}</output>
					@try {
						<article><h2>{forecast.vessel}</h2><button onClick={() => logged++}>Log</button></article>
					} @pending {
						<p>waiting</p>
					}
				</main>
			}`,
			'click',
		],
		[
			'/workspace/src/Orders.tsrx',
			`import { computed, state } from '@markless/core';
			export default function Orders() @{
				let picked = state('');
				const order = computed(async () => ({ id: 'A-7' }));
				<section>
					<span>{picked}</span>
					@try {
						<form><input onInput={(event) => (picked = order.id)} /></form>
					} @pending {
						<em>loading</em>
					} @catch {
						<em>failed</em>
					}
				</section>
			}`,
			'input',
		],
	] as const) {
		const { compileTsrxModule } = await import('../src/index.ts');
		const result = await compileTsrxModule({ filename, symbols: [], source });
		for (const map of Object.values(result.runtimeDemandMaps)) {
			expect(map.actions.some((action) => action.eventName === eventName)).toBe(false);
			const boundary = map.payloadRecords.find((record) => record.kind === 'async-boundary')!;
			const arm = map.armActions?.find((action) => action.eventName === eventName);
			expect(arm?.payloadRecordIds).toEqual([boundary.recordId]);
			expect(arm?.recordKinds).toContain('async-boundary');
			expect(arm?.runtimeModuleIds).toContain('web/resume-runtime');
			expect(arm?.firstUse).not.toBe('unknown');
			const handlers = map.symbols
				.filter((symbol) => symbol.kind === 'event-handler')
				.map((symbol) => symbol.symbolId);
			expect(arm?.firstUse === 'unknown' ? [] : arm?.firstUse?.symbolIds).toEqual(
				expect.arrayContaining(handlers),
			);
		}
	}
});
