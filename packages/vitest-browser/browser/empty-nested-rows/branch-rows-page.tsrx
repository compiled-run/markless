import { computed, state } from '@markless/core';

// A keyed list empty on the server whose nested rows are each an @if; typing fills it.
export default function BranchRows() @{
	let term = state('');
	const rows = computed(() => (term ? [{ id: 'a', parts: [{ t: 'x', mark: true }, { t: 'y', mark: false }] }] : []));

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
