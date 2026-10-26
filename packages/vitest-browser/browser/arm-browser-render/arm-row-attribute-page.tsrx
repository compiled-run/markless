import { state } from '@markless/core';

export default function IfKeyedRowAttribute() @{
	let items = state([{ id: 'a' }, { id: 'b' }]);
	let open = state(true);
	let picked = state('none');
	<main>
		<button data-open onClick={() => (open = !open)}>toggle</button>
		<button data-add onClick={() => (items = [...items, { id: 'c' }])}>add</button>
		<output>{picked}</output>
		@if (open) {
			@for (const item of items; key item.id) {
				<p id={item.id} onClick={() => (picked = item.id)}>{item.id}</p>
			}
		}
	</main>
}
