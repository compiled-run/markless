import { computed, state } from '@markless/core';
import { answer } from '../matched-values/gates.ts';

export function ChainMarks() @{
	let region = state('north');
	const depot = computed(async () => {
		const at = region;
		return answer(`depot:${at}`, { id: `${at}-depot` });
	});
	const route = computed(async () => {
		const from = depot.id;
		return answer(`route:${from}`, { id: `${from}-route` });
	});
	const eta = computed(async () => {
		const along = route.id;
		return answer(`eta:${along}`, { id: `${along}-eta` });
	});

	<section>
		<button type="button" data-south onClick={() => (region = 'south')}>South</button>
		@try {
			<div data-board>
				<p data-depot>{depot.id}</p>
				<p data-route>{route.id}</p>
				<p data-eta>{eta.id}</p>
			</div>
		} @pending {
			<p data-pending>Loading</p>
		}
	</section>
}
