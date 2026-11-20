import { expect, test } from 'vitest';
import { marklessSsrArmizeBranches } from '../src/fns/ssr.ts';

// A nested list's record stays beside its enclosing list's record, found by exact id.
const list = (id: string, enclosing?: string) => ({
	id,
	parentHostNodeId: 'h3',
	collectionPath: [],
	rowEvents: [],
	...(enclosing ? { enclosingRow: { repeatId: enclosing, parentHostPath: [] } } : {}),
});

test('an arm keeps a page list and every list nested in its rows on the page; only its own lists move', () => {
	const structure = {
		anchors: [{ kind: 'branch', id: 'branch-site:0', elementStart: 0, elementEnd: 9 }],
		locators: [
			{ hostNodeId: 'h3', index: 3, tagName: 'tbody' },
			{ hostNodeId: 'h7', index: 7, tagName: 'ul' },
		],
	};
	const streams = {
		locators: [],
		events: [],
		domUpdates: [],
		behaviors: [],
		elementHandles: [],
		keyedRepeats: [
			list('repeat:0'),
			list('repeat:1', 'repeat:0'),
			list('repeat:2', 'repeat:1'),
			{ ...list('repeat:3'), parentHostNodeId: 'h7' },
		],
	};
	const [branch] = marklessSsrArmizeBranches(
		structure as never,
		[
			{
				id: 'branch-site:0',
				armRecords: [
					{
						events: [],
						repeatParents: [{ repeatId: 'repeat:0', parentHostPath: [0, 1, 0] }],
					},
				],
			},
		] as never,
		streams as never,
		'',
	);

	expect(streams.keyedRepeats.map((repeat) => repeat.id)).toEqual([
		'repeat:0',
		'repeat:1',
		'repeat:2',
	]);
	expect(
		(
			branch as { servedArmRecords?: { keyedRepeats: { id: string }[] } }
		).servedArmRecords?.keyedRepeats.map((repeat) => repeat.id),
	).toEqual(['repeat:3']);
});

test("a child's nested list is never taken for one in a page list's rows with the same authored id", () => {
	const structure = {
		anchors: [{ kind: 'branch', id: 'branch-site:0', elementStart: 0, elementEnd: 9 }],
		locators: [
			{ hostNodeId: 'h3', index: 3, tagName: 'tbody' },
			{ hostNodeId: 'c0:h1', index: 6, tagName: 'ul' },
		],
	};
	const streams = {
		locators: [],
		events: [],
		domUpdates: [],
		behaviors: [],
		elementHandles: [],
		keyedRepeats: [
			list('repeat:0'),
			{
				...list('c0:repeat:1'),
				parentHostNodeId: 'c0:h1',
				enclosingRow: { repeatId: 'repeat:0', prefix: 'c0:', parentHostPath: [] },
			},
		],
	};
	const [branch] = marklessSsrArmizeBranches(
		structure as never,
		[
			{
				id: 'branch-site:0',
				armRecords: [
					{
						events: [],
						repeatParents: [{ repeatId: 'repeat:0', parentHostPath: [0, 1, 0] }],
					},
				],
			},
		] as never,
		streams as never,
		'',
	);

	expect(streams.keyedRepeats.map((repeat) => repeat.id)).toEqual(['repeat:0']);
	expect(
		(
			branch as { servedArmRecords?: { keyedRepeats: { id: string }[] } }
		).servedArmRecords?.keyedRepeats.map((repeat) => repeat.id),
	).toEqual(['c0:repeat:1']);
});
