import { expect, test } from 'vitest';
import { createProtocolStatePayload, renderPayloadScripts } from '@markless/serializer';
import { classifyResumeRecordDelta } from '@markless/serializer/resume-record-delta';
import { createPrerenderInlineResumerSource } from '../src/inline/resumer.ts';
import {
	derivePrerenderResumeRecords,
	evaluateBuiltPageClosure,
	evaluatePrerenderClosure,
	renderPrerenderDataSurface,
	renderPrerenderBoundary,
} from '../src/prerender/evaluator.ts';
import { attachPrerenderStagedGraphRegistration } from '../src/prerender/staged-graph.ts';
import {
	assemblePrerenderContainer,
	assemblePrerenderPageParts,
	assembleSsrContainer,
	type SsrRenderArtifact,
} from '../src/render-to-string.ts';

test('evaluates a linked page closure without reparsing markup or authored source', async () => {
	const child = {
		renderData: {
			root: { componentName: 'Child', templateId: 'template:Child' },
			chunks: [
				{
					id: 'template:Child',
					kind: 'template' as const,
					componentName: 'Child',
					statics: ['<strong><!--markless-slot:0-->', '</strong>'],
					hosts: [
						{
							hostNodeId: 'h0',
							tagName: 'strong',
							coordinate: { kind: 'child-index' as const, path: [0] },
						},
					],
					slots: [
						{
							kind: 'text' as const,
							residue: {
								kind: 'graph-read' as const,
								graphNodeId: 'prop:props',
								path: ['label'],
							},
							coordinate: { kind: 'comment-anchor' as const, path: [0, 0] },
							staticIndex: 0,
						},
					],
				},
			],
			repeats: [],
			boundaries: [],
			initialValues: [],
		},
	};
	const constant = { label: 'Ready' };
	const output = await evaluatePrerenderClosure({
		renderData: {
			root: { componentName: 'Page', templateId: 'template:Page' },
			chunks: [
				{
					id: 'template:Page',
					kind: 'template',
					componentName: 'Page',
					statics: ['<main><!--markless-slot:0-->', '<!--markless-slot:1-->', '</main>'],
					hosts: [
						{
							hostNodeId: 'h0',
							tagName: 'main',
							coordinate: { kind: 'child-index', path: [0] },
						},
					],
					slots: [
						{
							kind: 'child-component',
							componentEdgeId: 'component-edge:0',
							childComponentName: 'Child',
							childTemplateId: 'template:Child',
							coordinate: { kind: 'comment-anchor', path: [0, 0] },
							staticIndex: 0,
						},
						{
							kind: 'branch',
							branchSiteId: 'branch:0',
							armTemplateIds: ['branch:0:on', 'branch:0:off'],
							coordinate: { kind: 'comment-anchor', path: [0, 1] },
							staticIndex: 1,
						},
					],
				},
				{
					id: 'branch:0:on',
					kind: 'branch-arm',
					componentName: 'Page',
					statics: ['<i><!--markless-slot:0-->', '</i>'],
					hosts: [],
					slots: [
						{
							kind: 'text',
							residue: {
								kind: 'graph-read',
								graphNodeId: 'computed:upper',
								path: [],
							},
							coordinate: { kind: 'comment-anchor', path: [0, 0] },
							staticIndex: 0,
						},
					],
				},
				{
					id: 'branch:0:off',
					kind: 'branch-arm',
					componentName: 'Page',
					statics: ['<i>Off</i>'],
					hosts: [],
					slots: [],
				},
			],
			repeats: [],
			boundaries: [],
			initialValues: [
				{ graphNodeId: 'state:item', value: { kind: 'constant', value: constant } },
			],
		},
		computed: [
			{
				graphNodeId: 'computed:upper',
				evaluate: ({ read }) => {
					constant.label = 'Mutated outside the closure';
					return String((read('state:item') as { label: string }).label).toUpperCase();
				},
			},
		],
		selectBranchArm: (_slot, _context, { read }) =>
			read('computed:upper') === 'READY' ? 0 : 1,
		children: {
			'component-edge:0': {
				closure: child,
				props: ({ read }) => ({ label: (read('state:item') as { label: string }).label }),
			},
		},
	});

	expect(output.html).toBe(
		'<main><strong>Ready</strong><!--markless:branch:branch:0--><i>READY</i><!--/markless:branch:branch:0--></main>',
	);
});

