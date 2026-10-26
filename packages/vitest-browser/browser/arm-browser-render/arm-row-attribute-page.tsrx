import { state } from '@markless/core';

export default function IfKeyedRowAttribute() @{
	let items = state([{ id: 'a' }, { id: 'b' }]);
	let open = state(true);
	<main>
		<button onClick={() => (open = !open)}>toggle</button>
		@if (open) {
			@for (const item of items; key item.id) {
				<p id={item.id}>{item.id}</p>
			}
		}
	</main>
}
