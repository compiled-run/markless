import { state } from '@markless/core';

export default function NestedArmState() @{
	let outer = state(false);
	let inner = state(false);

	<section>
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
			</div>
		}
		<button data-outer onClick={() => (outer = !outer)}>Outer</button>
		<button data-inner onClick={() => (inner = !inner)}>Inner</button>
	</section>
}