test('empty request delta uses the hashed wake variant and zero payload-script bytes', async () => {
	const artifact: SsrRenderArtifact & { readonly prerenderWakeModuleUrl: string } = {
		resumeModuleUrl: '/build/resume.js',
		prerenderWakeModuleUrl: '/build/prerender-wake-A1b2.js',
		renderSsr: () => ({
			html: '<button>Ready</button>',
			state: {
				version: 1,
				cells: [
					{
						graphNodeId: 'state:item',
						name: 'item',
						valueKind: 'object',
						value: {
							version: 1,
							root: { $ref: 0 },
							records: [{ id: 0, type: 'object', fields: [['label', 'Ready']] }],
						},
					},
				],
				computed: [],
				sharedDefinitions: [],
			},
			view: {
				version: 1,
				locators: [
					{ hostNodeId: 'h0', strategy: 'dom-order', index: 0, tagName: 'button' },
				],
				events: [{ hostNodeId: 'h0', eventName: 'click', symbolIds: ['symbol:0'] }],
				domUpdates: [],
				behaviors: [],
				elementHandles: [],
				keyedRepeats: [],
				branches: [],
				asyncBoundaries: [],
			},
		}),
	};
	const output = await artifact.renderSsr();
	const derived = await derivePrerenderResumeRecords(artifact);
	const ssr = await assembleSsrContainer(artifact, output, {});

	expect(ssr.match(/<script type="markless\/(?:state|view)">/g) ?? []).toHaveLength(0);
	expect(ssr).toContain('data-async-resumer');
	expect(ssr).toContain('data-markless-resume-module="/build/prerender-wake-A1b2.js"');
	expect(derived).toEqual(await derivePrerenderResumeRecords(artifact));
});

test('the prerender host can supply the built wake URL after client chunking', async () => {
	const artifact: SsrRenderArtifact = {
		resumeModuleUrl: '/build/resume.js',
		renderSsr: () => ({
			html: '<button>Ready</button>',
			state: { version: 1, cells: [], computed: [] },
			view: {
				version: 1,
				locators: [
					{ hostNodeId: 'h0', strategy: 'dom-order', index: 0, tagName: 'button' },
				],
				events: [{ hostNodeId: 'h0', eventName: 'click', symbolIds: ['symbol:0'] }],
				domUpdates: [],
				behaviors: [],
				elementHandles: [],
				asyncBoundaries: [],
			},
		}),
	};
	const output = await artifact.renderSsr();
	const html = await assemblePrerenderContainer(artifact, output, {
		prerenderWakeModuleUrl: '/build/prerender-wake-late.js',
	});

	expect(html).toContain('data-markless-resume-module="/build/prerender-wake-late.js"');
});

test('wake-channel divergent request carries only its keyed delta records', async () => {
	const baselineState = createProtocolStatePayload({
		cells: [{ graphNodeId: 'state:count', name: 'count', valueKind: 'scalar', value: 0 }],
	});
	const requestState = createProtocolStatePayload({
		cells: [{ graphNodeId: 'state:count', name: 'count', valueKind: 'scalar', value: 1 }],
	});
	const view = {
		version: 1 as const,
		locators: [
			{ hostNodeId: 'h0', strategy: 'dom-order' as const, index: 0, tagName: 'button' },
		],
		events: [{ hostNodeId: 'h0', eventName: 'click', symbolIds: ['symbol:0'] }],
		domUpdates: [],
		behaviors: [],
		elementHandles: [],
		asyncBoundaries: [],
	};
	const baseline = { html: '<button>Build</button>', state: baselineState, view };
	const request = { html: '<button>Request</button>', state: requestState, view };
	const artifact: SsrRenderArtifact & { readonly prerenderWakeModuleUrl: string } = {
		resumeModuleUrl: '/build/resume.js',
		prerenderWakeModuleUrl: '/build/prerender-wake-A1b2.js',
		renderSsr: () => baseline,
	};
	const preparedRequestView = {
		...view,
		locators: view.locators.map((locator) => ({ ...locator, index: locator.index + 1 })),
	};
	const baselineRecords = { state: baselineState, view: preparedRequestView };
	const requestRecords = { state: requestState, view: preparedRequestView };
	const classification = classifyResumeRecordDelta(baselineRecords, requestRecords);
	expect(classification.kind).toBe('divergent');
	if (classification.kind !== 'divergent') return;
	const payload = renderPayloadScripts(classification.delta);

	const html = await assembleSsrContainer(artifact, request, { resumerSource: 'wake();' });

	expect(html).toBe(
		'<div data-async-container><button>Request</button>' +
			payload.stateScript +
			payload.viewScript +
			'<script data-async-resumer data-markless-resume-module="/build/prerender-wake-A1b2.js">' +
			createPrerenderInlineResumerSource(['click'], '/build/prerender-wake-A1b2.js', {
				executionLog: 'auto',
			}) +
			'</script></div>',
	);
});

