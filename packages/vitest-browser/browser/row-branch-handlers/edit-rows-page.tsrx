import { state } from '@markless/core';

export default function EditRowsPage() @{
	let editing = state('');
	let saved = state('none');
	let rows = state([{ id: 'a', name: 'Ann' }, { id: 'b', name: 'Bob' }]);
	<main>
		<output data-saved>{saved}</output>
		<table>
			<tbody>
				@for (const row of rows; key row.id) {
					<tr data-row={row.id}>
						<td>{row.name}</td>
						<td>
							@if (editing === row.id) {
								<button type="button" data-save={row.id} onClick={() => { saved = row.id; editing = ''; }}>Save</button>
							} @else {
								<button type="button" data-edit={row.id} onClick={() => (editing = row.id)}>Edit</button>
							}
						</td>
					</tr>
				}
			</tbody>
		</table>
	</main>
}
