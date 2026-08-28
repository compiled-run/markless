import { expect, test } from 'vitest';
import { createProtocolStatePayload } from '../../../serializer/src/index.ts';
import { createEventResumeContainerFromPayloads } from '../../src/event-resume.ts';

const emptyView = {
	version: 1 as const,
	locators: [],
	events: [],
	domUpdates: [],
	behaviors: [],
	elementHandles: [],
	keyedRepeats: [],
	branches: [],
	asyncBoundaries: [],
};

const root = { nodeType: 1, tagName: 'DIV', childNodes: [] };

async function readCell(value: unknown) {
	const container = await createEventResumeContainerFromPayloads({
		root,
		state: createProtocolStatePayload({
			cells: [{ graphNodeId: 'limit', name: 'limit', valueKind: 'scalar', value }],
		}),
		view: emptyView,
		loadSymbol: () => () => undefined,
	} as never);
	return container.graph.read('limit');
}

test.each([
	['Infinity', Number.POSITIVE_INFINITY],
	['-Infinity', Number.NEGATIVE_INFINITY],
	['NaN', Number.NaN],
])('the event-resume lane decodes a %s cell', async (_name, value) => {
	expect(await readCell(value)).toBe(value);
});

test('the event-resume lane leaves finite cells alone', async () => {
	expect(await readCell(3.5)).toBe(3.5);
});

test('the event-resume lane decodes a non-finite object field', async () => {
	expect(await readCell({ maxWidth: Number.POSITIVE_INFINITY, width: 3 })).toEqual({
		maxWidth: Number.POSITIVE_INFINITY,
		width: 3,
	});
});
