import { expect, test } from 'vitest';
import { assertProtocolViewPayload } from '../../serializer/src/protocol-validation.ts';
import { withoutReadSources } from '../src/render-to-string.ts';

const view = {
	version: 1,
	locators: [{ hostNodeId: 'h1', strategy: 'dom-order', index: 1, tagName: 'p' }],
	events: [],
	domUpdates: [
		{
			hostNodeId: 'h1',
			source: 'count',
			graphNodeId: 'state:count',
			path: [],
			target: { kind: 'text' },
			symbolId: 'symbol:1',
		},
	],
	behaviors: [
		{ hostNodeId: 'h1', source: 'attach', functionSource: '() => {}', inputSources: [] },
	],
	elementHandles: [],
	keyedRepeats: [],
	branches: [],
	asyncBoundaries: [
		{
			id: 'boundary:0',
			runnerGraphNodeId: 'computed:feed',
			initiallyServedArm: 0,
			startAnchor: { strategy: 'dom-order-comment', index: 0 },
			endAnchor: { strategy: 'dom-order-comment', index: 1 },
			asyncReads: [{ source: 'feed.title', graphNodeId: 'computed:feed', path: ['title'] }],
			armRecords: {
				keyedRepeats: [
					{ rowTemplate: { textSlots: [{ path: [0], source: '`Edit ${row.name}`' }] } },
				],
			},
		},
	],
} as const;

test('a never page serves no authored text for reads, and keeps every source the browser evaluates', () => {
	const served = withoutReadSources(view);
	expect(JSON.stringify(served)).not.toContain('"count"');
	expect(JSON.stringify(served)).not.toContain('feed.title');
	expect(served.domUpdates[0]).toEqual({ ...view.domUpdates[0], source: undefined });
	expect(served.domUpdates[0]).not.toHaveProperty('source');
	expect(served.behaviors[0].source).toBe('attach');
	expect(
		served.asyncBoundaries[0].armRecords.keyedRepeats[0].rowTemplate.textSlots[0].source,
	).toBe('`Edit ${row.name}`');
	expect(() => assertProtocolViewPayload(served)).not.toThrow();
});