test('gated-off divergent request preserves the existing full-payload container bytes', async () => {
	const baselineState = createProtocolStatePayload({
		cells: [{ graphNodeId: 'state:count', name: 'count', valueKind: 'scalar', value: 0 }],
	});
	const requestState = createProtocolStatePayload({
		cells: [{ graphNodeId: 'state:count', name: 'count', valueKind: 'scalar', value: 1 }],
	});
	const view = {
		version: 1 as const,
		locators: [
			{ hostNodeId: 'h0', strategy: 'dom-order' as const, index: 0, tagName: 'button' },
		],
		events: [{ hostNodeId: 'h0', eventName: 'click', symbolIds: ['symbol:0'] }],
		domUpdates: [],
		behaviors: [],
		elementHandles: [],
		asyncBoundaries: [],
	};
	const artifact: SsrRenderArtifact = {
		resumeModuleUrl: '/build/resume.js',
		renderSsr: () => ({ html: '<button>Build</button>', state: baselineState, view }),
	};
	const request = { html: '<button>Request</button>', state: requestState, view };
	const preparedRequestView = {
		...view,
		locators: view.locators.map((locator) => ({ ...locator, index: locator.index + 1 })),
	};
	const payload = renderPayloadScripts({ state: requestState, view: preparedRequestView });

	const html = await assembleSsrContainer(artifact, request, { resumerSource: 'wake();' });

	expect(html).toBe(
		'<div data-async-container><button>Request</button>' +
			payload.stateScript +
			payload.viewScript +
			'<script data-async-resumer data-markless-resume-module="/build/resume.js">wake();</script></div>',
	);
});

test('record-only linked-data wake does not require authored markup residue', async () => {
	const state = {
		version: 1 as const,
		cells: [
			{
				graphNodeId: 'state:open',
				name: 'open',
				valueKind: 'scalar' as const,
				directValue: false,
			},
		],
		computed: [],
		sharedDefinitions: [],
	};
	const view = {
		version: 1 as const,
		locators: [{ hostNodeId: 'h0', strategy: 'dom-order' as const, index: 0, tagName: 'div' }],
		events: [{ hostNodeId: 'h0', eventName: 'click', symbolIds: ['symbol:0'] }],
		domUpdates: [],
		behaviors: [],
		elementHandles: [],
		keyedRepeats: [],
		branches: [],
		asyncBoundaries: [],
	};
	const renderData = {
		root: { componentName: 'App', templateId: 'template:App' },
		chunks: [
			{
				id: 'template:App',
				kind: 'template' as const,
				componentName: 'App',
				statics: ['<div class="', '"></div>'],
				hosts: [
					{
						hostNodeId: 'h0',
						tagName: 'div',
						coordinate: { kind: 'child-index' as const, path: [0] },
					},
				],
				slots: [
					{
						kind: 'attribute' as const,
						name: 'class',
						coordinate: { kind: 'child-index' as const, path: [0] },
						residue: {
							kind: 'authored-expression' as const,
							source: `open ? 'panel open' : 'panel'`,
						},
						staticIndex: 0,
					},
				],
			},
		],
		initialValues: [{ graphNodeId: 'state:open', value: { kind: 'constant', value: false } }],
		branches: [],
		boundaries: [],
		repeats: [],
	};
	const surface = {
		rootComponentName: 'App',
		renderData,
		components: {
			App: {
				name: 'App',
				state,
				view,
				rootChunkId: 'template:App',
				stateGraphNodeIds: ['state:open'],
				initialValues: renderData.initialValues,
				branches: [],
				boundaries: [],
				edges: [],
				propCellId: null,
			},
		},
		imports: {},
	};

	await expect(
		derivePrerenderResumeRecords(surface as never, async () => undefined),
	).resolves.toMatchObject({
		state: { cells: [expect.objectContaining({ graphNodeId: 'state:open' })] },
		view: { events: [expect.objectContaining({ symbolIds: ['symbol:0'] })] },
	});
});

