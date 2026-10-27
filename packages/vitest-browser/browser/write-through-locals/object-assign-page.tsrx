import { state } from '@markless/core';

export function ObjectAssignPage() @{
	let user = state({ first: 'Ada', last: 'L' });
	let rows = state([{ id: 1, label: 'one' }, { id: 2, label: 'two' }]);

	<div>
		<output data-name>{user.first + ' ' + user.last}</output>
		<output data-label>{rows[1].label}</output>
		<button data-assign onClick={() => { Object.assign(user, { first: 'Q' }); }}>assign</button>
		<button data-assign-many onClick={() => { const patch = { first: 'R', last: 'S' }; Object.assign(user, patch, { last: 'T' }); }}>many</button>
		<button data-assign-row onClick={() => { const row = rows.find((r) => r.id === 2); if (row) Object.assign(row, { label: 'deux' }); }}>row</button>
	</div>
}
