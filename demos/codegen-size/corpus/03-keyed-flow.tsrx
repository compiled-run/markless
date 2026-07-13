import { state } from '@markless/core';
type Row = { id: number; label: string; score: number };
export function KeyedFlow() @{
	let rows = state<Row[]>([{ id: 1, label: 'alpha', score: 3 }, { id: 2, label: 'beta', score: 5 }]);
	<div><button onClick={() => { rows = [...rows, { id: rows.length + 1, label: 'next', score: rows.length }]; }}>Add</button><ul>@for (row of rows; key row.id) { <li data-row={row.id}><span>{row.label}</span><b>{row.score + 1}</b></li> }</ul></div>
}