test('assembles a prerendered container with delegated triggers and zero payload scripts', async () => {
	const artifact: SsrRenderArtifact = {
		resumeModuleUrl: '/build/resume.js',
		modulePreloads: ['/build/resume.js'],
		renderSsr: () => ({ html: '<button>Ready</button>' }),
	};
	const output = {
		html: '<button>Ready</button>',
		state: { version: 1, cells: [], computed: [], sharedDefinitions: [] },
		view: {
			version: 1,
			locators: [
				{ hostNodeId: 'h0', strategy: 'dom-order' as const, index: 0, tagName: 'button' },
			],
			events: [{ hostNodeId: 'h0', eventName: 'click', symbolIds: ['symbol:0'] }],
			domUpdates: [],
			behaviors: [],
			elementHandles: [],
			keyedRepeats: [],
			branches: [],
			asyncBoundaries: [],
		},
	};
	const html = await assemblePrerenderContainer(artifact, output, {});
	const parts = await assemblePrerenderPageParts(artifact, output, {});

	expect(html).not.toContain('type="markless/state"');
	expect(html).not.toContain('type="markless/view"');
	expect(html).not.toContain('createTreeWalker');
	expect(html).toContain('data-markless-resume-module="/build/resume.js"');
	expect(html).toContain('addEventListener');
	expect(parts.head).toContain('<link rel="modulepreload" href="/build/resume.js"');
	expect(parts.container).not.toContain('rel="modulepreload"');
});

test('self-wakes an unsettled prerendered async boundary without payload scripts', async () => {
	const artifact: SsrRenderArtifact = {
		resumeModuleUrl: '/build/resume.js',
		renderSsr: () => ({ html: '<p>Checking updates…</p>' }),
	};
	const output = {
		html: '<p>Checking updates…</p>',
		state: {
			version: 1,
			cells: [],
			computed: [
				{
					graphNodeId: 'computed:feed',
					name: 'feed',
					async: true,
					snapshot: { status: 'pending' as const, version: 1, key: null },
				},
			],
			sharedDefinitions: [],
		},
		view: {
			version: 1,
			locators: [],
			events: [],
			domUpdates: [],
			behaviors: [],
			elementHandles: [],
			keyedRepeats: [],
			branches: [],
			asyncRunners: { 'computed:feed': 'symbol:feed-runner' },
			asyncBoundaries: [
				{
					id: 'boundary:0',
					startAnchor: { strategy: 'dom-order-comment' as const, index: 0 },
					endAnchor: { strategy: 'dom-order-comment' as const, index: 1 },
					asyncReads: [
						{
							source: 'feed',
							graphNodeId: 'computed:feed',
							path: [],
							runnerSymbolId: 'symbol:feed-runner',
						},
					],
				},
			],
		},
	};

	const html = await assemblePrerenderContainer(artifact, output, {});

	expect(html).not.toContain('type="markless/state"');
	expect(html).not.toContain('type="markless/view"');
	expect(html).toContain('data-markless-self-wake');
	expect(html).toContain('queueMicrotask');
	expect(html).toContain('DOMContentLoaded');
});

test('built prerender closure uses pending-only async evaluation', async () => {
	let receivedContext: unknown;
	const artifact: SsrRenderArtifact = {
		async renderSsr(_props, renderContext) {
			receivedContext = renderContext;
			return { html: '<p>Pending</p>' };
		},
	};

	await evaluateBuiltPageClosure(artifact);

	expect(receivedContext).toEqual({ prerender: true });
});

test('renders a settled prerender boundary from declared structure coordinates', async () => {
	const armRecords = {
		locators: [],
		events: [],
		behaviors: [],
		elementHandles: [],
		keyedRepeats: [],
		branches: [],
	};
	let receivedContext: unknown;
	const artifact: SsrRenderArtifact = {
		async renderSsr(_props, renderContext) {
			receivedContext = renderContext;
			return {
				html: '<main><!--markless:async:boundary:0--><section>Stable</section><!--/markless:async:boundary:0--></main>',
				structure: {
					anchors: [
						{ kind: 'async', id: 'boundary:0', html: '<section>Stable</section>' },
					],
				},
				view: {
					version: 1,
					locators: [],
					events: [],
					domUpdates: [],
					behaviors: [],
					elementHandles: [],
					keyedRepeats: [],
					branches: [],
					asyncBoundaries: [
						{
							id: 'boundary:0',
							startAnchor: { strategy: 'dom-order-comment', index: 0 },
							endAnchor: { strategy: 'dom-order-comment', index: 1 },
							asyncReads: [],
							armRecords,
						},
					],
				},
			};
		},
	};
	const graph = { read: () => ({ status: 'fulfilled' }) };

	const rendered = await renderPrerenderBoundary(
		artifact,
		'boundary:0',
		'fulfilled',
		graph as never,
	);

	expect(receivedContext).toEqual({ prerenderSettle: { graph } });
	expect(rendered).toEqual({ html: '<section>Stable</section>', armRecords, computed: [] });
});

