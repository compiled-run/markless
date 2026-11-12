import { expect, test } from 'vitest';
import { marklessQualifyChildState, type ComposeStateDraft } from '../src/fns/composition.ts';

// A component an escalated arm placed reads its props off its own cell; its feeds take the routes a prop read would.

const routes = [{ name: 'subject', kind: 'graph-reference', graphNodeId: 'state:picked', path: [] }];

function placedChild(): ComposeStateDraft {
	return {
		cells: [
			{ graphNodeId: 'state:round', directValue: 0 },
			{
				graphNodeId: 'prop:props',
				directValue: { subject: 4, tone: 'dim' },
				follows: [{ graphNodeId: 'prop:props', path: ['subject'], prop: 'subject' }],
			},
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

test('a placed instance keeps its computeds on its own prop cell and feeds that cell from the route', () => {
	const state = placedChild();
	marklessQualifyChildState(state, routes, 'c3:');
	expect(state.computed?.[0]?.dependencies).toEqual([
		{ graphNodeId: 'c3:prop:props', path: ['subject', 'name'] },
		{ graphNodeId: 'c3:prop:props', path: ['tone'] },
		{ graphNodeId: 'c3:state:round', path: [] },
	]);
	expect(state.cells?.find((cell) => cell.graphNodeId === 'c3:prop:props')?.follows).toEqual([
		{ graphNodeId: 'state:picked', path: [], prop: 'subject' },
	]);
});

test('one level up, the placed instance keeps its own cell and its feed takes the outer route', () => {
	const state = placedChild();
	marklessQualifyChildState(state, routes, 'c3:');
	marklessQualifyChildState(
		state,
		[{ name: 'picked', kind: 'graph-reference', graphNodeId: 'computed:list', path: ['value', '0'] }],
		'c1:',
	);
	expect(state.computed?.[0]?.dependencies?.[0]).toEqual({
		graphNodeId: 'c1:c3:prop:props',
		path: ['subject', 'name'],
	});
	expect(state.cells?.find((cell) => cell.graphNodeId === 'c1:c3:prop:props')?.follows).toEqual([
		{ graphNodeId: 'c1:state:picked', path: [], prop: 'subject' },
	]);
});

test('an instance nothing placed still routes its prop reads to the parent', () => {
	const state = placedChild();
	state.cells = state.cells?.map(({ follows: _follows, ...cell }) => cell);
	marklessQualifyChildState(state, routes, 'c3:');
	expect(state.computed?.[0]?.dependencies?.[0]).toEqual({ graphNodeId: 'state:picked', path: ['name'] });
});
