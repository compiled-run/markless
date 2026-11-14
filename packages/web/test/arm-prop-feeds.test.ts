import { expect, test } from 'vitest';
import { marklessQualifyChildState, type ComposeStateDraft } from '../src/fns/composition.ts';

// A component an arm placed reads its props where they live, as one the server placed does: its own cell holds no copy
// anyone keeps current, and nothing marks it as fed.

const routes = [{ name: 'subject', kind: 'graph-reference', graphNodeId: 'state:picked', path: [] }];

function placedChild(): ComposeStateDraft {
	return {
		cells: [
			{ graphNodeId: 'state:round', directValue: 0 },
			{ graphNodeId: 'prop:props', directValue: { subject: 4, tone: 'dim' } },
		],
		computed: [
			{
				graphNodeId: 'computed:detail',
				dependencies: [
					{ graphNodeId: 'prop:props', path: ['subject', 'name'] },
					{ graphNodeId: 'prop:tone', path: [] },
					{ graphNodeId: 'state:round', path: [] },
				],
			},
		],
	};
}

test('a placed instance routes a live prop to its source and keeps its own state under its path', () => {
	const state = placedChild();
	marklessQualifyChildState(state, routes, 'c3:');
	expect(state.computed?.[0]?.dependencies).toEqual([
		{ graphNodeId: 'state:picked', path: ['name'] },
		{ graphNodeId: 'c3:prop:tone', path: [] },
		{ graphNodeId: 'c3:state:round', path: [] },
	]);
	expect(state.cells?.map((cell) => Object.keys(cell).sort())).toEqual([
		['directValue', 'graphNodeId'],
		['directValue', 'graphNodeId'],
	]);
});

test('one level up, the route takes the outer one', () => {
	const state = placedChild();
	marklessQualifyChildState(state, routes, 'c3:');
	marklessQualifyChildState(
		state,
		[{ name: 'picked', kind: 'graph-reference', graphNodeId: 'computed:list', path: ['value', '0'] }],
		'c1:',
	);
	expect(state.computed?.[0]?.dependencies?.[0]).toEqual({ graphNodeId: 'c1:state:picked', path: ['name'] });
});