test('registers newly discovered settled computeds while rendering their local value', async () => {
	const order: string[] = [];
	const values = new Map<string, unknown>([
		['state:weight', 2],
		[
			'computed:feed',
			{ status: 'fulfilled', version: 1, key: null, value: { updates: [1, 2, 3] } },
		],
	]);
	const graph = {
		read(graphNodeId: string, path: ReadonlyArray<string> = []) {
			order.push(`read:${graphNodeId}`);
			let value = values.get(graphNodeId);
			for (const part of path) value = (value as Record<string, unknown> | undefined)?.[part];
			return value;
		},
	};
	attachPrerenderStagedGraphRegistration(graph as never, (records) => {
		for (const record of records) {
			order.push(`register:${record.graphNodeId}`);
			values.set(record.graphNodeId, record.value);
		}
	});
	const emptyArm = {
		locators: [],
		events: [],
		domUpdates: [],
		behaviors: [],
		elementHandles: [],
		branches: [],
	};
	const surface = {
		rootComponentName: 'Feed',
		renderData: {
			root: { componentName: 'Feed', templateId: 'template:Feed' },
			chunks: [
				{
					id: 'template:Feed',
					kind: 'template',
					componentName: 'Feed',
					statics: ['<main><!--markless-slot:0-->', '</main>'],
					hosts: [],
					slots: [
						{
							kind: 'async',
							boundaryId: 'boundary:feed',
							staticIndex: 0,
							coordinate: { kind: 'comment-anchor', path: [0, 0] },
							armTemplateIds: { try: 'try', pending: 'pending', catch: 'catch' },
						},
					],
				},
				{
					id: 'try',
					kind: 'async-arm',
					componentName: 'Feed',
					statics: ['<p>Weighted count <!--markless-slot:0-->', '</p>'],
					hosts: [],
					slots: [
						{
							kind: 'text',
							staticIndex: 0,
							coordinate: { kind: 'comment-anchor', path: [0, 0] },
							residue: {
								kind: 'graph-read',
								graphNodeId: 'computed:weightedCount',
								path: [],
							},
						},
					],
				},
				...['pending', 'catch'].map((id) => ({
					id,
					kind: 'async-arm',
					componentName: 'Feed',
					statics: [`<p>${id}</p>`],
					hosts: [],
					slots: [],
				})),
			],
			boundaries: [
				{
					boundaryId: 'boundary:feed',
					runnerGraphNodeId: 'computed:feed',
					initiallyServedArm: 1,
					armChunkIds: { try: 'try', pending: 'pending', catch: 'catch' },
				},
			],
			repeats: [],
		},
		components: {
			Feed: {
				name: 'Feed',
				state: {
					version: 1,
					cells: [],
					computed: [
						{ graphNodeId: 'computed:feed', name: 'feed', async: true },
						{
							graphNodeId: 'computed:weightedCount',
							name: 'weightedCount',
							async: false,
							deriveSymbolId: 'symbol:weighted',
							dependencies: [{ graphNodeId: 'state:weight', path: [] }],
						},
					],
				},
				view: {
					version: 1,
					locators: [],
					events: [],
					domUpdates: [],
					behaviors: [],
					elementHandles: [],
					asyncBoundaries: [
						{
							id: 'boundary:feed',
							runnerGraphNodeId: 'computed:feed',
							initiallyServedArm: 1,
							startAnchor: { strategy: 'dom-order-comment', index: 0 },
							endAnchor: { strategy: 'dom-order-comment', index: 1 },
							asyncReads: [],
							armRecords: emptyArm,
						},
					],
				},
				rootChunkId: 'template:Feed',
				stateGraphNodeIds: ['computed:feed', 'computed:weightedCount'],
				initialValues: [
					{
						graphNodeId: 'computed:weightedCount',
						value: { kind: 'symbol-function', symbolId: 'symbol:weighted' },
					},
				],
				initialValueKinds: {
					'computed:weightedCount': 'sync-computed-derive',
				},
				boundaries: [
					{
						boundaryId: 'boundary:feed',
						runnerGraphNodeId: 'computed:feed',
						initiallyServedArm: 1,
						armChunkIds: { try: 'try', pending: 'pending', catch: 'catch' },
					},
				],
				edges: [],
				propCellId: null,
			},
		},
		imports: {},
	};

	const rendered = await renderPrerenderBoundary(
		surface as never,
		'boundary:feed',
		'fulfilled',
		graph as never,
		async () => ({ read }: { readonly read: (id: string) => unknown }) =>
			Number(read('state:weight')) * 3,
	);

	expect(rendered.html).toContain('Weighted count 6');
	expect(order).toContain('register:computed:weightedCount');
	expect(order).not.toContain('read:computed:weightedCount');
});

