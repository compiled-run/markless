import { expect, test } from 'vitest';
import { marklessSsrRowQualifiedView } from '../src/fns/row-qualified-view.ts';

const empty = { events: [], domUpdates: [], behaviors: [], elementHandles: [] };
const structure = (hostNodeIds: ReadonlyArray<string>) => ({
	locators: hostNodeIds.map((hostNodeId, index) => ({ hostNodeId, tagName: 'button', index })),
	anchors: [],
	elementCount: hostNodeIds.length,
});

// A projected host rendered once per keyed row takes every enclosing row's segment, so its record is copied per row however deep the rows nest.
test('an owner record is copied for each nested keyed row its projected host rendered in', () => {
	const view = {
		...empty,
		locators: [{ hostNodeId: 'h0' }],
		events: [{ hostNodeId: 'h0', eventName: 'click' }],
	};
	const qualified = marklessSsrRowQualifiedView(
		structure(['r:a:r:x:h0', 'r:b:r:x:h0', 'r:c:h0']),
		view,
	);

	expect(qualified.events.map((event) => event.hostNodeId)).toEqual([
		'r:a:r:x:h0',
		'r:b:r:x:h0',
		'r:c:h0',
	]);
});

test('a host under a prefix of its own keeps the records of that prefix only', () => {
	const view = { ...empty, locators: [{ hostNodeId: 'h0' }] };
	expect(
		marklessSsrRowQualifiedView(structure(['c1:r:a:r:x:h0', 'r:z:h0']), view, 'c1:').locators,
	).toEqual([{ hostNodeId: 'r:a:r:x:h0' }]);
});
