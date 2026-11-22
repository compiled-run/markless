import { state } from '@markless/core';

export default function NestedIf() @{
	let outer = state(false);
	let inner = state(false);
	let label = state('one');

	<main>
		<button data-outer onClick={() => (outer = !outer)}>Outer</button>
		<button data-inner onClick={() => (inner = !inner)}>Inner</button>
		<button data-label onClick={() => (label = label === 'one' ? 'two' : 'one')}>Label</button>
		@if (outer) {
			<div>
				<p data-text>{label}</p>
				@if (inner) {
					<span data-shown>yes</span>
				} @else {
					<span data-shown>no</span>
				}
			</div>
		}
	</main>
}
