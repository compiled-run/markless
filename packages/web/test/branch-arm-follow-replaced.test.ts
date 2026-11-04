import { expect, test } from 'vitest';
import { followBranchArm } from '../src/resume-repeat-branch-arm.ts';

// A repeat whose rows an arm re-commit replaced stops following the arm; one whose rows it took out itself keeps it.

type Row = { parentElement: unknown; __marklessRowParent?: unknown; nodeType: number };

function setUp() {
	const start = { nodeType: 8 },
		end = { nodeType: 8 };
	const parent = {
		nodeType: 1,
		parentElement: null,
		childNodes: [start, end] as unknown[],
		__marklessBranchArms: new Map([
			['branch-site:0', { arm: 0, start, end, listeners: new Set<() => void>() }],
		]),
	};
	const repeat = {
		id: 'repeat:0',
		branchArm: { branchId: 'branch-site:0', arm: 0 },
		collectionGraphNodeId: undefined,
	};
	const follow = followBranchArm(
		parent as never,
		repeat as never,
		{ graph: { read: () => [] }, storeContainerSubscription: () => {} } as never,
		{ mounted: false, nodes: [] },
		() => {},
	)!;
	const row = (attached: boolean): Row => ({ nodeType: 1, parentElement: attached ? parent : null });
	return { parent, follow, row };
}

test('a repeat with a row still in its parent follows the arm', () => {
	const { follow, row } = setUp();
	expect(follow.showing(new Map([['a', row(true) as never], ['b', row(false) as never]]))).toBe(true);
});

test('a repeat whose rows a re-commit replaced no longer follows the arm', () => {
	const { follow, row } = setUp();
	expect(follow.showing(new Map([['a', row(false) as never], ['b', row(false) as never]]))).toBe(false);
});

test('a repeat that took its own rows out keeps following the arm, so it can put them back', () => {
	const { parent, follow, row } = setUp();
	const removed = (): Row => ({ ...row(false), __marklessRowParent: parent });
	expect(follow.showing(new Map([['a', removed() as never], ['b', removed() as never]]))).toBe(true);
});

test('an empty repeat follows the arm', () => {
	const { follow } = setUp();
	expect(follow.showing(new Map())).toBe(true);
	expect(follow.showing()).toBe(true);
});
