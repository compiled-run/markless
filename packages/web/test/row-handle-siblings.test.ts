import type { RuntimeGraph } from '@markless/runtime';
import { expect, test } from 'vitest';
import { materializeElementHandles } from '../src/resume-locators.ts';
import type { ResumeDomElement, ResumeViewRecord } from '../src/resume-types.ts';

// An array handle bound in keyed rows answers the rows only, even when the rows share their parent element with
// other elements before or after them.

const element = (tagName: string): ResumeDomElement =>
	({ nodeType: 1, tagName, childNodes: [] }) as unknown as ResumeDomElement;

function rowsOf(
	children: ReadonlyArray<ResumeDomElement>,
	collection: unknown,
	offsets: { readonly rowStartOffset?: number; readonly rowEndOffset?: number },
) {
	const parent = {
		nodeType: 1,
		tagName: 'SECTION',
		childNodes: children,
	} as unknown as ResumeDomElement;
	const root = {
		nodeType: 1,
		tagName: 'MAIN',
		childNodes: [parent],
	} as unknown as ResumeDomElement;
	const repeat = {
		id: 'repeat:0',
		parentHostNodeId: 'h0',
		collectionGraphNodeId: 'state:tags',
		collectionPath: [],
		keyPath: [],
		itemName: 'tag',
		rowElementCount: 1,
		rowEvents: [],
		rowElementHandles: [{ hostPath: [], handleId: 'element:rows', name: 'rows', plural: true }],
		...offsets,
	} as unknown as NonNullable<ResumeViewRecord['keyedRepeats']>[number];
	const graph = { read: () => collection } as unknown as RuntimeGraph;
	return materializeElementHandles(root, new Map([['h0', parent]]), [], [repeat], graph).get(
		'rows',
	);
}

test('rows followed by other elements: the handle holds the rows, not what follows them', () => {
	const [x, y] = [element('I'), element('I')];
	expect(rowsOf([x!, y!, element('BUTTON'), element('P')], ['x', 'y'], {})).toEqual([x, y]);
});

test('rows between other elements, counted from the front', () => {
	const [x, y] = [element('I'), element('I')];
	expect(
		rowsOf([element('H2'), x!, y!, element('P')], new Set(['x', 'y']), { rowStartOffset: 1 }),
	).toEqual([x, y]);
});

test('rows between other elements, counted from the back', () => {
	const [x, y] = [element('I'), element('I')];
	expect(
		rowsOf(
			[element('H2'), x!, y!, element('P')],
			new Map([
				['x', 1],
				['y', 2],
			]),
			{ rowEndOffset: 1 },
		),
	).toEqual([x, y]);
});

test('an empty list holds no element', () => {
	expect(rowsOf([element('BUTTON'), element('P')], [], {})).toEqual([]);
});
