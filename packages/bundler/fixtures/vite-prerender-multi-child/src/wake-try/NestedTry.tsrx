import { computed, state } from '@markless/core';
import { loadLabel } from './stock';

export function App() @{
	let round = state(0);
	const outer = computed(async () => loadLabel(`outer${round}`));
	const inner = computed(async () => loadLabel(`inner${round}`));

	<main data-multi-child>
		<button type="button" data-again onClick={() => round = round + 1}>Again</button>
		@try {
			<section>
				<h4 data-outer>{outer.text}</h4>
				@try {
					<h5 data-inner>{inner.text}</h5>
				} @pending {
					<em data-inner-wait>Inner waiting</em>
				}
			</section>
		} @pending {
			<em data-outer-wait>Waiting</em>
		}
	</main>
}
