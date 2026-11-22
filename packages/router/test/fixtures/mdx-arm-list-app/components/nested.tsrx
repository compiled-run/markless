import { state } from '@markless/core';

export default function Nested() @{
	let outer = state(false);
	let inner = state(false);
	let move = state('none');

	<section class="nested">
		@if (outer) {
			let a = state(0);

			<div>
				<button data-a onClick={() => a++}>{a}</button>
				@if (inner) {
					let b = state(0);

					<button data-b onClick={() => b++}>{b}</button>
				} @else {
					<p data-off>off</p>
				}
				@switch (move) {
					@case 'ember': {
						<p data-move>ember</p>
					}
					@default: {
						<p data-move>pick</p>
					}
				}
			</div>
		}
		<button data-outer onClick={() => (outer = !outer)}>Outer</button>
		<button data-inner onClick={() => (inner = !inner)}>Inner</button>
		<button data-ember onClick={() => (move = move === 'ember' ? 'none' : 'ember')}>Ember</button>
	</section>
}