test('linked boundary evaluation carries a composed branch graph-prop mapping into its arm records', async () => {
	const rendered = await renderPrerenderBoundary(
		linkedBoundaryWithComposedBranch([
			{
				name: 'active',
				kind: 'graph-reference',
				graphNodeId: 'computed:status',
				path: ['active'],
			},
		]) as never,
		'boundary:0',
		'fulfilled',
		fulfilledStatusGraph() as never,
		async () => undefined,
	);

	expect(rendered.html).toContain('markless:branch:c0:branch-site:0-class');
	expect(rendered.armRecords.branches).toEqual([
		expect.objectContaining({
			id: 'c0:branch-site:0-class',
			testReads: [
				expect.objectContaining({
					graphNodeId: 'computed:status',
					path: ['active'],
				}),
			],
		}),
	]);
});

test('client linked-data evaluation envelopes its initial pending snapshot', async () => {
	const rendered = await renderPrerenderDataSurface(
		linkedBoundaryWithComposedBranch([]) as never,
		async () => undefined,
	);
	const snapshot = rendered.state?.computed.find(
		(computed) => computed.graphNodeId === 'computed:status',
	)?.snapshot;

	expect(rendered.html).toContain('<p>Wait</p>');
	expect(snapshot).toMatchObject({
		status: 'pending',
		key: { version: 1, root: null, records: [] },
	});
});

test('linked boundary evaluation stays fail-loud for a genuinely unmapped composed branch read', async () => {
	await expect(
		renderPrerenderBoundary(
			linkedBoundaryWithComposedBranch([]) as never,
			'boundary:0',
			'fulfilled',
			fulfilledStatusGraph() as never,
			async () => undefined,
		),
	).rejects.toThrow('MARKLESS_COMPOSED_READ_UNMAPPED: c0:branch-site:0-class');
});

