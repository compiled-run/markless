import { expect, test } from 'vitest';
import {
	createProtocolStatePayload,
	renderPayloadScripts,
	type ProtocolViewPayload,
} from '../../serializer/src/index.ts';
import { decodedRecords, readersOf } from '../src/kept-swap.ts';

const view: ProtocolViewPayload = {
	version: 1,
	locators: [],
	events: [],
	domUpdates: [],
	behaviors: [],
	elementHandles: [],
	asyncBoundaries: [],
};

const reads = (...ids: string[]) => ids.map((graphNodeId) => ({ graphNodeId, path: [] }));

function region(computed: string) {
	const state = createProtocolStatePayload({
		cells: [],
		computed: [{ graphNodeId: computed, name: 'label', async: false }],
	});
	const scripts = renderPayloadScripts({ state, view });
	const inner = (script: string) => script.slice(script.indexOf('>') + 1, -'</script>'.length);
	const texts: Record<string, string> = {
		'script[type="markless/state"]': inner(scripts.stateScript),
		'script[type="markless/view"]': inner(scripts.viewScript),
	};
	return {
		querySelector: (selector: string) =>
			selector in texts ? { textContent: texts[selector] } : null,
	} as unknown as Element;
}

test('a carry reads only the computeds the carried cells feed, directly or through another computed or seed', () => {
	const state = createProtocolStatePayload({
		cells: [],
		computed: [
			{ graphNodeId: 'p/computed:open', name: 'open', async: false, dependencies: reads('p/state:nav') },
			{ graphNodeId: 'p/computed:label', name: 'label', async: false, dependencies: reads('p/computed:open') },
			{ graphNodeId: 'p/computed:fromSeed', name: 'fromSeed', async: false, dependencies: reads('p/shared:seed') },
			{ graphNodeId: 'p/computed:here', name: 'here', async: false, dependencies: reads('p/state:path') },
			{ graphNodeId: 'p/computed:constant', name: 'constant', async: false, dependencies: [] },
		],
	});
	const withSeed = {
		...state,
		sharedSeeds: [
			{
				graphNodeId: 'p/shared:seed',
				deriveSymbolId: 'seed',
				dependencies: [{ ...reads('p/computed:label')[0]!, reads: reads('p/computed:label')[0]! }],
			},
		],
	};
	expect([...readersOf(withSeed, new Set(['p/state:nav']))].sort()).toEqual([
		'p/computed:fromSeed',
		'p/computed:label',
		'p/computed:open',
		'p/shared:seed',
		'p/state:nav',
	]);
});

test('a computed whose reads were not recorded counts as reading what the carry changed', () => {
	const state = createProtocolStatePayload({
		cells: [],
		computed: [{ graphNodeId: 'p/computed:unknown', name: 'unknown', async: false }],
	});
	expect(readersOf(state, new Set(['p/state:nav'])).has('p/computed:unknown')).toBe(true);
});

test('the leaving page records the swap before decoded as arriving are not decoded again', () => {
	const first = decodedRecords(region('p/computed:first'));
	const second = decodedRecords(region('p/computed:second'));
	expect(first).toBeDefined();
	expect(decodedRecords(region('p/computed:first'))).toBe(first);
	expect(decodedRecords(region('p/computed:second'))).toBe(second);
	expect(decodedRecords(region('p/computed:third'))).not.toBe(first);
	expect(decodedRecords(region('p/computed:third'))?.state.computed[0]?.graphNodeId).toBe(
		'p/computed:third',
	);
});
