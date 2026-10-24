import { state } from '@markless/core';

export default function ProbePage() @{
	let editing = state('');
	let saved = state('none');
	let rows = state([{ id: 'a' }, { id: 'b' }]);
	<main>
		<output data-saved>{saved}</output>
		<output data-editing>{editing}</output>
		<ul>
			@for (const row of rows; key row.id) {
				<li>
					@if (editing === row.id) {
						<button type="button" data-save={row.id} onClick={() => (saved = 'save:' + row.id)}>Save</button>
					} @else {
						<button type="button" data-edit={row.id} onClick={() => { saved = 'edit:' + row.id; editing = row.id; }}>Edit</button>
					}
				</li>
			}
		</ul>
	</main>
}
