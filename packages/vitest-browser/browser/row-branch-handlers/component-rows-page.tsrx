import { state } from '@markless/core';

type Row = { readonly id: string; readonly name: string; readonly editing: boolean };

function EditRow({ row, onEdit, onSave }: { readonly row: Row; readonly onEdit: (id: string) => void; readonly onSave: (id: string) => void }) @{
	<tr>
		<td>{row.name}</td>
		<td>
			@if (row.editing) {
				<button type="button" data-save={row.id} onClick={() => onSave(row.id)}>Save</button>
			} @else {
				<button type="button" data-edit={row.id} onClick={() => onEdit(row.id)}>Edit</button>
			}
		</td>
	</tr>
}

export default function ComponentRowsPage() @{
	let saved = state('none');
	let rows = state<readonly Row[]>([{ id: 'a', name: 'Ann', editing: false }, { id: 'b', name: 'Bob', editing: false }]);
	<main>
		<output data-saved>{saved}</output>
		<table>
			<tbody>
				@for (const row of rows; key row.id) {
					<EditRow
						row={row}
						onEdit={(id) => (rows = rows.map((each) => (each.id === id ? { ...each, editing: true } : each)))}
						onSave={(id) => {
							saved = id;
							rows = rows.map((each) => (each.id === id ? { ...each, editing: false } : each));
						}}
					/>
				}
			</tbody>
		</table>
	</main>
}