test('linked boundary evaluation carries a composed child computed into settled HTML and records', async () => {
	const surface = linkedBoundaryWithComposedBranch([
		{
			name: 'active',
			kind: 'graph-reference',
			graphNodeId: 'computed:status',
			path: ['active'],
		},
		{
			name: 'updates',
			kind: 'graph-reference',
			graphNodeId: 'computed:status',
			path: ['updates'],
		},
		{
			name: 'weight',
			kind: 'graph-reference',
			graphNodeId: 'state:weight',
			path: [],
		},
	]) as any;
	const child = surface.imports.StatusBadge;
	const childDefinition = child.components.StatusBadge;
	const childTemplate = child.renderData.chunks.find(
		(chunk: { readonly id: string }) => chunk.id === 'template:StatusBadge',
	);
	childTemplate.statics = [
		'<section><!--markless-slot:0-->',
		'<p>Weighted count <!--markless-slot:1-->',
		'</p></section>',
	];
	childTemplate.slots.push({
		kind: 'text',
		residue: { kind: 'graph-read', graphNodeId: 'computed:weightedCount', path: [] },
		coordinate: { kind: 'comment-anchor', path: [0, 1, 0] },
		staticIndex: 1,
	});
	childDefinition.state.computed.push({
		graphNodeId: 'computed:weightedCount',
		name: 'weightedCount',
		async: false,
		deriveSymbolId: 'symbol:weighted',
		dependencies: [
			{ graphNodeId: 'prop:props', path: ['updates', 'length'] },
			{ graphNodeId: 'prop:props', path: ['weight'] },
		],
	});
	childDefinition.view.domUpdates.push({
		hostNodeId: 'h0',
		source: 'weightedCount',
		graphNodeId: 'computed:weightedCount',
		path: [],
		target: { kind: 'text', prefix: 'Weighted count ' },
		symbolId: 'symbol:weighted-text',
	});
	childDefinition.initialValues.push({
		graphNodeId: 'computed:weightedCount',
		value: { kind: 'symbol-function', symbolId: 'symbol:weighted' },
	});
	childDefinition.initialValueKinds = {
		'computed:weightedCount': 'sync-computed-derive',
	};
	childDefinition.stateGraphNodeIds.push('computed:weightedCount');

	const registered: Array<{ readonly graphNodeId: string; readonly deriveSymbolId?: string }> = [];
	const graph = {
		read(graphNodeId: string, path: ReadonlyArray<string> = []) {
			if (graphNodeId === 'state:weight') return 2;
			if (graphNodeId !== 'computed:status') return undefined;
			const value = { active: true, updates: [1, 2, 3] };
			if (path.length === 0) {
				return { status: 'fulfilled', version: 1, key: null, value };
			}
			return path.reduce<unknown>(
				(current, part) => (current as Record<string, unknown> | undefined)?.[part],
				value,
			);
		},
	};
	attachPrerenderStagedGraphRegistration(graph as never, (records) => {
		registered.push(...records);
	});
	const rendered = await renderPrerenderBoundary(
		surface,
		'boundary:0',
		'fulfilled',
		graph as never,
		async (symbolId) => {
			if (symbolId === 'c0:symbol:weighted') {
				return ({ graph: childGraph }: { graph: typeof graph }) =>
					Number(childGraph.read('prop:props', ['updates', 'length'])) *
					Number(childGraph.read('prop:props', ['weight']));
			}
			return () => undefined;
		},
	);

	expect(rendered.html).toContain('Weighted count 6');
	expect(registered).toEqual(
		expect.arrayContaining([
			expect.objectContaining({
				graphNodeId: 'computed:weightedCount',
				deriveSymbolId: 'c0:symbol:weighted',
			}),
		]),
	);
	expect(rendered.computed).toEqual(
		expect.arrayContaining([
			expect.objectContaining({ graphNodeId: 'computed:weightedCount' }),
		]),
	);
	expect(rendered.armRecords.domUpdates).toEqual(
		expect.arrayContaining([
			expect.objectContaining({
				hostNodeId: 'c0:h0',
				graphNodeId: 'computed:weightedCount',
			}),
		]),
	);
});

function fulfilledStatusGraph() {
	return {
		read(graphNodeId: string, path: ReadonlyArray<string> = []) {
			if (graphNodeId !== 'computed:status') return undefined;
			if (path.length > 0) return path[0] === 'active' ? true : undefined;
			return { status: 'fulfilled', version: 1, key: null, value: { active: true } };
		},
	};
}

