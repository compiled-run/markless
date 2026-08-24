import { expect, test } from 'vitest';
import { marklessSsrAppendChildView } from '../src/fns/ssr.ts';

// A branch whose test is a prop the placement never passes cannot be
// re-decided, so composition strips its flip machinery. The arm it painted
// still owns records - the text inside an element that arm wraps - and those
// have to survive, or the arm renders right once and then never changes.

function compose(branch: Record<string, unknown>) {
	const branches: Array<Record<string, unknown>> = [];
	marklessSsrAppendChildView({
		child: {
			hostPrefix: 'c1:',
			symbolPrefix: 'c1:',
			graphProps: [],
			view: {
				locators: [],
				events: [],
				domUpdates: [],
				behaviors: [],
				elementHandles: [],
				branches: [branch],
			},
			externalSymbolIds: new Set<string>(),
		},
		baseIndex: 0,
		locators: [],
		events: [],
		domUpdates: [],
		keyedRepeats: [],
		behaviors: [],
		elementHandles: [],
		branches: branches as never,
		asyncBoundaries: [],
		asyncRunners: {},
		externalSymbolIds: new Set<string>(),
		boundaryArmBranches: new Map(),
	} as never);
	return branches;
}

const anchors = {
	startAnchor: { strategy: 'dom-order-comment', index: 0 },
	endAnchor: { strategy: 'dom-order-comment', index: 1 },
};

const armWithText = {
	events: [],
	domUpdates: [
		{
			hostNodeId: 'h2',
			source: 's.value',
			graphNodeId: 'shared:src/Page.tsrx#store/state:s',
			path: ['value'],
			target: { kind: 'text' },
			hostPath: [0],
			symbolId: 'symbol:5',
		},
	],
	behaviors: [],
	elementHandles: [],
};

test('a decided branch keeps the records of the arm it painted', () => {
	const [composed] = compose({
		id: 'branch-site:0',
		...anchors,
		symbolId: 'symbol:6',
		takenArm: 1,
		testReads: [{ graphNodeId: 'prop:props', path: ['children'] }],
		armRecords: [{ events: [], domUpdates: [], behaviors: [], elementHandles: [] }, armWithText],
	});

	const armRecords = composed?.armRecords as ReadonlyArray<typeof armWithText> | undefined;

	expect(composed?.id).toBe('c1:branch-site:0');
	expect(armRecords?.[1]?.domUpdates[0]).toMatchObject({
		hostPath: [0],
		symbolId: 'c1:symbol:5',
	});
});

test('a decided branch carries no flip machinery: nothing can re-decide it', () => {
	const [composed] = compose({
		id: 'branch-site:0',
		...anchors,
		symbolId: 'symbol:6',
		takenArm: 1,
		testReads: [{ graphNodeId: 'prop:props', path: ['children'] }],
		armRecords: [{ events: [], domUpdates: [], behaviors: [], elementHandles: [] }, armWithText],
	});

	expect(composed?.testReads).toEqual([]);
	expect(composed?.symbolId).toBeUndefined();
});

test('a decided branch with nothing live in any arm is dropped, as before', () => {
	expect(
		compose({
			id: 'branch-site:0',
			...anchors,
			symbolId: 'symbol:6',
			takenArm: 1,
			testReads: [{ graphNodeId: 'prop:props', path: ['children'] }],
			armRecords: [
				{ events: [], domUpdates: [], behaviors: [], elementHandles: [] },
				{ events: [], domUpdates: [], behaviors: [], elementHandles: [] },
			],
		}),
	).toEqual([]);
});

test('a live arm whose painted index the render never reported fails loud', () => {
	expect(() =>
		compose({
			id: 'branch-site:0',
			...anchors,
			symbolId: 'symbol:6',
			testReads: [{ graphNodeId: 'prop:props', path: ['children'] }],
			armRecords: [{ events: [], domUpdates: [], behaviors: [], elementHandles: [] }, armWithText],
		}),
	).toThrow('MARKLESS_DECIDED_BRANCH_ARM_UNKNOWN: branch-site:0');
});
