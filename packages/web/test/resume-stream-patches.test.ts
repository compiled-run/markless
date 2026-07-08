import { ASYNC_PROTOCOL_VERSION } from '@markless/serializer';
import { expect, test } from 'vitest';
import { adoptStreamedArmPatches } from '../src/resume-stream-patches.ts';

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
			querySelectorAll: (selector: string) => scriptsBySelector[selector] ?? [],
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
		'script[type="markless/arm"][data-boundary]': [
			fakeScript({ 'data-boundary': 'boundary:0' }, JSON.stringify(settledRecords)),
		],
		'script[type="markless/state-patch"][data-graph-node]': [
			fakeScript(
				{ 'data-graph-node': 'computed:report' },
				JSON.stringify({
					graphNodeId: 'computed:report',
					snapshot: { status: 'fulfilled', version: 1, key: null, value: { root: 7, records: [] } },
				}),
			),
		],
	});

	const adopted = adoptStreamedArmPatches(decoded, root as never);

	expect(adopted.state.computed[0]?.snapshot).toMatchObject({ status: 'fulfilled' });
	expect(adopted.view.asyncBoundaries[0]?.armRecords).toEqual(settledRecords);
});

test('adoptStreamedArmPatches is identity without streamed scripts or a document', () => {
	expect(adoptStreamedArmPatches(decoded, fakeRoot({}) as never)).toBe(decoded);
	expect(adoptStreamedArmPatches(decoded, {} as never)).toBe(decoded);
});

test('adoptStreamedArmPatches ignores patches for other containers payloads', () => {
	const root = fakeRoot({
		'script[type="markless/arm"][data-boundary]': [
			fakeScript({ 'data-boundary': 'boundary:99' }, JSON.stringify({ locators: [] })),
		],
		'script[type="markless/state-patch"][data-graph-node]': [
			fakeScript(
				{ 'data-graph-node': 'computed:unknown' },
				JSON.stringify({ graphNodeId: 'computed:unknown', snapshot: { status: 'fulfilled' } }),
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