function linkedBoundaryWithComposedBranch(
	props: ReadonlyArray<{
		readonly name: string;
		readonly kind: string;
		readonly graphNodeId: string;
		readonly path: ReadonlyArray<string>;
	}>,
) {
	const emptyArm = {
		locators: [],
		events: [],
		domUpdates: [],
		behaviors: [],
		elementHandles: [],
		branches: [],
	};
	const childView = {
		version: 1,
		locators: [
			{ hostNodeId: 'h0', strategy: 'dom-order', index: 0, tagName: 'section' },
		],
		events: [],
		domUpdates: [],
		behaviors: [],
		elementHandles: [],
		keyedRepeats: [],
		branches: [
			{
				id: 'branch-site:0-class',
				startAnchor: { strategy: 'dom-order-comment', index: 0 },
				endAnchor: { strategy: 'dom-order-comment', index: 1 },
				testReads: [{ graphNodeId: 'prop:props', path: ['active'] }],
				armRecords: [emptyArm, emptyArm],
			},
		],
		asyncBoundaries: [],
	};
	const childRenderData = {
		root: { componentName: 'StatusBadge', templateId: 'template:StatusBadge' },
		chunks: [
			{
				id: 'template:StatusBadge',
				kind: 'template',
				componentName: 'StatusBadge',
				statics: ['<section><!--markless-slot:0-->', '</section>'],
				hosts: [
					{
						hostNodeId: 'h0',
						tagName: 'section',
						coordinate: { kind: 'child-index', path: [0] },
					},
				],
				slots: [
					{
						kind: 'branch',
						branchSiteId: 'branch-site:0-class',
						armTemplateIds: ['branch:live', 'branch:idle'],
						coordinate: { kind: 'comment-anchor', path: [0, 0] },
						staticIndex: 0,
					},
				],
			},
			...[
				['branch:live', '<b>Live</b>'],
				['branch:idle', '<i>Idle</i>'],
			].map(([id, html]) => ({
				id,
				kind: 'branch-arm',
				componentName: 'StatusBadge',
				statics: [html],
				hosts: [],
				slots: [],
			})),
		],
		initialValues: [],
		branches: [
			{
				branchSiteId: 'branch-site:0-class',
				testReads: [{ graphNodeId: 'prop:props', path: ['active'] }],
			},
		],
		boundaries: [],
		repeats: [],
	};
	const childSurface = {
		rootComponentName: 'StatusBadge',
		renderData: childRenderData,
		components: {
			StatusBadge: {
				name: 'StatusBadge',
				state: { version: 1, cells: [], computed: [] },
				view: childView,
				rootChunkId: 'template:StatusBadge',
				stateGraphNodeIds: ['prop:props'],
				initialValues: [],
				branches: childRenderData.branches,
				boundaries: [],
				edges: [],
				propCellId: 'prop:props',
			},
		},
		imports: {},
	};
	const parentRenderData = {
		root: { componentName: 'Dashboard', templateId: 'template:Dashboard' },
		chunks: [
			{
				id: 'template:Dashboard',
				kind: 'template',
				componentName: 'Dashboard',
				statics: ['<main><!--markless-slot:0-->', '</main>'],
				hosts: [],
				slots: [
					{
						kind: 'async',
						boundaryId: 'boundary:0',
						armTemplateIds: {
							try: 'async:try',
							pending: 'async:pending',
							catch: 'async:catch',
						},
						coordinate: { kind: 'comment-anchor', path: [0, 0] },
						staticIndex: 0,
					},
				],
			},
			{
				id: 'async:try',
				kind: 'async-arm',
				componentName: 'Dashboard',
				statics: ['<!--markless-slot:0-->'],
				hosts: [],
				slots: [
					{
						kind: 'child-component',
						componentEdgeId: 'component-edge:0',
						childComponentName: 'StatusBadge',
						childTemplateId: 'template:StatusBadge',
						coordinate: { kind: 'comment-anchor', path: [0] },
						staticIndex: 0,
					},
				],
			},
			...[
				['async:pending', '<p>Wait</p>'],
				['async:catch', '<p>Failed</p>'],
			].map(([id, html]) => ({
				id,
				kind: 'async-arm',
				componentName: 'Dashboard',
				statics: [html],
				hosts: [],
				slots: [],
			})),
		],
		initialValues: [],
		branches: [],
		boundaries: [
			{
				boundaryId: 'boundary:0',
				runnerGraphNodeId: 'computed:status',
				initiallyServedArm: 1,
				armChunkIds: { try: 'async:try', pending: 'async:pending', catch: 'async:catch' },
			},
		],
		repeats: [],
	};
	return {
		rootComponentName: 'Dashboard',
		renderData: parentRenderData,
		components: {
			Dashboard: {
				name: 'Dashboard',
				state: {
					version: 1,
					cells: [],
					computed: [{ graphNodeId: 'computed:status', name: 'status', async: true }],
				},
				view: {
					version: 1,
					locators: [],
					events: [],
					domUpdates: [],
					behaviors: [],
					elementHandles: [],
					keyedRepeats: [],
					branches: [],
					asyncBoundaries: [
						{
							id: 'boundary:0',
							runnerGraphNodeId: 'computed:status',
							initiallyServedArm: 1,
							startAnchor: { strategy: 'dom-order-comment', index: 0 },
							endAnchor: { strategy: 'dom-order-comment', index: 1 },
							asyncReads: [],
							armRecords: [emptyArm, emptyArm, emptyArm],
						},
					],
				},
				rootChunkId: 'template:Dashboard',
				stateGraphNodeIds: ['computed:status'],
				initialValues: [],
				branches: [],
				boundaries: parentRenderData.boundaries,
				edges: [
					{
						id: 'component-edge:0',
						childComponentName: 'StatusBadge',
						hostPrefix: 'c0:',
						symbolPrefix: 'c0:',
						asyncBoundaryId: 'boundary:0',
						props,
					},
				],
				propCellId: null,
			},
		},
		imports: { StatusBadge: childSurface },
	};
}
