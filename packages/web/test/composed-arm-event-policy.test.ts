import { expect, test } from 'vitest';
import { protocolInstanceSegment } from '../../serializer/src/protocol.ts';
import {
	marklessSsrAppendChildView,
	marklessSsrPrefixArmRecord,
	marklessSsrPrefixBoundaryArmRecords,
} from '../src/fns/ssr.ts';

// An arm event's sync policy reads the graph by id exactly as a normal child
// event's does. Composition must route it the same way, or resume evaluates the
// policy against a node id that belongs to no cell in the page graph.
const child = {
	hostPrefix: 'c0:',
	symbolPrefix: protocolInstanceSegment(0),
	graphProps: [],
	externalSymbolIds: new Set<string>(),
};
const policy = { type: 'graph-truthy', graphNodeId: 'state:armed', path: [] };
const armed = `${protocolInstanceSegment(0)}state:armed`;

const event = (hostNodeId: string) => ({
	hostNodeId,
	eventName: 'click',
	symbolIds: ['symbol:0'],
	syncPolicy: policy,
	writes: ['state:armed'],
});

test('an arm record qualifies the graph ids its event policies read', () => {
	const prefixed = marklessSsrPrefixArmRecord({ events: [event('h0')] } as never, child as never);

	expect(prefixed.events[0]?.syncPolicy).toMatchObject({ graphNodeId: armed });
	expect(prefixed.events[0]?.writes).toEqual([armed]);
});

test('a boundary arm record set qualifies event and keyed-repeat row policies', () => {
	const prefixed = marklessSsrPrefixBoundaryArmRecords(
		{
			events: [event('h0')],
			keyedRepeats: [
				{
					id: 'repeat:0',
					parentHostNodeId: 'h1',
					collectionGraphNodeId: 'state:rows',
					collectionPath: [],
					rowEvents: [event('h2')],
				},
			],
		} as never,
		child as never,
	);

	expect(prefixed.events[0]?.syncPolicy).toMatchObject({ graphNodeId: armed });
	expect(prefixed.keyedRepeats[0]?.rowEvents[0]?.syncPolicy).toMatchObject({
		graphNodeId: armed,
	});
	expect(prefixed.events[0]?.writes).toEqual([armed]);
	expect(prefixed.keyedRepeats[0]?.rowEvents[0]?.writes).toEqual([armed]);
});

test('a composed child view qualifies the graph ids its events and row events write', () => {
	const events: Array<{ readonly writes?: ReadonlyArray<string> }> = [];
	const keyedRepeats: Array<{ readonly rowEvents: ReadonlyArray<{ readonly writes?: ReadonlyArray<string> }> }> = [];
	marklessSsrAppendChildView({
		child: {
			...child,
			view: {
				locators: [],
				events: [event('h0')],
				domUpdates: [],
				behaviors: [],
				elementHandles: [],
				keyedRepeats: [
					{
						id: 'repeat:0',
						parentHostNodeId: 'h1',
						collectionGraphNodeId: 'state:rows',
						collectionPath: [],
						rowEvents: [event('h2')],
					},
				],
			},
		},
		baseIndex: 0,
		locators: [],
		events,
		domUpdates: [],
		keyedRepeats,
		behaviors: [],
		elementHandles: [],
		branches: [],
		asyncBoundaries: [],
		asyncRunners: {},
		externalSymbolIds: new Set<string>(),
		boundaryArmBranches: new Map(),
	} as never);

	expect(events[0]?.writes).toEqual([armed]);
	expect(keyedRepeats[0]?.rowEvents[0]?.writes).toEqual([armed]);
});
