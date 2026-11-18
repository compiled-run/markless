import { computed, state } from '@markless/core';
import { loadLabel } from './stock';

export function App() @{
	let names = state(['north', 'south']);
	let tick = state(0);
	const status = computed(async () => loadLabel(`t${tick}`));

	<section data-multi-child>
		<button type="button" data-tick onClick={() => tick = tick + 1}>Tick</button>
		<button type="button" data-flip onClick={() => names = [...names].reverse()}>Flip</button>
		<ul>
			@for (const name of names; key name) {
				<li>
					@try {
						<span data-status>{name} {status.text}</span>
					} @pending {
						<small>waiting</small>
					}
				</li>
			}
		</ul>
	</section>
}
