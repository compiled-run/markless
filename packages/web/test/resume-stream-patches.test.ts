import { ASYNC_BOUNDARY_ARM, ASYNC_PROTOCOL_VERSION } from '@markless/serializer';
import { expect, test } from 'vitest';
import { adoptStreamedArmPatches } from '../src/resume-stream-patches.ts';
import { registrationGraphNodeCensus } from '../src/resume-runtime.ts';

// Streamed pages leave their settled-arm records and incremental snapshots
// in the document as inert scripts; the resume runtime adopts them BEFORE
// graph construction and record registration, so the settled DOM the __mArm
// executor committed becomes interactive at wake.

function fakeScript(attributes: Record<string, string>, textContent: string) {
	return { getAttribute: (name: string) => attributes[name] ?? null, textContent };
}

function fakeRoot(scriptsBySelector: Record<string, ReturnType<typeof fakeScript>[]>) {
	return {
		ownerDocument: {
			querySelectorAll: (selector: string) =>
				selector
					.split(',')
					.flatMap((part) => scriptsBySelector[part] ?? []),
		},
	};
}

const decoded = {
	state: {
		version: ASYNC_PROTOCOL_VERSION,
		cells: [],
		computed: [
			{
				graphNodeId: 'computed:report',
				name: 'report',
				async: true,
				snapshot: { status: 'pending', version: 1, key: null },
			},
		],
	},
	view: {
		version: ASYNC_PROTOCOL_VERSION,
		locators: [],
		events: [],
		domUpdates: [],
		behaviors: [],
		elementHandles: [],
		asyncBoundaries: [
			{
				id: 'boundary:0',
				runnerGraphNodeId: 'computed:report',
				initiallyServedArm: ASYNC_BOUNDARY_ARM.pending,
				startAnchor: { strategy: 'dom-order-comment', index: 0 },
				endAnchor: { strategy: 'dom-order-comment', index: 1 },
				asyncReads: [{ source: 'report', graphNodeId: 'computed:report', path: [] }],
				armRecords: { locators: [], events: [], behaviors: [], elementHandles: [] },
			},
		],
	},
} as never;

test('adoptStreamedArmPatches overlays streamed snapshots and arm records before wake', () => {
	const settledRecords = {
		locators: [{ hostNodeId: 'h3', strategy: 'arm-relative', index: 2, tagName: 'button' }],
		events: [{ hostNodeId: 'h3', eventName: 'click', symbolIds: ['symbol:relay-tap'] }],
		behaviors: [],
		elementHandles: [],
	};
	const root = fakeRoot({
		'script[type="markless/arm"]': [
			fakeScript(
				{ 'data-boundary': 'boundary:0' },
				JSON.stringify([ASYNC_BOUNDARY_ARM.try, settledRecords]),
			),
		],
		'script[type="markless/state-patch"]': [
			fakeScript(
				{ 'data-graph-node': 'computed:report' },
				JSON.stringify({
					cells: [
						{
							graphNodeId: 'state:weight',
							name: 'weight',
							valueKind: 'scalar',
							value: 3,
						},
					],
					computed: [
						{
							graphNodeId: 'computed:report',
							name: 'report',
							async: true,
							snapshot: {
								status: 'fulfilled',
								version: 1,
								key: null,
								value: { root: 7, records: [] },
							},
						},
						{
							graphNodeId: 'computed:weightedCount',
							name: 'weightedCount',
							async: false,
							deriveSymbolId: 'symbol:weighted-count',
							dependencies: [{ graphNodeId: 'state:weight', path: [] }],
						},
					],
				}),
			),
		],
	});

	const adopted = adoptStreamedArmPatches(decoded, root as never);

	expect(adopted.state.computed[0]?.snapshot).toMatchObject({ status: 'fulfilled' });
	expect(adopted.state.cells.map((record) => record.graphNodeId)).toContain('state:weight');
	expect(adopted.state.computed.map((record) => record.graphNodeId)).toContain(
		'computed:weightedCount',
	);
	expect(registrationGraphNodeCensus(adopted.state)).toEqual(
		new Set(['computed:report', 'state:weight', 'computed:weightedCount']),
	);
	expect(adopted.view.asyncBoundaries[0]?.armRecords).toEqual(settledRecords);
	expect(adopted.view.asyncBoundaries[0]?.initiallyServedArm).toBe(ASYNC_BOUNDARY_ARM.try);
});

test('adoptStreamedArmPatches is identity without streamed scripts or a document', () => {
	expect(adoptStreamedArmPatches(decoded, fakeRoot({}) as never)).toBe(decoded);
	expect(adoptStreamedArmPatches(decoded, {} as never)).toBe(decoded);
});

// Reveal trains (T113): a streamed template can still be QUEUED (present in
// the document, not yet committed) when the runtime wakes mid-train. Its
// boundary still shows the @pending arm, so adopting the settled records or
// snapshot would register settled truth against pending DOM. The runtime
// skips both — the pending snapshot re-demands the computed and the client
// settle path owns the boundary; the queued commit no-ops at flush.
test('adoptStreamedArmPatches skips boundaries whose streamed template is still uncommitted', () => {
	const settledRecords = {
		locators: [{ hostNodeId: 'h3', strategy: 'arm-relative', index: 2, tagName: 'button' }],
		events: [{ hostNodeId: 'h3', eventName: 'click', symbolIds: ['symbol:relay-tap'] }],
		behaviors: [],
		elementHandles: [],
	};
	const root = fakeRoot({
		'template[m\\:arm]': [fakeScript({ 'm:arm': 'boundary:0' }, '')],
		'script[type="markless/arm"]': [
			fakeScript(
				{ 'data-boundary': 'boundary:0' },
				JSON.stringify([ASYNC_BOUNDARY_ARM.try, settledRecords]),
			),
		],
		'script[type="markless/state-patch"]': [
			fakeScript(
				{ 'data-graph-node': 'computed:report' },
				JSON.stringify({
					cells: [],
					computed: [
						{
							...decoded.state.computed[0],
							snapshot: {
								status: 'fulfilled',
								version: 1,
								key: null,
								value: { root: 7, records: [] },
							},
						},
					],
				}),
			),
		],
	});

	const adopted = adoptStreamedArmPatches(decoded, root as never);

	expect(adopted.state.computed[0]?.snapshot).toMatchObject({ status: 'pending' });
	expect(adopted.view.asyncBoundaries[0]?.armRecords).toEqual({
		locators: [],
		events: [],
		behaviors: [],
		elementHandles: [],
	});
});

test('adoptStreamedArmPatches ignores patches for other containers payloads', () => {
	const root = fakeRoot({
		'script[type="markless/arm"]': [
			fakeScript(
				{ 'data-boundary': 'boundary:99' },
				JSON.stringify([ASYNC_BOUNDARY_ARM.try, { locators: [] }]),
			),
		],
		'script[type="markless/state-patch"]': [
			fakeScript(
				{ 'data-graph-node': 'computed:unknown' },
				JSON.stringify({
					cells: [{ graphNodeId: 'state:foreign', name: 'foreign', valueKind: 'scalar' }],
					computed: [],
				}),
			),
		],
	});

	const adopted = adoptStreamedArmPatches(decoded, root as never);

	expect(adopted.state.computed[0]?.snapshot).toMatchObject({ status: 'pending' });
	expect(adopted.view.asyncBoundaries[0]?.armRecords).toEqual({
		locators: [],
		events: [],
		behaviors: [],
		elementHandles: [],
	});
});
