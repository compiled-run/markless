import { computed } from '@markless/core';
import { mapView } from './view.tsrx';
import { loadPoints } from './data.ts';

export function SharedMap() @{
	const units = computed(async () => loadPoints());
	const map = mapView();

	<section>
		@try {
			<figure
				data-map
				attach={(el) => {
					el.textContent = `${map.view.label} at ${map.view.zoom}: ${units.length} units`;
				}}
				onIdle={() => {}}
			></figure>
		} @pending {
			<p data-loading>Loading</p>
		}
	</section>
}
