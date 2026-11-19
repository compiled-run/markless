import { state } from '@markless/core';

export default function ArmTags() @{
	let open = state(false);
	let rows = state([{ id: 'a', tags: ['x', 'y'] }, { id: 'b', tags: ['z'] }]);

	<main>
		<ul>
			@for (const row of rows; key row.id) {
				<li data-row={row.id}>
					@if (open) {
						<ol>
							@for (const tag of row.tags; index at; key at) {
								<li data-tag={`${row.id}${at}`} onClick={() => row.tags.push(tag)}>{tag}</li>
							}
						</ol>
					} @else {
						<span>none</span>
					}
				</li>
			}
		</ul>
		<button data-toggle onClick={() => (open = !open)}>toggle</button>
		<button data-add onClick={() => rows.push({ id: 'c', tags: ['w'] })}>add</button>
	</main>
}
