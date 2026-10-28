import { computed, state } from '@markless/core';

export default function FlipRows() @{
	let term = state('a');
	const rows = computed(() => (term ? [{ id: 'a', parts: [{ t: 'x', mark: term === 'a' }, { t: 'y', mark: term !== 'a' }] }] : []));

	<main>
		<input id="q" onInput={(event) => (term = (event.target as HTMLInputElement).value)} />
		<ul id="list">
			@for (const row of rows; key row.id) {
				<li>
					@for (const part of row.parts; key part.t) {
						@if (part.mark) {
							<mark>{part.t}</mark>
						} @else {
							<span>{part.t}</span>
						}
					}
				</li>
			}
		</ul>
	</main>
}
