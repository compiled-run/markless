import { state } from '@markless/core';

export default function Battery() @{
	let charge = state(80);

	<section>
		@switch (true) {
			@case charge > 50: {
				<p data-level>Good for hours</p>
			}
			@case charge > 15: {
				<p data-level>Low battery</p>
			}
			@default: {
				<p data-level>Charge now</p>
			}
		}
		<button data-use onClick={() => (charge -= 20)}>Use some</button>
		<button data-charge onClick={() => (charge = 100)}>Charge</button>
	</section>
}
