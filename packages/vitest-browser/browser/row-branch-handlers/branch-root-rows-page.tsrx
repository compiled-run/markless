import { state } from '@markless/core';

type Row = { readonly id: number; readonly name: string; readonly editing: boolean };

export default function BranchRootRowsPage() @{
	let rows = state<readonly Row[]>([
		{ id: 0, name: 'Ann', editing: false },
		{ id: 1, name: 'Bob', editing: false },
	]);
	let saved = state('none');
	<main>
		<output data-saved>{saved}</output>
		<table>
			<tbody>
				@for (const row of rows; key row.id) {
					@if (row.editing) {
						<tr class="editing">
							<td>{row.name}</td>
							<td>
								<button
									type="button"
									data-save={row.id}
									onClick={() => {
										saved = String(row.id);
										rows = rows.map((each) => (each.id === row.id ? { ...each, editing: false } : each));
									}}
								>
									Save
								</button>
							</td>
						</tr>
					} @else {
						<tr>
							<td>{row.name}</td>
							<td>
								<button
									type="button"
									data-edit={row.id}
									onClick={() => (rows = rows.map((each) => (each.id === row.id ? { ...each, editing: true } : each)))}
								>
									Edit
								</button>
							</td>
						</tr>
					}
				}
			</tbody>
		</table>
	</main>
}
