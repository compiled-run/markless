import { element, state } from '@markless/core';
import { installRowBehavior, rowsForOperation } from './keyed-row-behavior-counters.ts';

export function App() @{
	let entries = state([
		{ id: 'a', label: 'Alpha' },
		{ id: 'b', label: 'Beta' },
		{ id: 'c', label: 'Gamma' },
		{ id: 'd', label: 'Delta' },
	]);
	// One handle, one row host, N rows: a repeat binding is plural by definition,
	// so the declaration says so with an array type argument.
	const row = element<HTMLTableRowElement[]>();

	<main>
		<nav>
			<button data-operation="reuse" onClick={(event) => entries = rowsForOperation(event.target.dataset.operation)}>Reuse</button>
			<button data-operation="reorder" onClick={(event) => entries = rowsForOperation(event.target.dataset.operation)}>Reorder</button>
			<button data-operation="remove" onClick={(event) => entries = rowsForOperation(event.target.dataset.operation)}>Remove</button>
			<button data-operation="clear" onClick={(event) => entries = rowsForOperation(event.target.dataset.operation)}>Clear</button>
			<button data-operation="remount" onClick={(event) => entries = rowsForOperation(event.target.dataset.operation)}>Remount</button>
		</nav>
		<table>
			<tbody>
				@for (const entry of entries; key entry.id) {
					<tr el={row} attach={installRowBehavior(entry.id)}>
						<td>{entry.label}</td>
					</tr>
				}
			</tbody>
		</table>
	</main>
}
