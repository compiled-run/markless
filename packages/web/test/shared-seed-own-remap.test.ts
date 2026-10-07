import { expect, test } from 'vitest';
import { marklessCsrRemapGraphOutput } from '../src/fns/composition.ts';

const SEED = {
	graphNodeId: 'shared:src/group.tsrx#group/state:group',
	deriveSymbolId: 'symbol:8',
	dependencies: [
		{
			graphNodeId: 'prop:props',
			path: ['disabled'],
			reads: { graphNodeId: 'prop:props', path: ['disabled'] },
		},
	],
};

function output() {
	return { state: { cells: [], computed: [], sharedSeeds: [SEED] } };
}

// A module's root remaps its output once more over the props it hands its own
// children. A seed follows the root's OWN props, so that pass must leave it for
// the composer: routed through a child's `disabled` it follows the wrong node.
test('a module remapping its own output leaves the seeds of its own props alone', () => {
	const own = output();
	marklessCsrRemapGraphOutput(own, [
		{
			name: 'disabled',
			graphNodeId: 'shared:src/group.tsrx#group/state:group',
			path: ['disabled'],
		},
	]);
	expect(own.state.sharedSeeds).toEqual([SEED]);

	marklessCsrRemapGraphOutput(
		own,
		[{ name: 'disabled', graphNodeId: 'state:locked', path: [] }],
		'c0:',
	);
	expect(own.state.sharedSeeds?.[0]?.dependencies).toEqual([
		{
			graphNodeId: 'state:locked',
			path: [],
			reads: { graphNodeId: 'c0:prop:props', path: ['disabled'] },
		},
	]);
});
