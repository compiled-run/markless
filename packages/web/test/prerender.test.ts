import { expect, test } from 'vitest';
import { createProtocolStatePayload, renderPayloadScripts } from '@markless/serializer';
import { classifyResumeRecordDelta } from '@markless/serializer/resume-record-delta';
import { createPrerenderInlineResumerSource } from '../src/inline/resumer.ts';
import {
	derivePrerenderResumeRecords,
	evaluateBuiltPageClosure,
	evaluatePrerenderClosure,
	renderPrerenderBoundary,
} from '../src/prerender/evaluator.ts';
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
				locators: [{ hostNodeId: 'h0', strategy: 'dom-order', index: 0, tagName: 'button' }],
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
	expect(ssr).toContain(
		'data-markless-resume-module="/build/prerender-wake-A1b2.js"',
	);
	expect(derived).toEqual(await derivePrerenderResumeRecords(artifact));
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
		locators: [{ hostNodeId: 'h0', strategy: 'dom-order' as const, index: 0, tagName: 'button' }],
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
		locators: [{ hostNodeId: 'h0', strategy: 'dom-order' as const, index: 0, tagName: 'button' }],
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
			locators: [{ hostNodeId: 'h0', strategy: 'dom-order' as const, index: 0, tagName: 'button' }],
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
