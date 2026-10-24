import { state } from '@markless/core';

type Contact = { readonly id: number; readonly name: string; readonly email: string; readonly editing: boolean };

// The htmx.org edit-row demo's shape: each row IS an @if over its own editing flag, with request state read beside it.
export default function EditRowDemoPage() @{
	let rows = state<readonly Contact[]>([
		{ id: 0, name: 'Joe', email: 'joe@x.org', editing: false },
		{ id: 1, name: 'Angie', email: 'angie@x.org', editing: false },
	]);
	let requesting = state<readonly string[]>([]);
	let requests = state(0);
	<div>
		<output data-requests>{requests}</output>
		<table>
			<tbody>
				@for (const row of rows; key row.id) {
					@if (row.editing) {
						<tr class={requesting.includes(`row-${row.id}`) ? 'editing htmx-request' : 'editing'}>
							<td><input name="name" value={row.name} /></td>
							<td><input name="email" value={row.email} /></td>
							<td>
								<button
									class={requesting.includes(`save-${row.id}`) ? 'btn htmx-request' : 'btn'}
									data-save={row.id}
									onClick={(event) => {
										const contact = row;
										const key = `save-${contact.id}`;
										if (requesting.includes(key)) return;
										const inputs = (event.target as Element).closest('tr')!.querySelectorAll('input');
										const saved = { name: inputs[0]!.value, email: inputs[1]!.value };
										requesting = [...requesting, key];
										setTimeout(() => {
											requesting = requesting.filter((each) => each !== key);
											requests = requests + 1;
											rows = rows.map((each) => (each.id === contact.id ? { ...each, ...saved, editing: false } : each));
										}, 20);
									}}
								>
									Save
								</button>
							</td>
						</tr>
					} @else {
						<tr>
							<td data-name={row.id}>{row.name}</td>
							<td>{row.email}</td>
							<td>
								<button
									class={requesting.includes(`edit-${row.id}`) ? 'btn htmx-request' : 'btn'}
									data-edit={row.id}
									onClick={() => {
										const id = row.id;
										const key = `edit-${id}`;
										if (requesting.includes(key)) return;
										requesting = [...requesting, key];
										setTimeout(() => {
											requesting = requesting.filter((each) => each !== key);
											requests = requests + 1;
											rows = rows.map((each) => (each.id === id ? { ...each, editing: true } : each));
										}, 20);
									}}
								>
									Edit
								</button>
							</td>
						</tr>
					}
				}
			</tbody>
		</table>
	</div>
}
