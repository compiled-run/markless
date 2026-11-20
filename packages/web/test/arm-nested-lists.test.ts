import { expect, test } from 'vitest';
import { marklessSsrArmizeBranches } from '../src/fns/ssr.ts';

// A list inside another list's rows is wired through each enclosing row, so its record must stay beside the
// enclosing list's record: an arm that keeps that list on the page keeps its nested lists there too.
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
