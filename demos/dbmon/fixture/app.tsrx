import { state } from '@markless/core';
import { DB_COUNT, makeData, partialTick, reorder, type DatabaseRow } from './data.ts';

// Keyed-row expressions use row fields only. State begins with literals and
// the measured mount fills the table through the fill button's dispatch.
export function App() @{
	let rows = state<DatabaseRow[]>([]);
	let frame = state(1);
	let idBase = state(0);
	let sortDirection = state(1);

	<div class="dbmon-bench">
		<div class="actions">
			<button id="fill" type="button" onClick={() => { rows = makeData(idBase, frame); }}>fill</button>
			<button id="tick" type="button" onClick={() => { frame++; rows = makeData(idBase, frame); }}>tick</button>
			<button id="tick-partial" type="button" onClick={() => { frame++; rows = partialTick(rows, frame); }}>partial</button>
			<button id="remount" type="button" onClick={() => { frame++; idBase += DB_COUNT; rows = makeData(idBase, frame); }}>remount</button>
			<button id="sort" type="button" onClick={() => { sortDirection = -sortDirection; rows = reorder(rows, sortDirection); }}>sort</button>
		</div>
		<table class="dbmon"><tbody>
			@for (row of rows; key row.id) {
				<tr>
					<td class="dbname" data-value>{row.name}</td>
					<td class="count" data-value>{row.count}</td>
					<td class="query-0" data-value>{row.query0}</td>
					<td class="query-1" data-value>{row.query1}</td>
					<td class="query-2" data-value>{row.query2}</td>
					<td class="query-3" data-value>{row.query3}</td>
					<td class="query-4" data-value>{row.query4}</td>
				</tr>
			}
		</tbody></table>
	</div>
}
