import { state } from '@markless/core';

export function Counter() @{
	let open = state(true);
	let count = state(1);

	<section>
		<button data-open onClick={() => (open = !open)}>Toggle</button>
		<button data-add onClick={() => (count = count + 1)}>Add</button>
		@if (open) {
			const label = count > 1 ? 'many' : 'one';
			<p data-label title={label}>{label}</p>
		} @else {
			const hidden = `hidden at ${count}`;
			<p data-hidden>{hidden}</p>
		}
	</section>
}
